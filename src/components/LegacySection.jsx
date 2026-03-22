import { useState, useEffect } from 'react';
import { Clock, Unlock, Gift, Coins, Banknote, Wallet, Timer } from 'lucide-react';
import { ethers } from 'ethers';
import { useWallet } from '../hooks/WalletContext';
import { fmt, formatTimerHMS, formatDeadline } from '../utils/helpers';
import toast from 'react-hot-toast';

export default function LegacySection() {
  const { chain, connected, legacyStats, legacyUnstake, legacyClaimDxn, legacyClaimFees } = useWallet();
  const [unstakeAmt, setUnstakeAmt] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingTimer, setPendingTimer] = useState('—');
  const [deadlineStr, setDeadlineStr] = useState('');
  const isDual = chain.dualMigration;

  useEffect(() => {
    if (!isDual) return;
    if (!legacyStats.pendingUnlockTs) return;
    const tick = () => {
      const s = legacyStats.pendingUnlockTs - Math.floor(Date.now() / 1000);
      setPendingTimer(s > 0 ? `Unlock in: ${formatTimerHMS(s)}` : 'Now withdrawable');
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isDual, legacyStats.pendingUnlockTs]);

  useEffect(() => {
    if (!isDual || !legacyStats.deadline || legacyStats.deadline === 0n) return;
    const tick = () => {
      const s = Number(legacyStats.deadline) - Math.floor(Date.now() / 1000);
      setDeadlineStr(formatDeadline(s));
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [isDual, legacyStats.deadline]);

  if (!isDual) return null;

  const doUnstake = async () => {
    if (!unstakeAmt || parseFloat(unstakeAmt) <= 0) { toast.error('Enter an amount'); return; }
    setBusy(true);
    try { await legacyUnstake(ethers.parseEther(unstakeAmt)); setUnstakeAmt(''); }
    catch (e) { toast.error('Failed: ' + (e.reason || e.message)); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Clock size={20} style={{ color: 'var(--amber)' }} />
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--amber)' }}>
          Legacy V2 (2.5M Batches) — Closing {deadlineStr && <span style={{ color: 'var(--red)' }}>({deadlineStr})</span>}
        </span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
        Withdraw your staked DXN and claim rewards from the old 2.5M-batch contract.
      </p>
      <div className="card-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        {/* Legacy Stake */}
        <div className="card" style={{ borderColor: 'var(--amber-glow)', opacity: 0.85 }}>
          <div className="card-header">
            <div className="card-icon" style={{ background: 'linear-gradient(135deg, var(--amber), #d97706)' }}><Unlock size={20} color="white" /></div>
            <div>
              <div className="card-title">Legacy Stake (old V2)</div>
              <div className="card-desc">Withdraw staked pDXNv2</div>
            </div>
          </div>
          {connected && (
            <div className="wallet-balance" style={{ borderColor: 'var(--amber)' }}>
              <Wallet size={14} style={{ color: 'var(--amber)' }} />
              <span>Old pDXNv2: <strong>{fmt(legacyStats.oldDxnBal)}</strong></span>
            </div>
          )}
          <div className="input-group">
            <div className="input-label">Amount to Unstake</div>
            <input className="input-field" type="text" placeholder="0.00" value={unstakeAmt} onChange={e => setUnstakeAmt(e.target.value)} />
            <div className="input-hint">
              <span>Withdrawable: {fmt(legacyStats.withdrawable)} DXN</span>
              <span className="link" onClick={() => legacyStats.withdrawable > 0n && setUnstakeAmt(ethers.formatEther(legacyStats.withdrawable))}>Max</span>
            </div>
          </div>
          <button className="btn-action secondary" onClick={doUnstake} disabled={!connected || busy || legacyStats.withdrawable === 0n}>
            Unstake from Legacy
          </button>
          <div style={{ marginTop: 12 }}>
            <div className="stat-row"><span className="stat-label">Your Legacy Stake</span><span className="stat-value">{fmt(legacyStats.totalStake)} DXN</span></div>
            {legacyStats.pendingStake > 0n && (
              <>
                <div className="stat-row"><span className="stat-label">⏳ Pending</span><span className="stat-value" style={{ color: 'var(--amber)' }}>{fmt(legacyStats.pendingStake)} DXN</span></div>
                <div className="stat-row"><span className="stat-label" /><span className="pending-unlock-timer"><Timer size={12} /> {pendingTimer}</span></div>
              </>
            )}
            <div className="stat-row"><span className="stat-label">Withdrawable</span><span className="stat-value">{fmt(legacyStats.withdrawable)} DXN</span></div>
          </div>
        </div>

        {/* Legacy Rewards */}
        <div className="card" style={{ borderColor: 'var(--amber-glow)', opacity: 0.85 }}>
          <div className="card-header">
            <div className="card-icon" style={{ background: 'linear-gradient(135deg, var(--amber), #d97706)' }}><Gift size={20} color="white" /></div>
            <div>
              <div className="card-title">Legacy Rewards (old V2)</div>
              <div className="card-desc">Claim remaining rewards</div>
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <div className="stat-row"><span className="stat-label">Unclaimed DXN</span><span className="stat-value green">{fmt(legacyStats.unclaimedDxn)}</span></div>
            <div className="stat-row"><span className="stat-label">Unclaimed PLS Fees</span><span className="stat-value green">{fmt(legacyStats.unclaimedFees, 6)} PLS</span></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button className="btn-action primary" style={{ background: 'var(--amber)' }} onClick={async () => { setBusy(true); try { await legacyClaimDxn(); } catch (e) { toast.error(e.reason || e.message); } setBusy(false); }} disabled={!connected || busy || legacyStats.unclaimedDxn === 0n}>
              <Coins size={16} /> Claim Legacy DXN
            </button>
            <button className="btn-action secondary" onClick={async () => { setBusy(true); try { await legacyClaimFees(); } catch (e) { toast.error(e.reason || e.message); } setBusy(false); }} disabled={!connected || busy || legacyStats.unclaimedFees === 0n}>
              <Banknote size={16} /> Claim Legacy PLS Fees
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
