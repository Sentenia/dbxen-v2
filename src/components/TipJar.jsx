import { useState, useEffect, useRef, useCallback } from 'react';
import { ethers } from 'ethers';
import { ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { useWallet } from '../hooks/WalletContext';
import { CHAINS } from '../config/chains';
import { getEthUsd } from '../utils/price';

// Community tip jar — collects USDC/USDT toward the DexScreener logo listing.
// The fill level reflects the LIVE on-chain USDC+USDT balance of the community
// wallet (read from a dedicated Ethereum RPC, independent of the connected chain).
const JAR_ADDRESS = '0x0A946dB17243332C9754C6c59B31A67201F337c6'; // DXN community wallet
const GOAL_USD = 300;

// Ethereum mainnet stablecoins (both 6 decimals)
const TOKENS = {
  USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
  USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
};
// transfer() declared without a return value so it works for USDT (non-standard,
// returns nothing) as well as USDC.
const STABLE_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address,uint256)',
];
const TOKEN_LIST = ['USDC', 'USDT', 'ETH'];
// Presets are token-native: dollars for stablecoins, ETH for ETH.
const PRESETS = { USDC: [5, 10, 25], USDT: [5, 10, 25], ETH: [0.005, 0.01, 0.05] };

export default function TipJar() {
  const { chainKey, connected, connectWallet, switchChain, contractsRef } = useWallet();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('USDC');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [raised, setRaised] = useState(null); // USD number, null while loading
  const rootRef = useRef(null);
  const provRef = useRef(null);

  const fetchRaised = useCallback(async () => {
    const read = async (rpc) => {
      const p = new ethers.JsonRpcProvider(rpc);
      const usdc = new ethers.Contract(TOKENS.USDC.address, STABLE_ABI, p);
      const usdt = new ethers.Contract(TOKENS.USDT.address, STABLE_ABI, p);
      const [c, t, ethBal] = await Promise.all([
        usdc.balanceOf(JAR_ADDRESS), usdt.balanceOf(JAR_ADDRESS), p.getBalance(JAR_ADDRESS),
      ]);
      provRef.current = p;
      let total = Number(ethers.formatUnits(c, 6)) + Number(ethers.formatUnits(t, 6));
      // Add the ETH balance in USD (skipped if the price lookup fails).
      const ethUsd = await getEthUsd(Date.now());
      if (ethUsd) total += Number(ethers.formatEther(ethBal)) * ethUsd;
      return total;
    };
    try {
      setRaised(await read(CHAINS.ethereum.rpc));
    } catch {
      try { setRaised(await read(CHAINS.ethereum.rpcBackup)); }
      catch (e) { console.error('[TipJar] balance read failed', e); }
    }
  }, []);

  useEffect(() => {
    fetchRaised();
    const id = setInterval(fetchRaised, 30000);
    return () => clearInterval(id);
  }, [fetchRaised]);

  // close popover on outside tap/click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  const handleTip = async () => {
    if (!connected) { connectWallet(); return; }
    if (chainKey !== 'ethereum') {
      toast('Switch to Ethereum to tip');
      switchChain('ethereum');
      return;
    }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error('Enter an amount'); return; }
    const signer = contractsRef.current.signer;
    if (!signer) { toast.error('Wallet not ready'); return; }
    setBusy(true);
    try {
      let tx;
      if (token === 'ETH') {
        tx = await signer.sendTransaction({ to: JAR_ADDRESS, value: ethers.parseEther(amount) });
      } else {
        const tk = TOKENS[token];
        const c = new ethers.Contract(tk.address, STABLE_ABI, signer);
        tx = await c.transfer(JAR_ADDRESS, ethers.parseUnits(amount, tk.decimals));
      }
      toast('Sending tip…');
      await tx.wait();
      toast.success(`Thanks for the ${amount} ${token} tip! 🫙`);
      setAmount('');
      fetchRaised();
    } catch (e) {
      toast.error('Tip failed: ' + (e.reason || e.shortMessage || e.message));
    } finally {
      setBusy(false);
    }
  };

  const pct = raised == null ? 0 : Math.min(100, (raised / GOAL_USD) * 100);
  const fillY = (1 - pct / 100) * 22; // how far down to push the liquid (empty = pushed below)

  return (
    <div className="tipjar" ref={rootRef}>
      <button className="tipjar-btn" onClick={() => setOpen((o) => !o)} title="Community chest for DexScreener logo">
        <svg className="jar-svg" viewBox="0 0 24 32" width="26" height="34" aria-hidden="true">
          <defs>
            <linearGradient id="jarGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#34d399" />
              <stop offset="1" stopColor="#15803d" />
            </linearGradient>
            <clipPath id="jarInner">
              <path d="M5 8 h14 v16 a3 3 0 0 1 -3 3 h-8 a3 3 0 0 1 -3 -3 z" />
            </clipPath>
          </defs>
          {/* green liquid (clipped to the jar interior, slides up as it fills) */}
          <g clipPath="url(#jarInner)">
            <g style={{ transform: `translateY(${fillY}px)`, transition: 'transform 1.2s cubic-bezier(.4,1.3,.5,1)' }}>
              <rect x="4" y="7" width="16" height="24" fill="url(#jarGrad)" />
              <rect x="4" y="7" width="16" height="1.3" fill="#bbf7d0" opacity="0.9" />
            </g>
          </g>
          {/* glass body (transparent so the background shows through) */}
          <path d="M5 8 h14 v16 a3 3 0 0 1 -3 3 h-8 a3 3 0 0 1 -3 -3 z"
            fill="rgba(255,255,255,0.04)" stroke="rgba(190,240,255,0.55)" strokeWidth="1" />
          {/* lid */}
          <rect x="6" y="3" width="12" height="3.4" rx="1.5"
            fill="rgba(255,255,255,0.06)" stroke="rgba(190,240,255,0.55)" strokeWidth="1" />
        </svg>
        <span className="tipjar-cap">Community chest<br />for DexScreener logo</span>
      </button>

      {open && (
        <div className="tipjar-pop">
          <div className="tipjar-pop-title">🫙 Community Chest</div>
          <div className="tipjar-pop-sub">Help fund the DexScreener logo listing</div>

          <div className="tipjar-progress">
            <div className="tipjar-progress-bar"><span style={{ width: `${pct}%` }} /></div>
            <div className="tipjar-progress-label">
              {raised == null ? 'Loading…' : `$${Math.round(raised)} of $${GOAL_USD}`}
              <span>{raised == null ? '' : `${Math.round(pct)}%`}</span>
            </div>
          </div>

          <div className="tipjar-tokens">
            {TOKEN_LIST.map((t) => (
              <button key={t} className={`tipjar-token${token === t ? ' active' : ''}`} onClick={() => { setToken(t); setAmount(''); }}>{t}</button>
            ))}
          </div>

          <input className="input-field" type="text" inputMode="decimal" placeholder="0.00"
            value={amount} onChange={(e) => setAmount(e.target.value)} style={{ marginBottom: 8 }} />
          <div className="tipjar-presets">
            {PRESETS[token].map((p) => (
              <button key={p} className="tipjar-preset" onClick={() => setAmount(String(p))}>
                {token === 'ETH' ? `${p} ETH` : `$${p}`}
              </button>
            ))}
          </div>

          <button className="btn-action primary" style={{ width: '100%' }} onClick={handleTip} disabled={busy}>
            {busy ? 'Sending…' : !connected ? 'Connect Wallet' : chainKey !== 'ethereum' ? 'Switch to Ethereum' : `Tip ${token}`}
          </button>

          <a className="tipjar-link" href={`https://etherscan.io/address/${JAR_ADDRESS}`} target="_blank" rel="noopener noreferrer">
            View community wallet <ExternalLink size={11} />
          </a>
          <div className="tipjar-note">USDC, USDT &amp; ETH on Ethereum · sent directly to the community wallet</div>
        </div>
      )}
    </div>
  );
}
