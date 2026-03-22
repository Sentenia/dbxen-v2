import { useState, useEffect, useCallback, useRef } from 'react';
import { BarChart3, TrendingUp, Flame, Coins, Activity } from 'lucide-react';
import { ethers } from 'ethers';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useWallet } from '../hooks/WalletContext';
import { CHAINS, getBatchSize } from '../config/chains';
import { DBXEN_ABI } from '../config/abis';
import { fmt } from '../utils/helpers';
import Skeleton from './Skeleton';

const RECENT_CYCLES = 30;

const tooltipStyle = {
  contentStyle: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#1e293b' },
  labelStyle: { color: '#64748b', fontWeight: 600 },
};

// Format large numbers for Y-axis readability
function fmtAxis(val) {
  if (val >= 1e9) return (val / 1e9).toFixed(1) + 'B';
  if (val >= 1e6) return (val / 1e6).toFixed(1) + 'M';
  if (val >= 1e3) return (val / 1e3).toFixed(1) + 'K';
  if (val >= 1) return val.toFixed(val < 10 ? 2 : 0);
  if (val > 0) return val.toFixed(4);
  return '0';
}

export default function AnalyticsPage() {
  const { chain, chainKey, protocolStats, getReadProvider } = useWallet();
  const [cycleData, setCycleData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('recent'); // 'recent' | 'all'
  const epochRef = useRef(0);

  // Bump epoch on chain change to abort stale fetches
  useEffect(() => { epochRef.current += 1; setCycleData(null); setLoading(true); }, [chainKey]);

  const fetchCycleHistory = useCallback(async (fetchRange) => {
    const epoch = ++epochRef.current;
    const isStale = () => epoch !== epochRef.current;
    setLoading(true);
    const { provider, isFallback } = getReadProvider();
    const c = CHAINS[chainKey];

    try {
      const dbx = new ethers.Contract(c.contracts.DBXEN_V2, DBXEN_ABI, provider);
      const currentCycle = await dbx.getCurrentCycle();
      if (isStale()) return;
      const cycleNum = Number(currentCycle);
      if (cycleNum < 1) { setLoading(false); return; }

      // Determine start cycle
      let startCycle;
      if (fetchRange === 'all') {
        // Binary search for first active cycle
        let lo = 1, hi = cycleNum, firstActive = cycleNum;
        while (lo <= hi) {
          if (isStale()) return;
          const mid = Math.floor((lo + hi) / 2);
          const b = await dbx.cycleTotalBatchesBurned(mid).catch(() => 0n);
          if (isStale()) return;
          if (b > 0n) { firstActive = mid; hi = mid - 1; }
          else { lo = mid + 1; }
        }
        startCycle = firstActive;
      } else {
        startCycle = Math.max(1, cycleNum - RECENT_CYCLES + 1);
      }

      const results = [];
      const batchSize = isFallback ? 1 : 5;

      for (let batchStart = startCycle; batchStart <= cycleNum; batchStart += batchSize) {
        if (isStale()) return;
        const batchEnd = Math.min(batchStart + batchSize - 1, cycleNum);

        if (isFallback) {
          // Sequential for public RPCs
          for (let i = batchStart; i <= batchEnd; i++) {
            if (isStale()) return;
            const reward = await dbx.rewardPerCycle(i).catch(() => 0n);
            if (isStale()) return;
            const batches = await dbx.cycleTotalBatchesBurned(i).catch(() => 0n);
            if (isStale()) return;
            const fees = await dbx.cycleAccruedFees(i).catch(() => 0n);
            if (isStale()) return;
            results.push({
              cycle: i,
              reward: parseFloat(ethers.formatEther(reward)),
              batches: Number(batches),
              fees: parseFloat(ethers.formatEther(fees)),
            });
          }
        } else {
          // Wallet provider — parallel in small batches
          const promises = [];
          for (let i = batchStart; i <= batchEnd; i++) {
            promises.push(
              Promise.all([
                dbx.rewardPerCycle(i).catch(() => 0n),
                dbx.cycleTotalBatchesBurned(i).catch(() => 0n),
                dbx.cycleAccruedFees(i).catch(() => 0n),
              ]).then(([reward, batches, fees]) => ({
                cycle: i,
                reward: parseFloat(ethers.formatEther(reward)),
                batches: Number(batches),
                fees: parseFloat(ethers.formatEther(fees)),
              }))
            );
          }
          const batchResults = await Promise.all(promises);
          if (isStale()) return;
          results.push(...batchResults);
        }
      }

      results.sort((a, b) => a.cycle - b.cycle);

      // Compute cumulative XEN burned
      const batchSizeWei = getBatchSize(c);
      let cumBurned = 0;
      for (const d of results) {
        cumBurned += d.batches * parseFloat(ethers.formatEther(batchSizeWei));
        d.cumXenBurned = cumBurned;
      }

      if (isStale()) return;
      setCycleData(results);
    } catch (e) {
      console.error('[AnalyticsPage] fetch failed:', e);
    }
    if (!isStale()) setLoading(false);
  }, [chainKey, getReadProvider]);

  // Fetch on mount and when range/chain changes
  useEffect(() => { fetchCycleHistory(range); }, [range, fetchCycleHistory]);

  // Computed stats
  const nonZeroRewards = cycleData?.filter(d => d.reward > 0) || [];
  const avgReward = nonZeroRewards.length ? (nonZeroRewards.reduce((s, d) => s + d.reward, 0) / nonZeroRewards.length) : 0;
  const totalFees = cycleData?.reduce((s, d) => s + d.fees, 0) || 0;

  const chartHeight = 300;
  const skeletonChart = (
    <div style={{ height: chartHeight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Skeleton width="100%" height={`${chartHeight - 40}px`} />
    </div>
  );

  return (
    <div className="analytics-page">
      {/* Header + range toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <BarChart3 size={22} style={{ color: 'var(--cyan)' }} />
          <span style={{ fontSize: 20, fontWeight: 800 }}>Protocol Analytics</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className={`nav-link${range === 'recent' ? ' active' : ''}`}
            onClick={() => setRange('recent')}
            style={{ padding: '6px 14px', fontSize: 13 }}
          >30 cycles</button>
          <button
            className={`nav-link${range === 'all' ? ' active' : ''}`}
            onClick={() => setRange('all')}
            style={{ padding: '6px 14px', fontSize: 13 }}
          >All time</button>
        </div>
      </div>

      {/* 4 stat boxes */}
      <div className="analytics-stat-grid">
        <div className="analytics-stat-box">
          <div className="analytics-stat-label">Total DXN Staked (TVL)</div>
          <div className="analytics-stat-val" style={{ color: 'var(--cyan)' }}>
            {protocolStats.totalStaked > 0n ? fmt(protocolStats.totalStaked) : <Skeleton width="80px" />}
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}> DXN</span>
          </div>
        </div>
        <div className="analytics-stat-box">
          <div className="analytics-stat-label">Est. APY (24h)</div>
          <div className="analytics-stat-val" style={{ color: 'var(--green)' }}>
            {protocolStats.apy ? `${protocolStats.apy}%` : <Skeleton width="60px" />}
          </div>
        </div>
        <div className="analytics-stat-box">
          <div className="analytics-stat-label">Avg Reward / Cycle</div>
          <div className="analytics-stat-val">
            {loading ? <Skeleton width="70px" /> : `${avgReward.toFixed(2)} DXN`}
          </div>
        </div>
        <div className="analytics-stat-box">
          <div className="analytics-stat-label">Total Fees Collected</div>
          <div className="analytics-stat-val" style={{ color: 'var(--amber)' }}>
            {loading ? <Skeleton width="70px" /> : `${totalFees.toFixed(4)} ${chain.native}`}
          </div>
        </div>
      </div>

      {/* 4 charts in 2x2 grid */}
      <div className="analytics-grid">
        {/* 1. DXN Reward per Cycle — line with cyan gradient fill */}
        <div className="analytics-card">
          <div className="analytics-card-title">
            <TrendingUp size={16} style={{ color: 'var(--cyan)' }} /> DXN Reward per Cycle
          </div>
          {loading ? skeletonChart : (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <AreaChart data={cycleData}>
                <defs>
                  <linearGradient id="gradCyan" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" />
                <XAxis dataKey="cycle" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={fmtAxis} />
                <Tooltip {...tooltipStyle} formatter={(v) => [`${v.toFixed(2)} DXN`, 'Reward']} />
                <Area type="monotone" dataKey="reward" stroke="#22d3ee" strokeWidth={2} fill="url(#gradCyan)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* 2. Batches Burned per Cycle — amber bar */}
        <div className="analytics-card">
          <div className="analytics-card-title">
            <Flame size={16} style={{ color: 'var(--amber)' }} /> Batches Burned per Cycle
          </div>
          {loading ? skeletonChart : (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <BarChart data={cycleData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" />
                <XAxis dataKey="cycle" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={fmtAxis} />
                <Tooltip {...tooltipStyle} formatter={(v) => [v.toLocaleString(), 'Batches']} />
                <Bar dataKey="batches" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* 3. Native Fees per Cycle — cyan bar */}
        <div className="analytics-card">
          <div className="analytics-card-title">
            <Coins size={16} style={{ color: 'var(--cyan)' }} /> {chain.native} Fees per Cycle
          </div>
          {loading ? skeletonChart : (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <BarChart data={cycleData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" />
                <XAxis dataKey="cycle" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={fmtAxis} />
                <Tooltip {...tooltipStyle} formatter={(v) => [`${v.toFixed(6)} ${chain.native}`, 'Fees']} />
                <Bar dataKey="fees" fill="#22d3ee" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* 4. Cumulative XEN Burned — green line with gradient fill */}
        <div className="analytics-card">
          <div className="analytics-card-title">
            <Activity size={16} style={{ color: 'var(--green)' }} /> Cumulative XEN Burned
          </div>
          {loading ? skeletonChart : (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <AreaChart data={cycleData}>
                <defs>
                  <linearGradient id="gradGreen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" />
                <XAxis dataKey="cycle" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={fmtAxis} />
                <Tooltip {...tooltipStyle} formatter={(v) => [fmtAxis(v) + ' XEN', 'Cumulative Burned']} />
                <Area type="monotone" dataKey="cumXenBurned" stroke="#34d399" strokeWidth={2} fill="url(#gradGreen)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
