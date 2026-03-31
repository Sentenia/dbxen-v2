import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { BarChart3, PieChart } from 'lucide-react';
import { ethers } from 'ethers';
import { useNXD } from '../../hooks/NXDContext';
import { fmt } from '../../utils/helpers';

const INITIAL_SUPPLY = 5000;

export default function NXDAnalytics() {
  const { protocolStats, vaultStats, migrationStats } = useNXD();

  const supplyFloat = parseFloat(ethers.formatEther(protocolStats.nxdSupply || 0n));
  const burnedFloat = parseFloat(ethers.formatEther(protocolStats.nxdBurned || 0n));
  const stakedFloat = parseFloat(ethers.formatEther(vaultStats.totalStaked || 0n));
  const pooledFloat = parseFloat(ethers.formatEther(protocolStats.nxdInLP || 0n));
  const circulatingFloat = Math.max(supplyFloat - stakedFloat - pooledFloat, 0);
  const dxnStakedFloat = parseFloat(ethers.formatEther(protocolStats.dxnStaked || 0n));
  const dxnBurnedFloat = parseFloat(ethers.formatEther(protocolStats.dxnBurned || 0n));
  const ethVaultFloat = parseFloat(ethers.formatEther(protocolStats.ethToVault || 0n));
  const maxSupFloat = parseFloat(ethers.formatEther(protocolStats.maxSupply || 0n));
  const effectiveSupply = supplyFloat;
  const burnPct = (supplyFloat + burnedFloat) > 0 ? ((burnedFloat / (supplyFloat + burnedFloat)) * 100).toFixed(2) : '0.00';
  const cspMinted = Math.max(supplyFloat - INITIAL_SUPPLY, 0);
  const cspDepositsFloat = parseFloat(ethers.formatEther(protocolStats.totalDXNDeposited || 0n));
  const totalMigratedFloat = parseFloat(ethers.formatEther(migrationStats.totalSwapped || 0n));

  const aprEstimate = stakedFloat > 0 && ethVaultFloat > 0
    ? ((ethVaultFloat / stakedFloat) * 365 * 100).toFixed(1)
    : '—';

  const distributionData = [
    { name: 'Circulating', value: circulatingFloat },
    { name: 'Staked', value: stakedFloat },
    { name: 'Pooled (LP)', value: pooledFloat },
    { name: 'Burned', value: burnedFloat },
  ].filter(d => d.value > 0);

  const COLORS = ['#f59e0b', '#34d399', '#60a5fa', '#f87171'];

  return (
    <div className="analytics-page fade-up">
      <div className="analytics-grid">
        {/* Distribution Chart */}
        <div className="analytics-card nxd-card">
          <div className="analytics-card-title"><BarChart3 size={16} className="nxd-accent" /> NXDv2 Distribution</div>
          {distributionData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={distributionData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={v => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : v.toFixed(0)} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} width={80} />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid #1e2a3a', borderRadius: 8, color: '#f0f4f8', fontSize: 13 }}
                  formatter={v => [v.toLocaleString('en-US', { maximumFractionDigits: 2 }), 'NXDv2']}
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={28}>
                  {distributionData.map((entry, i) => {
                    const colorMap = { 'Circulating': COLORS[0], 'Staked': COLORS[1], 'Pooled (LP)': COLORS[2], 'Burned': COLORS[3] };
                    return <Cell key={i} fill={colorMap[entry.name] || COLORS[i % COLORS.length]} />;
                  })}
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
            <span className="stat-label">NXDv2 Minted (CSP)</span>
            <span className="stat-value" style={{ color: 'var(--amber)' }}>{cspMinted.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">CSP DXN Deposited</span>
            <span className="stat-value">{cspDepositsFloat.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">Total Migrated (Bridge)</span>
            <span className="stat-value">{totalMigratedFloat.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
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
