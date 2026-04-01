import { useState } from 'react';
import { Gift, Copy, Check, Loader2 } from 'lucide-react';
import { useNXD } from '../../hooks/NXDContext';
import { useWallet } from '../../hooks/WalletContext';
import { fmt } from '../../utils/helpers';
import toast from 'react-hot-toast';

export default function NXDReferralCard() {
  const { userReferral, protocolStats, setReferralCode, withdrawReferralRewards } = useNXD();
  const { connected, connectWallet } = useWallet();
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [copied, setCopied] = useState(false);

  const hasCode = userReferral.code > 0n;
  const code = hasCode ? Number(userReferral.code) : 0;
  const referralLink = `dbxen-v2.vercel.app/?ref=${code}`;
  const now = Math.floor(Date.now() / 1000);
  const cspEnded = protocolStats.endTime > 0 && now >= protocolStats.endTime;
  const hasClaimable = (userReferral.referredRewards > 0n || userReferral.referrerRewards > 0n) && cspEnded;

  const handleGenerate = async () => {
    setBusy(true); setBusyAction('generate');
    try {
      const randCode = Math.floor(100000 + Math.random() * 900000);
      await setReferralCode(randCode);
    } catch (e) {
      toast.error('Failed: ' + (e.reason || e.message));
    } finally { setBusy(false); setBusyAction(''); }
  };

  const handleClaim = async () => {
    setBusy(true); setBusyAction('claim');
    try { await withdrawReferralRewards(); }
    catch (e) { toast.error('Claim failed: ' + (e.reason || e.message)); }
    finally { setBusy(false); setBusyAction(''); }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(`https://${referralLink}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="card nxd-card nxd-referral-card fade-up" style={{ marginBottom: 20 }}>
      <div className="nxd-referral-inner">
        {/* LEFT — explanation */}
        <div className="nxd-referral-left">
          <div className="card-header" style={{ marginBottom: 8 }}>
            <div className="card-icon nxd-icon-mint"><Gift size={20} color="white" /></div>
            <div>
              <div className="card-title">Referral Program</div>
              <div className="card-desc">Share your code. Earn bonus NXDv2.</div>
            </div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <span style={{ color: 'var(--amber)', fontWeight: 600 }}>Referrer earns 5% bonus</span>
            {' · '}
            <span style={{ color: 'var(--green)', fontWeight: 600 }}>Referred earns 10% bonus</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            Bonuses vest until CSP ends
          </div>
        </div>

        {/* RIGHT — action area */}
        <div className="nxd-referral-right">
          {!connected ? (
            <button className="btn-action nxd-btn-primary" style={{ padding: '10px 20px' }} onClick={connectWallet}>
              Connect Wallet
            </button>
          ) : !hasCode ? (
            <button className="btn-action nxd-btn-primary btn-shimmer" style={{ padding: '10px 20px' }} onClick={handleGenerate} disabled={busy}>
              {busy && busyAction === 'generate' ? <Loader2 size={14} className="spin" /> : null}
              {busy && busyAction === 'generate' ? ' Generating...' : 'Generate Referral Code'}
            </button>
          ) : (
            <>
              {/* Copyable link */}
              <div className="nxd-referral-link-row">
                <div className="nxd-referral-link-field">{referralLink}</div>
                <button className="nxd-referral-copy-btn" onClick={handleCopy}>
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>

              {/* Stats */}
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
                <span>Referrer Bonus: <strong style={{ color: 'var(--amber)' }}>{fmt(userReferral.referrerRewards)} NXD</strong></span>
                <span>Referred Bonus: <strong style={{ color: 'var(--green)' }}>{fmt(userReferral.referredRewards)} NXD</strong></span>
              </div>

              {/* Claim */}
              <button
                className="btn-action nxd-btn-primary"
                style={{ padding: '8px 16px', fontSize: 13, marginTop: 10 }}
                onClick={handleClaim}
                disabled={!hasClaimable || busy}
              >
                {busy && busyAction === 'claim' ? <Loader2 size={14} className="spin" /> : null}
                {busy && busyAction === 'claim' ? ' Claiming...' : !cspEnded ? 'Vesting until CSP ends' : 'Claim Bonus'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
