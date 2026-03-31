import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { BarChart3, PieChart } from 'lucide-react';
import { ethers } from 'ethers';
import { useNXD } from '../../hooks/NXDContext';
import { fmt } from '../../utils/helpers';

export default function NXDAnalytics() {
  const { protocolStats, vaultStats } = useNXD();

  const supplyFloat = parseFloat(ethers.formatEther(protocolStats.nxdSupply || 0n));
  const burnedFloat = parseFloat(ethers.formatEther(protocolStats.nxdBurned || 0n));
  const stakedFloat = parseFloat(ethers.formatEther(vaultStats.totalStaked || 0n));
  const circulatingFloat = Math.max(supplyFloat - stakedFloat, 0);
  const dxnStakedFloat = parseFloat(ethers.formatEther(protocolStats.dxnStaked || 0n));
  const dxnBurnedFloat = parseFloat(ethers.formatEther(protocolStats.dxnBurned || 0n));
  const ethVaultFloat = parseFloat(ethers.formatEther(protocolStats.ethToVault || 0n));
  const maxSupFloat = parseFloat(ethers.formatEther(protocolStats.maxSupply || 0n));
  const effectiveSupply = supplyFloat; // circulating supply after burns
  const burnPct = (supplyFloat + burnedFloat) > 0 ? ((burnedFloat / (supplyFloat + burnedFloat)) * 100).toFixed(2) : '0.00';

  // Estimated APR: ETH distributed / total staked NXD value (simplified)
  // This is a rough estimate — actual APR depends on NXD price vs ETH
  const aprEstimate = stakedFloat > 0 && ethVaultFloat > 0
    ? ((ethVaultFloat / stakedFloat) * 365 * 100).toFixed(1)
    : '—';

  const distributionData = [
    { name: 'Circulating', value: circulatingFloat, color: 'var(--amber)' },
    { name: 'Staked', value: stakedFloat, color: 'var(--green)' },
    { name: 'Burned', value: burnedFloat, color: 'var(--red)' },
  ].filter(d => d.value > 0);

  const COLORS = ['#f59e0b', '#34d399', '#f87171'];

  return (
    <div className="analytics-page fade-up">
      {/* Stats Grid */}
      <div className="analytics-stat-grid" style={{ marginBottom: 20 }}>
        <div className="analytics-stat-box nxd-stat-box">
          <div className="analytics-stat-label">NXDv2 Supply</div>
          <div className="analytics-stat-val nxd-accent">{fmt(protocolStats.nxdSupply)}</div>
        </div>
        <div className="analytics-stat-box nxd-stat-box">
          <div className="analytics-stat-label">NXDv2 Burned</div>
          <div className="analytics-stat-val" style={{ color: 'var(--red)' }}>{fmt(protocolStats.nxdBurned)}</div>
        </div>
        <div className="analytics-stat-box nxd-stat-box">
          <div className="analytics-stat-label">DXN Locked</div>
          <div className="analytics-stat-val">{fmt(protocolStats.dxnStaked)}</div>
        </div>
        <div className="analytics-stat-box nxd-stat-box">
          <div className="analytics-stat-label">DXN Burned</div>
          <div className="analytics-stat-val" style={{ color: 'var(--red)' }}>{fmt(protocolStats.dxnBurned)}</div>
        </div>
      </div>

      <div className="analytics-grid">
        {/* Distribution Chart */}
        <div className="analytics-card nxd-card">
          <div className="analytics-card-title"><BarChart3 size={16} className="nxd-accent" /> NXDv2 Distribution</div>
          {distributionData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={distributionData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={v => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : v.toFixed(0)} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} width={80} />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid #1e2a3a', borderRadius: 8, color: '#f0f4f8', fontSize: 13 }}
                  formatter={v => [v.toLocaleString('en-US', { maximumFractionDigits: 2 }), 'NXDv2']}
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={28}>
                  {distributionData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading data...</div>
          )}
        </div>

        {/* Protocol Analytics */}
        <div className="analytics-card nxd-card">
          <div className="analytics-card-title"><PieChart size={16} className="nxd-accent" /> Protocol Analytics</div>
          <div className="stat-row">
            <span className="stat-label">Effective Supply</span>
            <span className="stat-value">{effectiveSupply.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Max Supply</span>
            <span className="stat-value">{maxSupFloat.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">NXD Burned %</span>
            <span className="stat-value" style={{ color: 'var(--red)' }}>{burnPct}%</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">DXN Locked</span>
            <span className="stat-value">{dxnStakedFloat.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">DXN Burned</span>
            <span className="stat-value" style={{ color: 'var(--red)' }}>{dxnBurnedFloat.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Total ETH Distributed</span>
            <span className="stat-value" style={{ color: 'var(--green)' }}>{ethVaultFloat.toFixed(4)} ETH</span>
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
