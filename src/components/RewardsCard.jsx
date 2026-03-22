import { useState } from 'react';
import { Gift, Coins, Banknote, PlusCircle } from 'lucide-react';
import { useWallet } from '../hooks/WalletContext';
import { fmt } from '../utils/helpers';
import toast from 'react-hot-toast';

export default function RewardsCard() {
  const { chain, connected, userStats, claimDxn, claimFees, addTokenToWallet } = useWallet();
  const [busy, setBusy] = useState(false);

  const handleClaimDxn = async () => {
    setBusy(true);
    try { await claimDxn(); } catch (e) { toast.error('Claim failed: ' + (e.reason || e.message)); }
    finally { setBusy(false); }
  };

  const handleClaimFees = async () => {
    setBusy(true);
    try { await claimFees(); } catch (e) { toast.error('Claim failed: ' + (e.reason || e.message)); }
    finally { setBusy(false); }
  };

  return (
    <div className="card card-hover fade-up fade-up-4">
      <div className="card-header">
        <div className="card-icon rewards"><Gift size={20} color="white" /></div>
        <div>
          <div className="card-title">Your Rewards</div>
          <div className="card-desc">Claim earned DXN and {chain.native} fees</div>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div className="stat-row">
          <span className="stat-label">Unclaimed DXN</span>
          <span className="stat-value green">{fmt(userStats.unclaimedDxn)}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Unclaimed {chain.native} Fees</span>
          <span className="stat-value green">{fmt(userStats.unclaimedFees, 6)} {chain.native}</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button className="btn-action primary" onClick={handleClaimDxn} disabled={!connected || busy}>
          <Coins size={16} /> Claim DXN Rewards
        </button>
        <button className="btn-action secondary" onClick={handleClaimFees} disabled={!connected || busy}>
          <Banknote size={16} /> Claim {chain.native} Fees
        </button>
        <button
          className="btn-action"
          style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 13, padding: 10 }}
          onClick={addTokenToWallet}
        >
          <PlusCircle size={14} /> Add DXNv2 to Wallet
        </button>
      </div>
    </div>
  );
}
