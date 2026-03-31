import { useState } from 'react';
import { Lock, Wallet, Loader2 } from 'lucide-react';
import { ethers } from 'ethers';
import { useNXD } from '../../hooks/NXDContext';
import { useWallet } from '../../hooks/WalletContext';
import { fmt } from '../../utils/helpers';
import toast from 'react-hot-toast';

export default function NXDStakeCard() {
  const { nxdBal, vaultStats, stakeNXD, unstakeNXD, claimETHRewards } = useNXD();
  const { connected, connectWallet } = useWallet();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState('');

  const handleStake = async () => {
    if (!connected) { connectWallet(); return; }
    if (!amount || parseFloat(amount) <= 0) { toast.error('Enter an amount'); return; }
    setBusy(true); setBusyAction('stake');
    try { await stakeNXD(ethers.parseEther(amount)); setAmount(''); }
    catch (e) { toast.error('Stake failed: ' + (e.reason || e.message)); }
    finally { setBusy(false); setBusyAction(''); }
  };

  const handleUnstake = async () => {
    if (!amount || parseFloat(amount) <= 0) { toast.error('Enter an amount'); return; }
    setBusy(true); setBusyAction('unstake');
    try { await unstakeNXD(ethers.parseEther(amount)); setAmount(''); }
    catch (e) { toast.error('Unstake failed: ' + (e.reason || e.message)); }
    finally { setBusy(false); setBusyAction(''); }
  };

  const handleClaim = async () => {
    setBusy(true); setBusyAction('claim');
    try { await claimETHRewards(); }
    catch (e) { toast.error('Claim failed: ' + (e.reason || e.message)); }
    finally { setBusy(false); setBusyAction(''); }
  };

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

      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <button className="btn-action nxd-btn-primary" style={{ flex: 1 }} onClick={handleStake} disabled={!connected || busy}>
          {busy && busyAction === 'stake' ? <Loader2 size={16} className="spin" /> : null}
          {busy && busyAction === 'stake' ? 'Staking...' : 'Stake'}
        </button>
        <button className="btn-action nxd-btn-secondary" style={{ flex: 1 }} onClick={handleUnstake} disabled={!connected || busy}>
          {busy && busyAction === 'unstake' ? 'Unstaking...' : 'Unstake'}
        </button>
      </div>

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
        Note: 24h cooldown on withdrawals. Early withdrawal incurs a 25% penalty.
      </div>
    </div>
  );
}
