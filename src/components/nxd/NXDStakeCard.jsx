import { useState, useEffect } from 'react';
import { Lock, Wallet, Loader2, Timer, AlertTriangle, Clock } from 'lucide-react';
import { ethers } from 'ethers';
import { useNXD } from '../../hooks/NXDContext';
import { useWallet } from '../../hooks/WalletContext';
import { fmt, formatTimerHMS } from '../../utils/helpers';
import toast from 'react-hot-toast';

export default function NXDStakeCard() {
  const { nxdBal, vaultStats, stakeNXD, unstakeWithPenalty, requestWithdraw, completeWithdraw, claimETHRewards } = useNXD();
  const { connected, connectWallet } = useWallet();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [cooldownStr, setCooldownStr] = useState('');

  const hasWithdrawRequest = vaultStats.withdrawRequestAmount > 0n;
  const now = Math.floor(Date.now() / 1000);
  const cooldownReady = hasWithdrawRequest && vaultStats.withdrawRequestTimestamp > 0 && now >= vaultStats.withdrawRequestTimestamp;

  useEffect(() => {
    if (!hasWithdrawRequest || !vaultStats.withdrawRequestTimestamp) { setCooldownStr(''); return; }
    const tick = () => {
      const s = vaultStats.withdrawRequestTimestamp - Math.floor(Date.now() / 1000);
      if (s <= 0) setCooldownStr('Ready to withdraw');
      else setCooldownStr(formatTimerHMS(s));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [hasWithdrawRequest, vaultStats.withdrawRequestTimestamp]);

  const wrap = async (action, fn) => {
    setBusy(true); setBusyAction(action);
    try { await fn(); } catch (e) { toast.error((action === 'stake' ? 'Stake' : action === 'claim' ? 'Claim' : 'Withdraw') + ' failed: ' + (e.reason || e.message)); }
    finally { setBusy(false); setBusyAction(''); }
  };

  const handleStake = () => {
    if (!connected) { connectWallet(); return; }
    if (!amount || parseFloat(amount) <= 0) { toast.error('Enter an amount'); return; }
    wrap('stake', async () => { await stakeNXD(ethers.parseEther(amount)); setAmount(''); });
  };

  const handleUnstakePenalty = () => {
    if (!amount || parseFloat(amount) <= 0) { toast.error('Enter an amount'); return; }
    wrap('unstake-penalty', async () => { await unstakeWithPenalty(ethers.parseEther(amount)); setAmount(''); });
  };

  const handleRequestWithdraw = () => {
    if (!amount || parseFloat(amount) <= 0) { toast.error('Enter an amount'); return; }
    wrap('request-wd', async () => { await requestWithdraw(ethers.parseEther(amount)); setAmount(''); });
  };

  const handleCompleteWithdraw = () => wrap('complete-wd', completeWithdraw);
  const handleClaim = () => wrap('claim', claimETHRewards);

  return (
    <div className="card card-hover fade-up fade-up-3 nxd-card">
      <div className="card-header">
        <div className="card-icon nxd-icon-stake"><Lock size={20} color="white" /></div>
        <div>
          <div className="card-title">Stake NXDv2</div>
          <div className="card-desc">Stake NXDv2 to earn ETH rewards</div>
        </div>
      </div>

      {connected && (
        <div className="wallet-balance nxd-balance">
          <Wallet size={14} className="nxd-accent" />
          <span>Your NXDv2: <strong>{fmt(nxdBal)}</strong></span>
        </div>
      )}

      <div className="input-group">
        <div className="input-label">Amount</div>
        <input className="input-field nxd-input" type="text" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
        <div className="input-hint">
          <span>Balance: {fmt(nxdBal)} NXDv2</span>
          <span className="link" onClick={() => nxdBal > 0n && setAmount(ethers.formatEther(nxdBal))}>Max</span>
        </div>
      </div>

      {/* Stake button */}
      <button className={`btn-action nxd-btn-primary btn-shimmer${busy && busyAction === 'stake' ? ' btn-loading' : ''}`} style={{ marginBottom: 10 }} onClick={handleStake} disabled={!connected || busy}>
        {busy && busyAction === 'stake' ? <Loader2 size={16} className="spin" /> : <Lock size={16} />}
        {busy && busyAction === 'stake' ? 'Staking...' : connected ? 'Stake NXDv2' : 'Connect Wallet'}
      </button>

      {/* Unstake options */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className="btn-action nxd-btn-secondary" style={{ flex: 1, fontSize: 12, padding: '10px 6px' }} onClick={handleUnstakePenalty} disabled={!connected || busy || vaultStats.userStake === 0n}>
          {busy && busyAction === 'unstake-penalty' ? <Loader2 size={14} className="spin" /> : <AlertTriangle size={14} />}
          {busy && busyAction === 'unstake-penalty' ? ' Unstaking...' : ' Unstake (25% penalty)'}
        </button>
        <button className="btn-action nxd-btn-secondary" style={{ flex: 1, fontSize: 12, padding: '10px 6px' }} onClick={handleRequestWithdraw} disabled={!connected || busy || vaultStats.userStake === 0n}>
          {busy && busyAction === 'request-wd' ? <Loader2 size={14} className="spin" /> : <Clock size={14} />}
          {busy && busyAction === 'request-wd' ? ' Requesting...' : ' Request Withdraw (24h)'}
        </button>
      </div>

      {/* Pending withdrawal request */}
      {hasWithdrawRequest && (
        <div style={{ marginBottom: 12, padding: 14, background: 'var(--bg-deep)', border: '1px solid var(--amber-glow)', borderRadius: 'var(--radius)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pending Withdrawal</span>
            <span className="pending-unlock-timer"><Timer size={12} /> {cooldownStr}</span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--amber)', marginBottom: 8 }}>
            {fmt(vaultStats.withdrawRequestAmount)} NXDv2
          </div>
          <button className="btn-action nxd-btn-primary" style={{ padding: 10, fontSize: 13 }} onClick={handleCompleteWithdraw} disabled={!cooldownReady || busy}>
            {busy && busyAction === 'complete-wd' ? <Loader2 size={14} className="spin" /> : null}
            {busy && busyAction === 'complete-wd' ? ' Completing...' : cooldownReady ? 'Complete Withdrawal' : 'Waiting for cooldown...'}
          </button>
        </div>
      )}

      {/* Pending ETH Rewards */}
      <div style={{ marginBottom: 12, padding: 14, background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Pending ETH Rewards</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--green)' }}>{fmt(vaultStats.pendingRewards, 6)} ETH</div>
      </div>

      <button className="btn-action nxd-btn-primary btn-shimmer" onClick={handleClaim} disabled={!connected || busy || vaultStats.pendingRewards === 0n}>
        {busy && busyAction === 'claim' ? <Loader2 size={16} className="spin" /> : null}
        {busy && busyAction === 'claim' ? 'Claiming...' : 'Claim ETH Rewards'}
      </button>

      <div style={{ marginTop: 16 }}>
        <div className="stat-row">
          <span className="stat-label">Your Stake</span>
          <span className="stat-value">{fmt(vaultStats.userStake)} NXDv2</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Total Staked (Vault)</span>
          <span className="stat-value">{fmt(vaultStats.totalStaked)} NXDv2</span>
        </div>
      </div>

      <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-deep)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        <strong style={{ color: 'var(--text-secondary)' }}>Withdrawal options:</strong> Instant unstake burns 25% of your withdrawal as a penalty. Alternatively, request a withdrawal to start a 24h cooldown — after which you can withdraw the full amount with no penalty.
      </div>
    </div>
  );
}
