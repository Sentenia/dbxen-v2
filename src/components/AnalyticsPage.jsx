import { useState, useEffect, useCallback, useRef } from 'react';
import { BarChart3, TrendingUp, Flame, Coins, Activity, RefreshCw } from 'lucide-react';
import { ethers } from 'ethers';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Brush } from 'recharts';
import { useWallet } from '../hooks/WalletContext';
import { CHAINS, getBatchSize } from '../config/chains';
import { DBXEN_ABI } from '../config/abis';
import { fmt } from '../utils/helpers';
import Skeleton from './Skeleton';


const tooltipStyle = {
  contentStyle: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#1e293b' },
  labelStyle: { color: '#64748b', fontWeight: 600 },
};

// Default chart window: show the most recent N cycles, scroll back for the rest.
const WINDOW = 100;
const COOLDOWN_MS = 60 * 60 * 1000; // 1h after a successful manual refresh
const CACHE_VERSION = 1;

// ─── Cache: historical (finished) cycles are immutable, so we persist them and
// only fetch the delta on each visit. The cache is purely an optimization — if
// it's missing/corrupt/stale we fall back to a full fetch automatically. ───
const cacheKey = (chainKey) => `dbxen-analytics-v${CACHE_VERSION}-${chainKey}`;

function loadCache(chainKey) {
  try {
    const raw = localStorage.getItem(cacheKey(chainKey));
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || o.chain !== chainKey || typeof o.cycles !== 'object' || !o.startCycle) return null;
    return o;
  } catch { return null; }
}
function saveCache(chainKey, payload) {
  try { localStorage.setItem(cacheKey(chainKey), JSON.stringify(payload)); } catch {}
}

// Build the sorted, cumulative-burn-annotated array the charts consume.
function buildArr(map, c) {
  const perBatchXen = parseFloat(ethers.formatEther(getBatchSize(c)));
  const arr = Object.keys(map).map(Number).sort((a, b) => a - b).map((n) => ({ cycle: n, ...map[n] }));
  let cum = 0;
  for (const d of arr) { cum += d.batches * perBatchXen; d.cumXenBurned = cum; }
  return arr;
}

function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

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
  const [refreshing, setRefreshing] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(0);
  const [brushRange, setBrushRange] = useState(null); // shared so all brushes scroll together
  const epochRef = useRef(0);

  // Bump epoch on chain change to abort stale fetches
  useEffect(() => { epochRef.current += 1; setCycleData(null); setLoading(true); }, [chainKey]);

  const fetchCycleHistory = useCallback(async (force = false) => {
    const epoch = ++epochRef.current;
    const isStale = () => epoch !== epochRef.current;
    setRefreshing(true);
    const { provider, isFallback } = getReadProvider();
    const c = CHAINS[chainKey];

    // Seed instantly from cache so charts render with zero network wait; the
    // delta fetch below then fills in new/missing cycles in the background.
    const cached = force ? null : loadCache(chainKey);
    const cachedCycles = {};
    if (cached) {
      for (const k in cached.cycles) cachedCycles[Number(k)] = cached.cycles[k];
      if (Object.keys(cachedCycles).length) { setCycleData(buildArr(cachedCycles, c)); setLoading(false); }
      else setLoading(true);
    } else {
      setLoading(true);
    }

    try {
      const dbx = new ethers.Contract(c.contracts.DBXEN_V2, DBXEN_ABI, provider);
      const currentCycle = await dbx.getCurrentCycle();
      if (isStale()) return;
      const cycleNum = Number(currentCycle);
      if (cycleNum < 1) { setCycleData([]); return false; }

      // First active cycle: reuse the cached value, else binary-search for it.
      let startCycle = cached?.startCycle;
      if (!startCycle) {
        let lo = 1, hi = cycleNum; startCycle = cycleNum;
        while (lo <= hi) {
          if (isStale()) return;
          const mid = Math.floor((lo + hi) / 2);
          const b = await dbx.cycleTotalBatchesBurned(mid).catch(() => 0n);
          if (isStale()) return;
          if (b > 0n) { startCycle = mid; hi = mid - 1; } else { lo = mid + 1; }
        }
      }

      // Fetch only what we don't already have, plus the in-progress current
      // cycle (its values are still changing, so never trust the cache for it).
      const toFetch = [];
      for (let i = startCycle; i <= cycleNum; i++) {
        if (i === cycleNum || cachedCycles[i] === undefined) toFetch.push(i);
      }

      const fetched = {};
      const fetchOne = async (i) => {
        const r = await Promise.allSettled([
          dbx.rewardPerCycle(i), dbx.cycleTotalBatchesBurned(i), dbx.cycleAccruedFees(i),
        ]);
        // If any call failed, leave this cycle as a gap — it won't be cached and
        // will be retried automatically next load. Beats caching a fake zero.
        if (r.some((x) => x.status === 'rejected')) return;
        const [reward, batches, fees] = r.map((x) => x.value);
        fetched[i] = {
          reward: parseFloat(ethers.formatEther(reward)),
          batches: Number(batches),
          fees: parseFloat(ethers.formatEther(fees)),
        };
      };

      const batchSize = isFallback ? 1 : 5;
      for (let s = 0; s < toFetch.length; s += batchSize) {
        if (isStale()) return;
        const slice = toFetch.slice(s, s + batchSize);
        if (isFallback) { for (const i of slice) { if (isStale()) return; await fetchOne(i); } }
        else { await Promise.all(slice.map(fetchOne)); }
      }
      if (isStale()) return;

      const all = { ...cachedCycles, ...fetched };
      setCycleData(buildArr(all, c));
      setLastUpdated(Date.now());

      // Persist everything except the in-progress current cycle (and gaps).
      const toCache = {};
      for (const n of Object.keys(all).map(Number)) if (n !== cycleNum) toCache[n] = all[n];
      saveCache(chainKey, { chain: chainKey, startCycle, cycles: toCache, ts: Date.now() });
      return true;
    } catch (e) {
      console.error('[AnalyticsPage] fetch failed:', e);
      return false;
    } finally {
      if (!isStale()) { setLoading(false); setRefreshing(false); }
    }
  }, [chainKey, getReadProvider]);

  useEffect(() => { fetchCycleHistory(); }, [fetchCycleHistory]);

  // Default the shared brush window to the latest WINDOW cycles; keep the user's
  // window across background refreshes, just clamped to the current length.
  useEffect(() => {
    if (!cycleData || cycleData.length === 0) { setBrushRange(null); return; }
    const len = cycleData.length;
    setBrushRange((prev) => {
      if (!prev) return { startIndex: Math.max(0, len - WINDOW), endIndex: len - 1 };
      const endIndex = Math.min(prev.endIndex, len - 1);
      const startIndex = Math.min(prev.startIndex, endIndex);
      return { startIndex, endIndex };
    });
  }, [cycleData]);

  const handleRefresh = async () => {
    if (refreshing || cooldown) return;
    const ok = await fetchCycleHistory(true); // force a full re-pull from chain
    // Only start the long cooldown on success, so a failed load stays retryable.
    if (ok) { setCooldown(true); setTimeout(() => setCooldown(false), COOLDOWN_MS); }
  };

  // Computed stats
  const nonZeroRewards = cycleData?.filter(d => d.reward > 0) || [];
  const avgReward = nonZeroRewards.length ? (nonZeroRewards.reduce((s, d) => s + d.reward, 0) / nonZeroRewards.length) : 0;
  const totalFees = cycleData?.reduce((s, d) => s + d.fees, 0) || 0;

  const chartHeight = 300;
  const len = cycleData?.length || 0;
  const showBrush = len > WINDOW;
  const isEmpty = !loading && (!cycleData || cycleData.length === 0);

  const skeletonChart = (
    <div style={{ height: chartHeight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Skeleton width="100%" height={`${chartHeight - 40}px`} />
    </div>
  );
  // A fresh Brush per chart, all driven by the shared brushRange state. No
  // syncId — that would also sync the tooltip hover across charts, which is
  // jarring. This keeps the windows in lockstep while hover stays per-chart.
  const renderBrush = () => (showBrush && brushRange ? (
    <Brush dataKey="cycle" height={18} stroke="#22d3ee" fill="rgba(34,211,238,0.05)"
      travellerWidth={8} startIndex={brushRange.startIndex} endIndex={brushRange.endIndex}
      onChange={(r) => setBrushRange({ startIndex: r.startIndex, endIndex: r.endIndex })} />
  ) : null);

  return (
    <div className="analytics-page">
      <div className="analytics-head">
        <BarChart3 size={22} style={{ color: 'var(--cyan)' }} />
        <span style={{ fontSize: 20, fontWeight: 800 }}>Protocol Analytics</span>
        <span className="spacer" />
        {lastUpdated > 0 && <span className="analytics-updated">Updated {timeAgo(lastUpdated)}</span>}
        <button className="analytics-refresh" onClick={handleRefresh} disabled={refreshing || cooldown}
          title={cooldown ? 'Data is fresh — full reload available again in a bit' : 'Reload all data from the chain'}>
          <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
          <span className="analytics-refresh-label">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
        </button>
      </div>

      {isEmpty && (
        <div className="analytics-empty">Couldn’t load cycle data. Check your connection and hit Refresh.</div>
      )}

      {/* 4 stat boxes */}
      <div className="analytics-stat-grid">
        <div className="analytics-stat-box">
          <div className="analytics-stat-label">Total DXN Staked (TVL)</div>
          <div className="analytics-stat-val" style={{ color: 'var(--cyan)' }}>
            {protocolStats.totalStaked > 0n ? fmt(protocolStats.totalStaked) : <Skeleton width="80px" />}
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}> DXN</span>
          </div>
        </div>
        <div className="analytics-stat-box" title="Annualized: last completed cycle's protocol fees ÷ the native-token value of all staked DXN (DXN priced via DexScreener). Rough estimate — fee revenue varies per cycle and DXN DEX liquidity is thin.">
          <div className="analytics-stat-label">Est. APR (24h) ⓘ</div>
          <div className="analytics-stat-val" style={{ color: 'var(--green)' }}>
            {protocolStats.apy ? `${protocolStats.apy}%` : (protocolStats.cycle > 0 ? '—' : <Skeleton width="60px" />)}
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
                {renderBrush()}
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
                {renderBrush()}
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
                {renderBrush()}
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
                {renderBrush()}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
