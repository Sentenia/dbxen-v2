import { BarChart3, PieChart } from 'lucide-react';
import { ethers } from 'ethers';
import { useNXD } from '../../hooks/NXDContext';
import { fmtFixed } from '../../utils/helpers';

const INITIAL_SUPPLY = 5000;

const SEGMENTS = [
  { key: 'circulating', label: 'Circulating', color: '#627EEA' },
  { key: 'staked', label: 'Staked', color: '#34d399' },
  { key: 'pooled', label: 'Pooled (LP)', color: '#22d3ee' },
  { key: 'burned', label: 'Burned', color: '#f87171' },
];

function fmtNum(v) {
  return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export default function NXDAnalytics() {
  const { protocolStats, vaultStats, migrationStats } = useNXD();

  const supplyFloat = parseFloat(ethers.formatEther(protocolStats.nxdSupply || 0n));
  const burnedFloat = parseFloat(ethers.formatEther(protocolStats.nxdBurned || 0n));
  const stakedFloat = parseFloat(ethers.formatEther(vaultStats.totalStaked || 0n));
  const pooledFloat = parseFloat(ethers.formatEther(protocolStats.nxdInLP || 0n));
  const circulatingFloat = Math.max(supplyFloat - stakedFloat - pooledFloat, 0);
  const dxnLockedTotal = (protocolStats.dxnStaked || 0n) + (protocolStats.totalDXNDeposited || 0n);
  const dxnStakedFloat = parseFloat(ethers.formatEther(dxnLockedTotal));
  const dxnBurnedFloat = parseFloat(ethers.formatEther(protocolStats.dxnBurned || 0n));
  const ethVaultFloat = parseFloat(ethers.formatEther(protocolStats.ethToVault || 0n));
  const maxSupFloat = parseFloat(ethers.formatEther(protocolStats.maxSupply || 0n));
  const effectiveSupply = supplyFloat;
  const burnPct = (supplyFloat + burnedFloat) > 0 ? ((burnedFloat / (supplyFloat + burnedFloat)) * 100).toFixed(2) : '0.00';
  const cspMinted = Math.max(supplyFloat - INITIAL_SUPPLY, 0);
  const cspDepositsFloat = parseFloat(ethers.formatEther(protocolStats.totalDXNDeposited || 0n));
  const totalMigratedFloat = parseFloat(ethers.formatEther(migrationStats.totalSwapped || 0n));

  const nxdPenaltyBurnedFloat = parseFloat(ethers.formatEther(vaultStats.nxdPenaltyBurned || 0n));
  const dxnV2SupplyFloat = parseFloat(ethers.formatEther(protocolStats.dxnV2TotalSupply || 0n));
  const dxnLockedPct = dxnV2SupplyFloat > 0 ? ((dxnStakedFloat / dxnV2SupplyFloat) * 100).toFixed(2) : '0.00';

  const aprEstimate = stakedFloat > 0 && ethVaultFloat > 0
    ? ((ethVaultFloat / stakedFloat) * 365 * 100).toFixed(1)
    : '—';

  // Total includes burned (for percentage calculations)
  const total = circulatingFloat + stakedFloat + pooledFloat + burnedFloat;
  const values = { circulating: circulatingFloat, staked: stakedFloat, pooled: pooledFloat, burned: burnedFloat };
  const pcts = {};
  for (const s of SEGMENTS) pcts[s.key] = total > 0 ? (values[s.key] / total) * 100 : 0;

  const hasData = total > 0;

  return (
    <div className="analytics-page fade-up">
      <div className="analytics-grid">
        {/* Distribution Chart */}
        <div className="analytics-card nxd-card">
          <div className="analytics-card-title"><BarChart3 size={16} className="nxd-accent" /> NXDv2 Distribution</div>
          {hasData ? (
            <>
              {/* Stacked vertical bar */}
              <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
                <div style={{ width: 90, height: 300, borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  {SEGMENTS.map(s => {
                    const pct = pcts[s.key];
                    if (pct <= 0) return null;
                    return (
                      <div
                        key={s.key}
                        style={{
                          flex: `${pct} 0 0%`,
                          background: s.color,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          minHeight: pct > 3 ? 0 : 0,
                          position: 'relative',
                        }}
                      >
                        {pct >= 5 && (
                          <span style={{ color: '#fff', fontSize: 12, fontWeight: 700, textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>
                            {pct.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Legend */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 20px', justifyContent: 'center', marginTop: 8 }}>
                {SEGMENTS.map(s => (
                  <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                    <span>{s.label}: <strong style={{ color: 'var(--text-primary)' }}>{fmtNum(values[s.key])}</strong> <span style={{ color: 'var(--text-muted)' }}>({pcts[s.key].toFixed(2)}%)</span></span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading data...</div>
          )}
        </div>

        {/* Protocol Analytics */}
        <div className="analytics-card nxd-card">
          <div className="analytics-card-title"><PieChart size={16} className="nxd-accent" /> Protocol Analytics</div>
          <div className="stat-row">
            <span className="stat-label">Effective Supply</span>
            <span className="stat-value">{fmtNum(effectiveSupply)}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Max Supply</span>
            <span className="stat-value">{maxSupFloat.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">NXDv2 Minted (CSP)</span>
            <span className="stat-value" style={{ color: 'var(--amber)' }}>{fmtNum(cspMinted)}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">CSP DXN Deposited</span>
            <span className="stat-value">{fmtNum(cspDepositsFloat)}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Total Migrated (Bridge)</span>
            <span className="stat-value">{fmtNum(totalMigratedFloat)}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">NXD Burned %</span>
            <span className="stat-value" style={{ color: 'var(--red)' }}>{burnPct}%</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">DXN Locked</span>
            <span className="stat-value">{fmtNum(dxnStakedFloat)}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">DXN Burned</span>
            <span className="stat-value" style={{ color: 'var(--red)' }}>{fmtNum(dxnBurnedFloat)}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">DXN Locked % of Supply</span>
            <span className="stat-value" style={{ color: 'var(--amber)' }}>{dxnLockedPct}%</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">NXD Burned (Unstake Penalty)</span>
            <span className="stat-value" style={{ color: 'var(--red)' }}>{fmtNum(nxdPenaltyBurnedFloat)}</span>
          </div>
          <div className="stat-row stat-total">
            <span className="stat-label">Total ETH Distributed</span>
            <span className="stat-value" style={{ color: 'var(--green)' }}>{fmtFixed(protocolStats.ethToVault || 0n, 6)} ETH</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Est. APR</span>
            <span className="stat-value" style={{ color: 'var(--amber)' }}>{aprEstimate}{aprEstimate !== '—' ? '%' : ''}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
