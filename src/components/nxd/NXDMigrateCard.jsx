import { Info } from 'lucide-react';

export default function NXDMigrateCard() {
  return (
    <div className="nxd-card fade-up" style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center', padding: '40px 32px', borderColor: 'var(--amber-glow)' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
        <div className="card-icon nxd-icon-mint" style={{ background: 'var(--amber)' }}>
          <Info size={20} color="white" />
        </div>
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--amber)', marginBottom: 16 }}>Migration Closed</div>
      <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)', margin: 0 }}>
        The NXDv2 migration bridge has been retired. To protect the NXDv2 ecosystem, new NXDv2 can only be obtained by depositing DXNv2 during the Community Sale Phase (CSP). This ensures every NXDv2 token is backed by freshly locked DXN, strengthening the protocol for all holders.
      </p>
    </div>
  );
}
