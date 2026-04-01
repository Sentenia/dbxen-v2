import { useState, useEffect } from 'react';
import { Zap, Wallet, Loader2 } from 'lucide-react';
import { ethers } from 'ethers';
import { useNXD } from '../../hooks/NXDContext';
import { useWallet } from '../../hooks/WalletContext';
import { fmt, formatTimer } from '../../utils/helpers';
import toast from 'react-hot-toast';

export default function NXDMintCard() {
  const { protocolStats, dxnBal, userReferral, deposit } = useNXD();
  const { connected, connectWallet } = useWallet();
  const [amount, setAmount] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [timerStr, setTimerStr] = useState('—');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) setReferralCode(ref);
  }, []);

  useEffect(() => {
    if (!protocolStats.endTime) return;
    const tick = () => {
      const s = protocolStats.endTime - Math.floor(Date.now() / 1000);
      setTimerStr(s > 0 ? formatTimer(s) : 'CSP ended');
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [protocolStats.endTime]);

  const rateFloat = protocolStats.currentRate > 0n ? parseFloat(ethers.formatEther(protocolStats.currentRate)) : 0;
  const amountFloat = amount ? parseFloat(amount) : 0;
  const receiveEstimate = rateFloat > 0 ? (amountFloat * rateFloat).toFixed(4) : '0';

  // CSP time progress
  const now = Math.floor(Date.now() / 1000);
  const totalDuration = protocolStats.endTime - protocolStats.startTime;
  const elapsed = now - protocolStats.startTime;
  const progressPct = totalDuration > 0 ? Math.min(Math.max((elapsed / totalDuration) * 100, 0), 100) : 0;

  const handleMint = async () => {
    if (!connected) { connectWallet(); return; }
    if (!amount || amountFloat <= 0) { toast.error('Enter an amount'); return; }
    setBusy(true);
    try {
      await deposit(ethers.parseEther(amount), referralCode ? parseInt(referralCode) : 0);
      setAmount('');
    } catch (e) {
      toast.error('Mint failed: ' + (e.reason || e.message));
    } finally { setBusy(false); }
  };

  return (
    <div className="card card-hover fade-up fade-up-2 nxd-card">
      <div className="card-header">
        <div className="card-icon nxd-icon-mint"><Zap size={20} color="white" /></div>
        <div>
          <div className="card-title">Mint NXDv2</div>
          <div className="card-desc">Deposit DXNv2 during CSP to mint NXDv2</div>
        </div>
      </div>

      {connected && (
        <div className="wallet-balance nxd-balance">
          <Wallet size={14} className="nxd-accent" />
          <span>Your DXNv2: <strong>{fmt(dxnBal)}</strong></span>
        </div>
      )}

      {/* CSP Progress */}
      <div style={{ marginBottom: 16, padding: 14, background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
          <span style={{ color: 'var(--text-muted)' }}>CSP Time Remaining</span>
          <span style={{ color: 'var(--amber)', fontWeight: 600 }}>{timerStr}</span>
        </div>
        <div style={{ width: '100%', height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: 'linear-gradient(90deg, var(--amber), #d97706)', borderRadius: 3, transition: 'width 1s', width: `${progressPct}%` }} />
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
          Current Rate: <span style={{ color: 'var(--amber)', fontWeight: 600 }}>{rateFloat.toFixed(4)} NXD/DXN</span>
        </div>
      </div>

      <div className="input-group">
        <div className="input-label">DXNv2 Amount</div>
        <input className="input-field nxd-input" type="text" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
        <div className="input-hint">
          <span>Balance: {fmt(dxnBal)} DXNv2</span>
          <span className="link" onClick={() => dxnBal > 0n && setAmount(ethers.formatEther(dxnBal))}>Max</span>
        </div>
      </div>

      <div style={{ marginBottom: 16, padding: 12, background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>You&apos;ll receive</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--amber)' }}>{receiveEstimate} NXDv2</div>
      </div>

      <div className="input-group">
        <div className="input-label">Referral Code (optional)</div>
        <input className="input-field nxd-input" type="text" placeholder="0" value={referralCode} onChange={e => setReferralCode(e.target.value)} />
      </div>

      <button className={`btn-action nxd-btn-primary btn-shimmer${busy ? ' btn-loading' : ''}`} onClick={handleMint} disabled={busy}>
        {busy ? <Loader2 size={16} className="spin" /> : <Zap size={16} />}
        {busy ? 'Minting...' : connected ? 'Mint NXDv2' : 'Connect Wallet to Mint'}
      </button>

      <div style={{ marginTop: 16 }}>
        <div className="stat-row">
          <span className="stat-label">Your Total Minted</span>
          <span className="stat-value">{fmt(userReferral.totalMinted)} NXD</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Your Bonus</span>
          <span className="stat-value" style={{ color: 'var(--green)' }}>{fmt(userReferral.totalBonus)} NXD</span>
        </div>
      </div>
    </div>
  );
}
