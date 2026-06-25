import { useState, useEffect, useRef, useCallback } from 'react';
import { ethers } from 'ethers';
import { ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import { useWallet } from '../hooks/WalletContext';
import { CHAINS } from '../config/chains';
import { getNativeUsd } from '../utils/price';

// Community treasure chest — collects donations toward the DexScreener logo listing.
// Works on every supported chain: you donate the chain's native coin (ETH/POL/BNB/…)
// or its USDC/USDT, sent to the community wallet (same address on every EVM chain).
// The fill bar sums the wallet's holdings across ALL chains, in USD, vs the goal.
const JAR_ADDRESS = '0x0A946dB17243332C9754C6c59B31A67201F337c6'; // DXN community wallet
const GOAL_USD = 300;
const PRESETS = [5, 10, 25]; // USD

// Per-chain stablecoins — addresses + decimals VERIFIED on-chain (BNB's are 18-dec).
// Chains not listed (EthereumPoW, PulseChain) are native-only.
const STABLES = {
  ethereum:  { USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },  USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 } },
  polygon:   { USDC: { address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6 },  USDT: { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 } },
  bsc:       { USDC: { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 }, USDT: { address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 } },
  avalanche: { USDC: { address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', decimals: 6 },  USDT: { address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', decimals: 6 } },
  base:      { USDC: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },  USDT: { address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6 } },
  optimism:  { USDC: { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6 },  USDT: { address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6 } },
};
// transfer() declared without a return value so it also works for USDT-style tokens.
const STABLE_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address,uint256)',
];

const provCache = {};
function provFor(key) {
  if (!provCache[key]) provCache[key] = new ethers.JsonRpcProvider(CHAINS[key].rpc, undefined, { staticNetwork: true });
  return provCache[key];
}

// "$5 worth" → token amount string (native uses live price; stablecoins are 1:1).
function usdToAmount(usd, isNative, nativeUsd) {
  if (!isNative) return String(usd);
  if (!nativeUsd) return '';
  const v = usd / nativeUsd;
  return String(parseFloat(v < 1 ? v.toPrecision(2) : v.toFixed(v < 100 ? 3 : 2)));
}

export default function TipJar() {
  const { chain, chainKey, connected, connectWallet, contractsRef } = useWallet();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('NATIVE'); // 'NATIVE' | 'USDC' | 'USDT'
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [raised, setRaised] = useState(null);   // total USD across all chains
  const [nativeUsd, setNativeUsd] = useState(null); // connected chain's native price
  const rootRef = useRef(null);

  const stables = STABLES[chainKey] || {};
  const tokenList = ['NATIVE', ...Object.keys(stables)];
  const symbolOf = (t) => (t === 'NATIVE' ? chain.native : t);

  // Sum the community wallet's holdings across every chain, in USD.
  const fetchRaised = useCallback(async () => {
    const now = Date.now();
    const totals = await Promise.all(Object.keys(CHAINS).map(async (k) => {
      try {
        const p = provFor(k);
        const st = STABLES[k] || {};
        const stKeys = Object.keys(st);
        const [nativeBal, natUsd, ...stBals] = await Promise.all([
          p.getBalance(JAR_ADDRESS).catch(() => 0n),
          getNativeUsd(k, now),
          ...stKeys.map((s) => new ethers.Contract(st[s].address, STABLE_ABI, p).balanceOf(JAR_ADDRESS).catch(() => 0n)),
        ]);
        let usd = 0;
        if (natUsd) usd += Number(ethers.formatEther(nativeBal)) * natUsd;
        stKeys.forEach((s, i) => { usd += Number(ethers.formatUnits(stBals[i], st[s].decimals)); });
        return usd;
      } catch { return 0; }
    }));
    setRaised(totals.reduce((a, b) => a + b, 0));
  }, []);

  // One fetch on mount so the chest icon shows a current fill level.
  useEffect(() => { fetchRaised(); }, [fetchRaised]);

  // Donations are rare, so don't poll all 8 chains in the background. Only keep
  // it live while the popover is open (and we always refetch after a donation).
  useEffect(() => {
    if (!open) return;
    fetchRaised();
    const id = setInterval(fetchRaised, 60000);
    return () => clearInterval(id);
  }, [open, fetchRaised]);

  // Reset the picker when the chain changes (token availability + native symbol differ).
  useEffect(() => {
    setToken('NATIVE');
    setAmount('');
    let alive = true;
    getNativeUsd(chainKey, Date.now()).then((v) => { if (alive) setNativeUsd(v); });
    return () => { alive = false; };
  }, [chainKey]);

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

  const handleDonate = async () => {
    if (!connected) { connectWallet(); return; }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error('Enter an amount'); return; }
    const signer = contractsRef.current.signer;
    if (!signer) { toast.error('Wallet not ready'); return; }
    setBusy(true);
    try {
      let tx;
      if (token === 'NATIVE') {
        tx = await signer.sendTransaction({ to: JAR_ADDRESS, value: ethers.parseEther(amount) });
      } else {
        const st = stables[token];
        if (!st) { toast.error(`${token} not available on ${chain.name}`); setBusy(false); return; }
        const c = new ethers.Contract(st.address, STABLE_ABI, signer);
        tx = await c.transfer(JAR_ADDRESS, ethers.parseUnits(amount, st.decimals));
      }
      toast('Sending donation…');
      await tx.wait();
      toast.success(`Thanks for the ${amount} ${symbolOf(token)} donation! 💰`);
      setAmount('');
      fetchRaised();
    } catch (e) {
      toast.error('Donation failed: ' + (e.reason || e.shortMessage || e.message));
    } finally {
      setBusy(false);
    }
  };

  const pct = raised == null ? 0 : Math.min(100, (raised / GOAL_USD) * 100);
  const fillY = (1 - pct / 100) * 13; // how far down to push the gold (empty = below the chest floor)
  const nativePresetsReady = token !== 'NATIVE' || !!nativeUsd;

  return (
    <div className="tipjar" ref={rootRef}>
      <button className="tipjar-btn" onClick={() => setOpen((o) => !o)} title="Community chest for DexScreener logo">
        <svg className="jar-svg" viewBox="0 0 30 26" width="30" height="26" aria-hidden="true">
          <defs>
            <linearGradient id="chestGold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffe082" />
              <stop offset="1" stopColor="#e29400" />
            </linearGradient>
            <linearGradient id="chestWood" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#8a5a2b" />
              <stop offset="1" stopColor="#5e3a17" />
            </linearGradient>
            <clipPath id="chestInner">
              <path d="M4.5 12 H25.5 V20.3 Q25.5 22.6 23.3 22.6 H6.7 Q4.5 22.6 4.5 20.3 Z" />
            </clipPath>
          </defs>
          {/* domed lid */}
          <path d="M4 12 V11 Q4 4 15 4 Q26 4 26 11 V12 Z" fill="url(#chestWood)" stroke="#3e2512" strokeWidth="0.8" />
          {/* gold filling the body (clipped to the interior, rises as it fills) */}
          <g clipPath="url(#chestInner)">
            <g style={{ transform: `translateY(${fillY}px)`, transition: 'transform 1.2s cubic-bezier(.4,1.3,.5,1)' }}>
              <rect x="4" y="12" width="22" height="13" fill="url(#chestGold)" />
              <rect x="4" y="12" width="22" height="1" fill="#fff6cf" opacity="0.9" />
            </g>
          </g>
          {/* body frame */}
          <path d="M4.5 12 H25.5 V20.3 Q25.5 22.6 23.3 22.6 H6.7 Q4.5 22.6 4.5 20.3 Z"
            fill="none" stroke="url(#chestWood)" strokeWidth="2.2" />
          <path d="M4.5 12 H25.5 V20.3 Q25.5 22.6 23.3 22.6 H6.7 Q4.5 22.6 4.5 20.3 Z"
            fill="none" stroke="#3e2512" strokeWidth="0.8" />
          {/* brass band where lid meets body */}
          <rect x="3.4" y="10.6" width="23.2" height="2.2" rx="0.6" fill="#cda44d" stroke="#3e2512" strokeWidth="0.5" />
          {/* lock plate + keyhole */}
          <rect x="12.6" y="13" width="4.8" height="5" rx="0.8" fill="#cda44d" stroke="#3e2512" strokeWidth="0.6" />
          <circle cx="15" cy="15.1" r="0.85" fill="#3e2512" />
          <rect x="14.6" y="15.1" width="0.8" height="2" fill="#3e2512" />
        </svg>
        <span className="tipjar-cap">Community chest<br />for DexScreener logo</span>
      </button>

      {open && (
        <div className="tipjar-pop">
          <div className="tipjar-pop-title">💰 Community Chest</div>
          <div className="tipjar-pop-sub">Help fund the DexScreener logo listing</div>

          <div className="tipjar-progress">
            <div className="tipjar-progress-bar"><span style={{ width: `${pct}%` }} /></div>
            <div className="tipjar-progress-label">
              {raised == null ? 'Loading…' : `$${Math.round(raised)} of $${GOAL_USD}`}
              <span>{raised == null ? '' : `${Math.round(pct)}%`}</span>
            </div>
          </div>

          <div className="tipjar-tokens">
            {tokenList.map((t) => (
              <button key={t} className={`tipjar-token${token === t ? ' active' : ''}`} onClick={() => { setToken(t); setAmount(''); }}>{symbolOf(t)}</button>
            ))}
          </div>

          <input className="input-field" type="text" inputMode="decimal" placeholder="0.00"
            value={amount} onChange={(e) => setAmount(e.target.value)} style={{ marginBottom: 8 }} />
          <div className="tipjar-presets">
            {PRESETS.map((p) => (
              <button key={p} className="tipjar-preset" disabled={!nativePresetsReady}
                onClick={() => setAmount(usdToAmount(p, token === 'NATIVE', nativeUsd))}>${p}</button>
            ))}
          </div>

          <button className="btn-action primary" style={{ width: '100%' }} onClick={handleDonate} disabled={busy}>
            {busy ? 'Sending…' : !connected ? 'Connect Wallet' : `Donate ${symbolOf(token)}`}
          </button>

          <a className="tipjar-link" href={`${chain.explorer}/address/${JAR_ADDRESS}`} target="_blank" rel="noopener noreferrer">
            View community wallet <ExternalLink size={11} />
          </a>
          <div className="tipjar-note">Donate on {chain.name} · bar shows the total raised across all chains</div>
        </div>
      )}
    </div>
  );
}
