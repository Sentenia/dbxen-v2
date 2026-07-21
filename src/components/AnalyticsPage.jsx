import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { BarChart3, TrendingUp, Flame, Coins, Activity, RefreshCw, Sparkles, ChevronDown } from 'lucide-react';
import { ethers } from 'ethers';
import { Area, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Brush, ComposedChart, Line, ReferenceLine, ReferenceDot } from 'recharts';
import { useWallet } from '../hooks/WalletContext';
import { CHAINS, getBatchSize } from '../config/chains';
import { DBXEN_ABI } from '../config/abis';
import { fmt } from '../utils/helpers';
import { buildEmissionForecast, FORECAST_HORIZONS } from '../utils/forecast';
import { cachedBridgedWei, readBridgedWei } from '../utils/migration';
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

// Least-squares slope/intercept over {x,y} points.
function linReg(pts) {
  const n = pts.length;
  if (n < 2) return { m: 0, b: n ? pts[0].y : 0 };
  let sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (const p of pts) { sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x; }
  const den = n * sxx - sx * sx;
  if (den === 0) return { m: 0, b: sy / n };
  const m = (n * sxy - sx * sy) / den;
  return { m, b: (sy - m * sx) / n };
}

// Window of recent cycles the trend lines are fit over, and how much to ease the
// fitted slope so multi-year extrapolations stay gentle rather than shooting off.
const TREND_WIN = 90;
const SLOPE_DAMP = 0.5;

// Observed geometric decay factor of the per-cycle DXN reward, measured the same way
// the emission forecast does (reward_next ≈ reward × factor, factor < 1). We use it to
// project reward as the real geometric decay instead of chasing noisy recent data — so
// the line only ever declines and looks identical at every horizon.
function rewardDecayFactor(cycleData) {
  const active = cycleData.filter((d) => d.reward > 0);
  if (active.length < 2) return 10000 / 10020;
  const a = active[0], b = active[active.length - 1];
  const span = b.cycle - a.cycle;
  let f = span > 0 ? Math.pow(b.reward / a.reward, 1 / span) : 10000 / 10020;
  if (!(f > 0 && f < 1)) f = 10000 / 10020;
  return f;
}

// Append a "current-trend" projection so all four charts can draw a dashed
// continuation. DXN reward projects as its true geometric decay (curReward × factor^h,
// same curve the emission forecast draws) — it eases toward zero asymptotically instead
// of a straight line crossing zero early, and is one identical curve at every horizon.
// Batches and fees continue their recent TREND_WIN-cycle trend eased by SLOPE_DAMP,
// clamped only at zero. Batches/fees anchor at their fitted level at "now" (the
// in-progress current cycle is only partial, so its raw value sits too low). Cumulative
// XEN extends off the projected batch rate. Historical rows keep their real keys; future
// rows carry only proj* keys, and the last real row seeds them so the dashed lines meet
// the solid ones.
function buildProjectedData(cycleData, c, projYears) {
  if (!projYears || !cycleData || cycleData.length < 2) return cycleData;
  const recent = cycleData.slice(-TREND_WIN);
  if (recent.length < 2) return cycleData;

  const perBatchXen = parseFloat(ethers.formatEther(getBatchSize(c)));
  const batchFit = linReg(recent.map((d) => ({ x: d.cycle, y: d.batches })));
  const feeFit = linReg(recent.map((d) => ({ x: d.cycle, y: d.fees })));
  const lastRow = cycleData[cycleData.length - 1];
  const fitAt = (fit, x) => fit.m * x + fit.b;

  // Reward: the real geometric decay reward × factor^h — asymptotes toward zero, one
  // identical curve at every horizon, never sloping up.
  const factor = rewardDecayFactor(cycleData);
  const rewardBase = lastRow.reward;
  const rewardLine = (x) => rewardBase * Math.pow(factor, x - lastRow.cycle);

  // Batches and fees: eased recent trend off their fitted "now" level, floored at zero.
  const batchBase = Math.max(0, fitAt(batchFit, lastRow.cycle));
  const feeBase = Math.max(0, fitAt(feeFit, lastRow.cycle));
  const batchLine = (x) => Math.max(0, batchBase + batchFit.m * SLOPE_DAMP * (x - lastRow.cycle));
  const feeLine = (x) => Math.max(0, feeBase + feeFit.m * SLOPE_DAMP * (x - lastRow.cycle));

  const out = cycleData.map((d) => ({ ...d }));
  const j = out[out.length - 1];
  j.projReward = rewardBase;
  j.projBatches = batchBase;
  j.projFees = feeBase;
  j.projCum = j.cumXenBurned;

  // One point per cycle — same density as history — so on the index-based x-axis each
  // cycle is one equal-width slot and the projected slope looks the same for every
  // horizon (1y…5y), instead of longer horizons compressing and appearing steeper.
  const projCycles = projYears * 365;
  let cum = lastRow.cumXenBurned;
  for (let h = 1; h <= projCycles; h += 1) {
    const cyc = lastRow.cycle + h;
    const pb = batchLine(cyc);
    cum += pb * perBatchXen;
    out.push({ cycle: cyc, projReward: rewardLine(cyc), projBatches: pb, projFees: feeLine(cyc), projCum: cum });
  }
  return out;
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
  if (val >= 1e15) return (val / 1e15).toFixed(1) + 'Q';
  if (val >= 1e12) return (val / 1e12).toFixed(1) + 'T';
  if (val >= 1e9) return (val / 1e9).toFixed(1) + 'B';
  if (val >= 1e6) return (val / 1e6).toFixed(1) + 'M';
  if (val >= 1e3) return (val / 1e3).toFixed(1) + 'K';
  if (val >= 1) return val.toFixed(val < 10 ? 2 : 0);
  if (val > 0) return val.toFixed(4);
  return '0';
}

// Daily-emission formatter: keeps K/M for the big early numbers but drops into up to
// 8 decimals (trailing zeros trimmed) for the tiny amounts minted in later years, so
// fractions like 0.00012 stay visible instead of rounding to 0.0000.
function fmtEmit(val) {
  if (val >= 1e6) return (val / 1e6).toFixed(2) + 'M';
  if (val >= 1e3) return (val / 1e3).toFixed(2) + 'K';
  if (val >= 1) return val.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (val > 0) return val.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
  return '0';
}

// Percent of the emission cap minted by a given point.
function pctOf(part, whole) { return whole > 0 ? (part / whole) * 100 : 0; }

export default function AnalyticsPage() {
  const { chain, chainKey, protocolStats, getReadProvider } = useWallet();
  const [cycleData, setCycleData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(0);
  const [brushRange, setBrushRange] = useState(null); // shared so all brushes scroll together
  const [horizon, setHorizon] = useState(5);          // emission-forecast horizon, years
  const [openTiles, setOpenTiles] = useState({});     // which forecast cards are expanded
  const [projYears, setProjYears] = useState(0);      // 0 = off; trend projection on the 4 charts
  const [bridged, setBridged] = useState(0);          // DXN migrated 1:1 from v1 = starting supply
  const epochRef = useRef(0);

  // Bump epoch on chain change to abort stale fetches
  useEffect(() => { epochRef.current += 1; setCycleData(null); setLoading(true); }, [chainKey]);

  // This chain's bridged (migrated-from-v1) total = its starting circulating supply,
  // used to seed the emission-forecast baseline. Frozen values: seed instantly from the
  // shared MigrationStats cache, only hit the contract when the cache is cold.
  useEffect(() => {
    let cancelled = false;
    const cachedWei = cachedBridgedWei(chainKey);
    if (cachedWei != null) { setBridged(parseFloat(ethers.formatEther(cachedWei))); return; }
    setBridged(0);
    (async () => {
      try {
        const { provider } = getReadProvider();
        if (!provider) return;
        const wei = await readBridgedWei(CHAINS[chainKey], provider);
        if (!cancelled && wei != null) setBridged(parseFloat(ethers.formatEther(wei)));
      } catch { /* leave 0 → forecast just starts from zero */ }
    })();
    return () => { cancelled = true; };
  }, [chainKey, getReadProvider]);

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

  // The four charts consume this: real cycle data, plus a dashed trend projection
  // appended when a projection year is selected.
  const displayData = useMemo(
    () => buildProjectedData(cycleData, CHAINS[chainKey], projYears),
    [cycleData, chainKey, projYears],
  );

  // Default the shared brush window to the latest WINDOW cycles; keep the user's
  // window across background refreshes, just clamped. When a projection is on, jump
  // the window to show recent history + the whole projected tail.
  useEffect(() => {
    if (!displayData || displayData.length === 0) { setBrushRange(null); return; }
    const len = displayData.length;
    const histLen = cycleData?.length || len;
    setBrushRange((prev) => {
      if (projYears) return { startIndex: Math.max(0, histLen - 120), endIndex: len - 1 };
      if (!prev) return { startIndex: Math.max(0, len - WINDOW), endIndex: len - 1 };
      const endIndex = Math.min(prev.endIndex, len - 1);
      const startIndex = Math.min(prev.startIndex, endIndex);
      return { startIndex, endIndex };
    });
  }, [displayData, projYears, cycleData]);

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
  const forecast = buildEmissionForecast(cycleData, horizon, bridged);

  const chartHeight = 300;
  const len = displayData?.length || 0;
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
          title={cooldown ? 'Data is fresh. Full reload available again in a bit' : 'Reload all data from the chain'}>
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
        <div className="analytics-stat-box" title="Annualized: last completed cycle's protocol fees ÷ the native-token value of all staked DXN (DXN priced via DexScreener). Rough estimate. Fee revenue varies per cycle and DXN DEX liquidity is thin.">
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
        {/* 1. DXN Reward per Cycle — line with cyan gradient fill + trend projection controls */}
        <div className="analytics-card">
          <div className="analytics-card-title">
            <TrendingUp size={16} style={{ color: 'var(--cyan)' }} /> DXN Reward per Cycle
            <span className="spacer" />
            <div className="proj-btns" title="Project all four charts this many years ahead at current trends">
              <span className="proj-label">Project</span>
              {[1, 2, 3, 4, 5].map((y) => (
                <button key={y} className={`proj-btn${projYears === y ? ' active' : ''}`} onClick={() => setProjYears(y)}>{y}y</button>
              ))}
              <button className={`proj-btn${projYears === 0 ? ' active' : ''}`} onClick={() => setProjYears(0)}>Off</button>
            </div>
          </div>
          {loading ? skeletonChart : (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <ComposedChart data={displayData}>
                <defs>
                  <linearGradient id="gradCyan" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" />
                <XAxis dataKey="cycle" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={fmtAxis} />
                <Tooltip {...tooltipStyle} formatter={(v, n) => [`${(+v).toFixed(2)} DXN`, n === 'projReward' ? 'Projected' : 'Reward']} />
                <Area type="monotone" dataKey="reward" stroke="#22d3ee" strokeWidth={2} fill="url(#gradCyan)" dot={false} isAnimationActive={false} />
                {projYears > 0 && <Line type="monotone" dataKey="projReward" stroke="#22d3ee" strokeWidth={2} strokeDasharray="5 4" strokeOpacity={0.6} dot={false} connectNulls isAnimationActive={false} />}
                {renderBrush()}
              </ComposedChart>
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
              <ComposedChart data={displayData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" />
                <XAxis dataKey="cycle" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={fmtAxis} />
                <Tooltip {...tooltipStyle} formatter={(v, n) => [Math.round(+v).toLocaleString(), n === 'projBatches' ? 'Projected' : 'Batches']} />
                <Bar dataKey="batches" fill="#f59e0b" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                {projYears > 0 && <Line type="monotone" dataKey="projBatches" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 4" strokeOpacity={0.6} dot={false} connectNulls isAnimationActive={false} />}
                {renderBrush()}
              </ComposedChart>
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
              <ComposedChart data={displayData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" />
                <XAxis dataKey="cycle" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={fmtAxis} />
                <Tooltip {...tooltipStyle} formatter={(v, n) => [`${(+v).toFixed(6)} ${chain.native}`, n === 'projFees' ? 'Projected' : 'Fees']} />
                <Bar dataKey="fees" fill="#22d3ee" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                {projYears > 0 && <Line type="monotone" dataKey="projFees" stroke="#22d3ee" strokeWidth={2} strokeDasharray="5 4" strokeOpacity={0.6} dot={false} connectNulls isAnimationActive={false} />}
                {renderBrush()}
              </ComposedChart>
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
              <ComposedChart data={displayData}>
                <defs>
                  <linearGradient id="gradGreen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" />
                <XAxis dataKey="cycle" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={fmtAxis} />
                <Tooltip {...tooltipStyle} formatter={(v, n) => [fmtAxis(+v) + ' XEN', n === 'projCum' ? 'Projected' : 'Cumulative Burned']} />
                <Area type="monotone" dataKey="cumXenBurned" stroke="#34d399" strokeWidth={2} fill="url(#gradGreen)" dot={false} isAnimationActive={false} />
                {projYears > 0 && <Line type="monotone" dataKey="projCum" stroke="#34d399" strokeWidth={2} strokeDasharray="5 4" strokeOpacity={0.6} dot={false} connectNulls isAnimationActive={false} />}
                {renderBrush()}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {projYears > 0 && !loading && (
        <div className="burn-detail-note" style={{ marginTop: -4, marginBottom: 20 }}>
          Dashed lines project <b>{projYears} year{projYears > 1 ? 's' : ''}</b> ahead as gentle straight-line continuations of the recent {TREND_WIN}-cycle trend (DXN reward, batches & {chain.native} fees), with XEN burned following the projected batch rate. Modeling estimate, so real activity will vary.
        </div>
      )}

      {/* DXN Emission Forecast — cumulative minting (solid) + dotted projection to the cap */}
      <div className="analytics-card analytics-forecast">
        <div className="analytics-card-title">
          <Sparkles size={16} style={{ color: '#a78bfa' }} /> DXN Emission Forecast ({chain.name})
          <span className="spacer" />
          <div className="forecast-horizons">
            {FORECAST_HORIZONS.map((y) => (
              <button key={y} className={`forecast-hz${horizon === y ? ' active' : ''}`} onClick={() => setHorizon(y)}>{y === 60 ? 'Max' : `${y}y`}</button>
            ))}
          </div>
        </div>
        <div className="forecast-legend">
          <span className="forecast-key"><i style={{ background: '#22d3ee' }} /> Cumulative minted (↑)</span>
          <span className="forecast-key"><i style={{ background: '#f59e0b' }} /> Daily emission (↓)</span>
          <span className="forecast-key forecast-key-dash"><i /> Projected</span>
        </div>
        {loading ? skeletonChart : !forecast ? (
          <div className="analytics-empty" style={{ margin: 0 }}>Not enough cycle history to forecast yet.</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={chartHeight}>
              <ComposedChart data={forecast.chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="gradMint" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" />
                <XAxis type="number" dataKey="yr" domain={[1, 'dataMax']} tick={{ fill: '#64748b', fontSize: 11 }}
                  tickFormatter={(v) => `Y${Math.round(v)}`} allowDecimals={false} />
                <YAxis yAxisId="left" tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={fmtAxis} />
                <YAxis yAxisId="right" orientation="right" width={72} tick={{ fill: '#f59e0b', fontSize: 11 }} tickFormatter={fmtEmit} />
                <Tooltip {...tooltipStyle}
                  labelFormatter={(v, payload) => {
                    const cyc = payload?.[0]?.payload?.cycle;
                    return cyc != null ? `Cycle ${Math.round(cyc).toLocaleString()} · Y${(+v).toFixed(1)}` : `Y${(+v).toFixed(1)}`;
                  }}
                  formatter={(v, name) => {
                    const map = { minted: 'Minted (cumulative)', forecast: 'Projected (cumulative)', emit: 'Daily emission', emitF: 'Projected daily' };
                    const isEmit = name === 'emit' || name === 'emitF';
                    return [`${isEmit ? fmtEmit(v) : fmtAxis(v)}${isEmit ? ' DXN/day' : ' DXN'}`, map[name] || name];
                  }} />
                <ReferenceLine yAxisId="left" y={forecast.cap} stroke="#94a3b8" strokeDasharray="5 5"
                  label={{ value: `Cap ≈ ${fmtAxis(forecast.cap)} DXN`, position: 'insideTopRight', fill: '#94a3b8', fontSize: 11 }} />
                <ReferenceLine yAxisId="left" x={forecast.curYr} stroke="#334155" strokeDasharray="2 4"
                  label={{ value: 'now', position: 'insideBottom', fill: '#64748b', fontSize: 10 }} />
                <Area yAxisId="left" type="monotone" dataKey="minted" stroke="#22d3ee" strokeWidth={2} fill="url(#gradMint)" dot={false} connectNulls isAnimationActive={false} />
                <Line yAxisId="left" type="monotone" dataKey="forecast" stroke="#22d3ee" strokeWidth={2} strokeDasharray="6 5" dot={false} connectNulls isAnimationActive={false} />
                <Line yAxisId="right" type="monotone" dataKey="emit" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                <Line yAxisId="right" type="monotone" dataKey="emitF" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 5" dot={false} connectNulls isAnimationActive={false} />
                {forecast.markers.map((m) => (
                  <ReferenceDot key={m.year} yAxisId="left" x={m.yr} y={m.cumulative} r={4} fill="#22d3ee" stroke="#0a0e1a" strokeWidth={2} />
                ))}
              </ComposedChart>
            </ResponsiveContainer>

            <div className="forecast-tiles">
              {[1, 2, 3, 4, 5, 10, 20].map((y) => {
                const H = y * 365;
                const cyc = forecast.curCycle + H;
                const emit = forecast.curReward * Math.pow(forecast.factor, H);
                const rNext = forecast.curReward * forecast.factor;
                const cumulative = forecast.mintedToDate + (rNext * (1 - Math.pow(forecast.factor, H))) / (1 - forecast.factor);
                const pct = pctOf(cumulative, forecast.cap);
                const open = !!openTiles[y];
                return (
                  <div key={y} className={`forecast-tile forecast-tile-btn${open ? ' is-open' : ''}`} role="button" tabIndex={0}
                    onClick={() => setOpenTiles((o) => ({ ...o, [y]: !o[y] }))}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenTiles((o) => ({ ...o, [y]: !o[y] })); } }}>
                    <div className="forecast-tile-head">
                      <span className="forecast-tile-label">+{y} yr · cycle {Math.round(cyc).toLocaleString()}</span>
                      <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: 'var(--text-muted)' }} />
                    </div>
                    <div className="forecast-tile-main">{fmtAxis(cumulative)} <span>DXN</span></div>
                    <div className="forecast-tile-est">{pct.toFixed(1)}% of cap minted</div>
                    {open && (
                      <div className="forecast-tile-details">
                        <div><span>at cycle</span><b>{Math.round(cyc).toLocaleString()}</b></div>
                        <div><span>daily emission</span><b>~{fmtEmit(emit)} DXN</b></div>
                        <div><span>% of cap minted</span><b>{pct.toFixed(2)}%</b></div>
                        <div><span>left to mint</span><b>{fmtAxis(Math.max(0, forecast.cap - cumulative))} DXN</b></div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="forecast-tile forecast-tile-cap">
                <div className="forecast-tile-label">Max supply · ends ~cycle {Math.round(forecast.curCycle + 60 * 365).toLocaleString()}</div>
                <div className="forecast-tile-main" style={{ color: 'var(--text-secondary)' }}>{fmtAxis(forecast.cap)} <span>DXN</span></div>
                <div className="forecast-tile-est">{forecast.pctMinted.toFixed(1)}% already minted</div>
              </div>
            </div>
            <div className="burn-detail-note" style={{ marginTop: 10 }}>
              Year 1 = the protocol's first active cycle (launch).{forecast.bridged > 0 && <> Cumulative supply starts from the <b>{fmtAxis(forecast.bridged)} DXN</b> migrated 1:1 from v1 (this chain's starting circulating supply), which the emission then unlocks the rest on top of.</>} Assumes the observed ~{forecast.decayPct.toFixed(2)}%/cycle reward decay continues with ~daily cycles: daily emission fades toward zero while cumulative minting approaches its ~{fmtAxis(forecast.cap)} DXN cap. Because the per-cycle reward floors below 1 wei, emission effectively ends around year ~60 and supply is fixed thereafter. Modeling estimate, not a guarantee · figures are for {chain.name} only.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
