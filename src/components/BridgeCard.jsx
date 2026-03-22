import { useState, useEffect } from 'react';
import { ArrowLeftRight, ArrowDown, ArrowRightLeft, Vault, Timer, Flame } from 'lucide-react';
import { ethers } from 'ethers';
import { useWallet } from '../hooks/WalletContext';
import { fmt, shortAddr, formatDeadline } from '../utils/helpers';
import AnimatedNumber from './AnimatedNumber';
import Skeleton from './Skeleton';
import toast from 'react-hot-toast';

export default function BridgeCard() {
  const { chain, connected, connectWallet, oldDxnBal, oldV2DxnBal, dxnBal, bridgeStats, migrate } = useWallet();
  const [amount, setAmount] = useState('');
  const [bridgeSource, setBridgeSource] = useState('v1');
  const [busy, setBusy] = useState(false);
  const [deadlineStr, setDeadlineStr] = useState('No deadline set');
  const [deadlineColor, setDeadlineColor] = useState('var(--text-muted)');

  const isDual = chain.dualMigration;
  const srcBal = (isDual && bridgeSource === 'v2') ? oldV2DxnBal : oldDxnBal;
  const receiveDisplay = amount && parseFloat(amount) > 0 ? parseFloat(amount).toLocaleString('en-US', { maximumFractionDigits: 4 }) : '0';

  useEffect(() => {
    if (!bridgeStats.deadline || bridgeStats.deadline === 0n) {
      setDeadlineStr('No deadline set'); setDeadlineColor('var(--text-muted)'); return;
    }
    const tick = () => {
      const s = Number(bridgeStats.deadline) - Math.floor(Date.now() / 1000);
      if (s <= 0) { setDeadlineStr('CLOSED'); setDeadlineColor('var(--red)'); }
      else { setDeadlineStr(formatDeadline(s)); setDeadlineColor('var(--amber)'); }
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [bridgeStats.deadline]);

  const pct = bridgeStats.totalPool > 0n ? (Number((bridgeStats.totalMigrated * 10000n) / bridgeStats.totalPool) / 100) : 0;
  const loaded = bridgeStats.totalPool > 0n;

  const handleMigrate = async () => {
    if (!connected) { connectWallet(); return; }
    if (!amount || parseFloat(amount) <= 0) { toast.error('Enter an amount'); return; }
    setBusy(true);
    try { await migrate(ethers.parseEther(amount), bridgeSource); setAmount(''); }
    catch (e) { toast.error('Migration failed: ' + (e.reason || e.message)); }
    finally { setBusy(false); }
  };

  // PulseChain-specific naming
  const oldName = isDual ? 'pDXN (V1)' : `${chain.dxnSym} (Old)`;
  const oldSub = isDual ? shortAddr(chain.contracts.OLD_DXN) : shortAddr(chain.contracts.OLD_DXN);
  const newName = isDual ? 'pDXNv2 (New 250M)' : 'DXNv2 (New)';
  const newSub = shortAddr(chain.contracts.DXN_V2);

  return (
    <div className="bridge-card fade-up">
      <div className="card-header" style={{ marginBottom: 24 }}>
        <div className="card-icon" style={{ background: 'linear-gradient(135deg, var(--amber), #d97706)' }}>
          <ArrowLeftRight size={20} color="white" />
        </div>
        <div>
          <div className="card-title">DXN Migration Bridge</div>
          <div className="card-desc">Swap your old DXN for DXNv2 at 1:1</div>
        </div>
      </div>

      <div className="bridge-token">
        <div className="bridge-token-icon old">v1</div>
        <div>
          <div className="bridge-token-name">{oldName}</div>
          <div className="bridge-token-sub">{oldSub}</div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{fmt(oldDxnBal)}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Balance</div>
        </div>
      </div>

      {isDual && (
        <div className="bridge-token" style={{ marginTop: 8, borderColor: 'var(--amber-glow)' }}>
          <div className="bridge-token-icon" style={{ background: 'var(--amber)', color: 'var(--bg-deep)', fontWeight: 800, fontSize: 12 }}>v2</div>
          <div>
            <div className="bridge-token-name">pDXNv2 (Old 2.5M)</div>
            <div className="bridge-token-sub">{shortAddr(chain.legacy?.DXN_V2)}</div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{fmt(oldV2DxnBal)}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Balance</div>
          </div>
        </div>
      )}

      <div className="bridge-arrow"><ArrowDown size={24} /></div>

      <div className="bridge-token" style={{ borderColor: 'var(--cyan-dim)' }}>
        <div className="bridge-token-icon new">v2</div>
        <div>
          <div className="bridge-token-name">{newName}</div>
          <div className="bridge-token-sub">{newSub}</div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{receiveDisplay}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>You Receive</div>
        </div>
      </div>

      <div className="bridge-rate">Swap rate: <span>1 DXN = 1 DXNv2</span> — always.</div>

      {isDual && (
        <div style={{ marginBottom: 12 }}>
          <div className="input-label">Migrate From</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-action secondary" style={{ flex: 1, padding: 10, fontSize: 13, background: bridgeSource === 'v1' ? 'var(--cyan)' : '', color: bridgeSource === 'v1' ? 'var(--bg-deep)' : 'var(--cyan)' }} onClick={() => setBridgeSource('v1')}>V1 pDXN</button>
            <button className="btn-action secondary" style={{ flex: 1, padding: 10, fontSize: 13, background: bridgeSource === 'v2' ? 'var(--cyan)' : '', color: bridgeSource === 'v2' ? 'var(--bg-deep)' : 'var(--cyan)' }} onClick={() => setBridgeSource('v2')}>Old pDXNv2</button>
          </div>
        </div>
      )}

      <div className="input-group">
        <div className="input-label">Amount to Migrate</div>
        <input className="input-field" type="text" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
        <div className="input-hint">
          <span>{isDual && bridgeSource === 'v2' ? 'Old pDXNv2' : 'Old DXN'}: {fmt(srcBal)}</span>
          <span className="link" onClick={() => srcBal > 0n && setAmount(ethers.formatEther(srcBal))}>Max</span>
        </div>
      </div>

      <button className="btn-action primary" style={{ marginBottom: 16 }} onClick={handleMigrate} disabled={busy}>
        <ArrowLeftRight size={16} />
        {busy ? 'Migrating...' : connected ? 'Migrate DXN → DXNv2' : 'Connect Wallet to Migrate'}
      </button>

      <div className="bridge-stats">
        <div className="bridge-stat-item">
          <div className="bridge-stat-icon"><ArrowRightLeft size={16} style={{ color: 'var(--green)' }} /></div>
          <div><div className="bridge-stat-label">Total Migrated</div><div className="bridge-stat-value">{loaded ? <>{fmt(bridgeStats.totalMigrated)} DXN</> : <Skeleton width="80px" />}</div></div>
        </div>
        <div className="bridge-stat-item">
          <div className="bridge-stat-icon"><Vault size={16} style={{ color: 'var(--cyan)' }} /></div>
          <div><div className="bridge-stat-label">Remaining in Pool</div><div className="bridge-stat-value">{loaded ? <>{fmt(bridgeStats.poolRemaining)} DXNv2</> : <Skeleton width="80px" />}</div></div>
        </div>
        <div className="bridge-stat-item">
          <div className="bridge-stat-icon"><Timer size={16} style={{ color: 'var(--amber)' }} /></div>
          <div><div className="bridge-stat-label">Bridge Closes</div><div className="bridge-stat-value" style={{ color: deadlineColor }}>{loaded ? deadlineStr : <Skeleton width="80px" />}</div></div>
        </div>
        <div className="bridge-stat-item">
          <div className="bridge-stat-icon"><Flame size={16} style={{ color: 'var(--red)' }} /></div>
          <div><div className="bridge-stat-label">DXNv2 Burned After Close</div><div className="bridge-stat-value" style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>Unclaimed sent to 0xdead</div></div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ marginBottom: 16, padding: 14, background: 'var(--bg-deep)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
          <span style={{ color: 'var(--text-muted)' }}>Migration Progress</span>
          <span style={{ color: 'var(--cyan)', fontWeight: 600 }}>{loaded ? `${pct.toFixed(2)}%` : <Skeleton width="40px" height="14px" />}</span>
        </div>
        <div style={{ width: '100%', height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', background: 'linear-gradient(90deg, var(--cyan), var(--green))', borderRadius: 4, transition: 'width 1s ease-out', width: `${Math.min(pct, 100)}%` }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
          <span>{loaded ? `${fmt(bridgeStats.totalMigrated)} migrated` : ''}</span>
          <span>{loaded ? `of ${fmt(bridgeStats.totalPool)} total` : ''}</span>
        </div>
      </div>

      <div style={{ padding: 16, background: 'var(--bg-deep)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text-secondary)' }}>How it works:</strong> Approve your old DXN, then swap. Your old tokens are sent to the burn address (0xdead). You receive an equal amount of DXNv2. This is irreversible. After the bridge closes, any remaining DXNv2 in the pool is swept to the burn address — permanently reducing supply.
      </div>
    </div>
  );
}
