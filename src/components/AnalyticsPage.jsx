import { useState, useEffect, useCallback, useRef } from 'react';
import { BarChart3, TrendingUp, Flame, Coins } from 'lucide-react';
import { ethers } from 'ethers';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useWallet } from '../hooks/WalletContext';
import { CHAINS } from '../config/chains';
import { DBXEN_ABI } from '../config/abis';
import { fmt } from '../utils/helpers';
import Skeleton from './Skeleton';

const CYCLES_WALLET = 30;
const CYCLES_FALLBACK = 10;

const chartTooltipStyle = {
  contentStyle: { background: '#111827', border: '1px solid #1e2a3a', borderRadius: 8, fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif" },
  labelStyle: { color: '#94a3b8', fontWeight: 600 },
};

export default function AnalyticsPage() {
  const { chain, chainKey, protocolStats, getReadProvider } = useWallet();
  const [cycleData, setCycleData] = useState(null);
  const [loading, setLoading] = useState(true);
  const epochRef = useRef(0);

  // Bump epoch on chain change to abort stale fetches
  useEffect(() => { epochRef.current += 1; }, [chainKey]);

  const fetchCycleHistory = useCallback(async () => {
    const epoch = epochRef.current;
    const isStale = () => epoch !== epochRef.current;
    setLoading(true);
    const { provider, isFallback } = getReadProvider();
    const c = CHAINS[chainKey];
    const maxCycles = isFallback ? CYCLES_FALLBACK : CYCLES_WALLET;

    try {
      const dbx = new ethers.Contract(c.contracts.DBXEN_V2, DBXEN_ABI, provider);
      const currentCycle = await dbx.getCurrentCycle();
      if (isStale()) return;
      const cycleNum = Number(currentCycle);
      const startCycle = Math.max(1, cycleNum - maxCycles + 1);

      const results = [];

      if (isFallback) {
        // Sequential calls with stale checks for public RPCs
        for (let i = startCycle; i <= cycleNum; i++) {
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
        // Wallet provider — can batch per-cycle, but do cycles in small parallel groups
        const batchSize = 5;
        for (let batchStart = startCycle; batchStart <= cycleNum; batchStart += batchSize) {
          if (isStale()) return;
          const batchEnd = Math.min(batchStart + batchSize - 1, cycleNum);
          const batchPromises = [];
          for (let i = batchStart; i <= batchEnd; i++) {
            batchPromises.push(
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
          const batchResults = await Promise.all(batchPromises);
          if (isStale()) return;
          results.push(...batchResults);
        }
      }

      results.sort((a, b) => a.cycle - b.cycle);
      if (isStale()) return;
      setCycleData(results);
    } catch (e) {
      console.error('Analytics fetch failed:', e);
    }
    if (!isStale()) setLoading(false);
  }, [chainKey, getReadProvider]);

  useEffect(() => { fetchCycleHistory(); }, [fetchCycleHistory]);

  const totalFeesAll = cycleData?.reduce((sum, d) => sum + d.fees, 0) || 0;
  const avgReward = cycleData?.length ? (cycleData.reduce((sum, d) => sum + d.reward, 0) / cycleData.length) : 0;

  return (
    <div className="analytics-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <BarChart3 size={22} style={{ color: 'var(--cyan)' }} />
        <span style={{ fontSize: 20, fontWeight: 800 }}>Protocol Analytics</span>
      </div>

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
          <div className="analytics-stat-label">Avg Reward (last {cycleData?.length || '—'} cycles)</div>
          <div className="analytics-stat-val">
            {loading ? <Skeleton width="70px" /> : `${avgReward.toFixed(2)} DXN`}
          </div>
        </div>
        <div className="analytics-stat-box">
          <div className="analytics-stat-label">Total Fees (last {cycleData?.length || '—'} cycles)</div>
          <div className="analytics-stat-val" style={{ color: 'var(--amber)' }}>
            {loading ? <Skeleton width="70px" /> : `${totalFeesAll.toFixed(4)} ${chain.native}`}
          </div>
        </div>
      </div>

      <div className="analytics-grid">
        <div className="analytics-card">
          <div className="analytics-card-title">
            <TrendingUp size={16} style={{ color: 'var(--green)' }} /> DXN Reward per Cycle
          </div>
          {loading ? (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Skeleton width="100%" height="180px" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={cycleData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" />
                <XAxis dataKey="cycle" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip {...chartTooltipStyle} formatter={(v) => [`${v.toFixed(2)} DXN`, 'Reward']} />
                <Line type="monotone" dataKey="reward" stroke="#34d399" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="analytics-card">
          <div className="analytics-card-title">
            <Flame size={16} style={{ color: 'var(--red)' }} /> Batches Burned per Cycle
          </div>
          {loading ? (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Skeleton width="100%" height="180px" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={cycleData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" />
                <XAxis dataKey="cycle" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip {...chartTooltipStyle} formatter={(v) => [v.toLocaleString(), 'Batches']} />
                <Bar dataKey="batches" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="analytics-card analytics-full">
          <div className="analytics-card-title">
            <Coins size={16} style={{ color: 'var(--amber)' }} /> {chain.native} Fees per Cycle
          </div>
          {loading ? (
            <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Skeleton width="100%" height="180px" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={cycleData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" />
                <XAxis dataKey="cycle" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip {...chartTooltipStyle} formatter={(v) => [`${v.toFixed(6)} ${chain.native}`, 'Fees']} />
                <Bar dataKey="fees" fill="#22d3ee" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

    </div>
  );
}
