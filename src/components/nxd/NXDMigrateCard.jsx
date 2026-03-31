import { useState, useEffect } from 'react';
import { ArrowLeftRight, ArrowDown, Timer } from 'lucide-react';
import { ethers } from 'ethers';
import { useNXD } from '../../hooks/NXDContext';
import { useWallet } from '../../hooks/WalletContext';
import { fmt, formatDeadline, shortAddr } from '../../utils/helpers';
import { NXD_CONTRACTS } from '../../config/nxd';
import toast from 'react-hot-toast';

export default function NXDMigrateCard() {
  const { oldNxdBal, migrationStats, migrateOldNXD } = useNXD();
  const { connected, connectWallet } = useWallet();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [deadlineStr, setDeadlineStr] = useState('—');
  const [deadlineColor, setDeadlineColor] = useState('var(--text-muted)');

  useEffect(() => {
    if (!migrationStats.deadline) {
      setDeadlineStr('No deadline'); setDeadlineColor('var(--text-muted)'); return;
    }
    const tick = () => {
      const s = migrationStats.deadline - Math.floor(Date.now() / 1000);
      if (s <= 0) { setDeadlineStr('CLOSED'); setDeadlineColor('var(--red)'); }
      else { setDeadlineStr(formatDeadline(s)); setDeadlineColor('var(--amber)'); }
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [migrationStats.deadline]);

  const handleMigrate = async () => {
    if (!connected) { connectWallet(); return; }
    if (!amount || parseFloat(amount) <= 0) { toast.error('Enter an amount'); return; }
    setBusy(true);
    try { await migrateOldNXD(ethers.parseEther(amount)); setAmount(''); }
    catch (e) { toast.error('Migration failed: ' + (e.reason || e.message)); }
    finally { setBusy(false); }
  };

  return (
    <div className="bridge-card fade-up nxd-card" style={{ borderColor: 'var(--amber-glow)' }}>
      <div className="card-header" style={{ marginBottom: 24 }}>
        <div className="card-icon nxd-icon-mint"><ArrowLeftRight size={20} color="white" /></div>
        <div>
          <div className="card-title">NXD Migration</div>
          <div className="card-desc">Migrate old NXD to NXDv2</div>
        </div>
      </div>

      <div className="bridge-token">
        <div className="bridge-token-icon old">v1</div>
        <div>
          <div className="bridge-token-name">NXD (Old)</div>
          <div className="bridge-token-sub">{shortAddr(NXD_CONTRACTS.OldNXD)}</div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{fmt(oldNxdBal)}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Balance</div>
        </div>
      </div>

      <div className="bridge-arrow" style={{ color: 'var(--amber)' }}><ArrowDown size={24} /></div>

      <div className="bridge-token" style={{ borderColor: 'var(--amber-glow)' }}>
        <div className="bridge-token-icon" style={{ background: 'var(--amber)', color: 'var(--bg-deep)', fontWeight: 800, fontSize: 12 }}>v2</div>
        <div>
          <div className="bridge-token-name">NXDv2 (New)</div>
          <div className="bridge-token-sub">{shortAddr(NXD_CONTRACTS.NXDv2Token)}</div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{amount && parseFloat(amount) > 0 ? parseFloat(amount).toLocaleString('en-US', { maximumFractionDigits: 4 }) : '0'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>You Receive</div>
        </div>
      </div>

      <div className="bridge-rate">Swap rate: <span>1 NXD = 1 NXDv2</span></div>

      <div className="input-group">
        <div className="input-label">Amount to Migrate</div>
        <input className="input-field nxd-input" type="text" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
        <div className="input-hint">
          <span>Old NXD: {fmt(oldNxdBal)}</span>
          <span className="link" onClick={() => oldNxdBal > 0n && setAmount(ethers.formatEther(oldNxdBal))}>Max</span>
        </div>
      </div>

      <button className="btn-action nxd-btn-primary" style={{ marginBottom: 16 }} onClick={handleMigrate} disabled={busy}>
        <ArrowLeftRight size={16} />
        {busy ? 'Migrating...' : connected ? 'Migrate NXD → NXDv2' : 'Connect Wallet to Migrate'}
      </button>

      <div className="bridge-stats">
        <div className="bridge-stat-item">
          <div className="bridge-stat-icon"><ArrowLeftRight size={16} style={{ color: 'var(--green)' }} /></div>
          <div>
            <div className="bridge-stat-label">Total Migrated</div>
            <div className="bridge-stat-value">{fmt(migrationStats.totalSwapped)} NXD</div>
          </div>
        </div>
        <div className="bridge-stat-item">
          <div className="bridge-stat-icon"><Timer size={16} style={{ color: 'var(--amber)' }} /></div>
          <div>
            <div className="bridge-stat-label">Deadline</div>
            <div className="bridge-stat-value" style={{ color: deadlineColor }}>{deadlineStr}</div>
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', fontSize: 12, color: migrationStats.active ? 'var(--green)' : 'var(--red)', fontWeight: 600, marginTop: 8 }}>
        Status: {migrationStats.active ? 'Active' : 'Inactive'}
      </div>
    </div>
  );
}
