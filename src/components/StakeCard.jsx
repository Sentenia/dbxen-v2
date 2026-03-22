import { useState, useEffect } from 'react';
import { Lock, Wallet, Timer } from 'lucide-react';
import { ethers } from 'ethers';
import { useWallet } from '../hooks/WalletContext';
import { fmt, formatTimerHMS } from '../utils/helpers';
import toast from 'react-hot-toast';

export default function StakeCard() {
  const { chain, connected, dxnBal, userStats, protocolStats, stakeTokens, unstakeTokens } = useWallet();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingTimer, setPendingTimer] = useState('—');

  useEffect(() => {
    if (!userStats.pendingUnlockTs) return;
    const tick = () => {
      const s = userStats.pendingUnlockTs - Math.floor(Date.now() / 1000);
      setPendingTimer(s > 0 ? `Unlock in: ${formatTimerHMS(s)}` : 'Now withdrawable');
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [userStats.pendingUnlockTs]);

  const handleStake = async () => {
    if (!amount || parseFloat(amount) <= 0) { toast.error('Enter an amount'); return; }
    setBusy(true);
    try { await stakeTokens(ethers.parseEther(amount)); setAmount(''); }
    catch (e) { toast.error('Stake failed: ' + (e.reason || e.message)); }
    finally { setBusy(false); }
  };

  const handleUnstake = async () => {
    if (!amount || parseFloat(amount) <= 0) { toast.error('Enter an amount'); return; }
    setBusy(true);
    try { await unstakeTokens(ethers.parseEther(amount)); setAmount(''); }
    catch (e) { toast.error('Unstake failed: ' + (e.reason || e.message)); }
    finally { setBusy(false); }
  };

  return (
    <div className="card card-hover fade-up fade-up-3">
      <div className="card-header">
        <div className="card-icon stake"><Lock size={20} color="white" /></div>
        <div>
          <div className="card-title">Stake DXN</div>
          <div className="card-desc">Stake DXN to earn {chain.native} protocol fees</div>
        </div>
      </div>

      {connected && (
        <div className="wallet-balance">
          <Wallet size={14} style={{ color: 'var(--cyan)' }} />
          <span>Your DXNv2: <strong>{fmt(dxnBal)}</strong></span>
        </div>
      )}

      <div className="input-group">
        <div className="input-label">Amount to Stake</div>
        <input className="input-field" type="text" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
        <div className="input-hint">
          <span>Balance: {fmt(dxnBal)} DXN</span>
          <span className="link" onClick={() => dxnBal > 0n && setAmount(ethers.formatEther(dxnBal))}>Max</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn-action primary" style={{ flex: 1 }} onClick={handleStake} disabled={!connected || busy}>
          {busy ? 'Processing...' : 'Stake'}
        </button>
        <button className="btn-action secondary" style={{ flex: 1 }} onClick={handleUnstake} disabled={!connected || busy}>Unstake</button>
      </div>

      <div style={{ marginTop: 16 }}>
        <div className="stat-row">
          <span className="stat-label">Your Stake</span>
          <span className="stat-value">{fmt(userStats.totalStake)} DXN</span>
        </div>
        {userStats.pendingStake > 0n && (
          <>
            <div className="stat-row">
              <span className="stat-label">⏳ Pending (unlocks next cycle)</span>
              <span className="stat-value" style={{ color: 'var(--amber)' }}>{fmt(userStats.pendingStake)} DXN</span>
            </div>
            <div className="stat-row">
              <span className="stat-label" />
              <span className="pending-unlock-timer"><Timer size={12} /> {pendingTimer}</span>
            </div>
          </>
        )}
        <div className="stat-row">
          <span className="stat-label">Withdrawable</span>
          <span className="stat-value">{fmt(userStats.withdrawable)} DXN</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Est. APY (24h)</span>
          <span className="stat-value green">{protocolStats.apy ? protocolStats.apy + '%' : '—'}</span>
        </div>
      </div>
    </div>
  );
}
