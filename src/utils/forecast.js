// DXN emission forecast. DBXen mints a per-cycle reward that decays geometrically
// (on-chain: reward_next = reward × 10000/10020, ≈0.2%/cycle), so CUMULATIVE minting
// converges to a fixed cap while the DAILY emission decays toward zero. We don't
// hardcode that ratio — we measure the decay factor from the actual on-chain reward
// series the Analytics page already fetched, then project forward assuming cycles
// keep ticking ~daily.
//
// Timeline anchor: the protocol's first active cycle = "Year 1" (its launch). All
// per-chain (each chain's DBXen mints its own DXN) and clearly an ESTIMATE: real
// minting also depends on continued burn activity.
const CYCLES_PER_YEAR = 365;               // 1 cycle ≈ 24h
const FALLBACK_FACTOR = 10000 / 10020;     // DBXen's coded per-cycle reward decay
const MAX_HIST_POINTS = 160;               // downsample the solid lines for chart perf

// Horizon buttons: 1–5 year windows, plus "Max" = the full ~60-year emission tail.
export const FORECAST_HORIZONS = [1, 2, 3, 4, 5, 60];

// cycleData: [{ cycle, reward }] in DXN (already formatEther'd), oldest → newest.
// horizonYears: how far past "now" to project.
export function buildEmissionForecast(cycleData, horizonYears = 5) {
  if (!cycleData || cycleData.length < 2) return null;
  const active = cycleData.filter((d) => d.reward > 0);
  if (active.length < 2) return null;

  // Observed per-cycle decay over the whole active span — reflects real calendar
  // behavior (activity gaps included), which is what we want to forecast.
  const first = active[0];
  const last = active[active.length - 1];
  const span = last.cycle - first.cycle;
  let factor = span > 0 ? Math.pow(last.reward / first.reward, 1 / span) : FALLBACK_FACTOR;
  if (!(factor > 0 && factor < 1)) factor = FALLBACK_FACTOR;

  // Year 1 = first active cycle (launch). yrOf maps a cycle onto that timeline.
  const base = first.cycle;
  const yrOf = (cycle) => (cycle - base) / CYCLES_PER_YEAR + 1;

  // Cumulative DXN minted to date + downsampled solid-line series (with the daily
  // emission on each point, for the downward line).
  let cum = 0;
  const rawHist = cycleData.map((d) => {
    cum += d.reward > 0 ? d.reward : 0;
    return { yr: yrOf(d.cycle), minted: cum, emit: d.reward > 0 ? d.reward : 0 };
  });
  const mintedToDate = cum;
  const stride = Math.max(1, Math.ceil(rawHist.length / MAX_HIST_POINTS));
  const hist = rawHist.filter((_, i) => i % stride === 0 || i === rawHist.length - 1);

  const curCycle = last.cycle;
  const curReward = last.reward;
  const rNext = curReward * factor;                              // next cycle's reward
  const sumH = (H) => (rNext * (1 - Math.pow(factor, H))) / (1 - factor); // Σ next H cycles
  const emitAt = (H) => curReward * Math.pow(factor, H);         // daily emission H cycles out
  const cap = mintedToDate + rNext / (1 - factor);               // asymptotic total supply

  const horizonCycles = Math.round(horizonYears * CYCLES_PER_YEAR);
  const step = Math.max(1, Math.round(horizonCycles / 120));
  // Forecast points start at the junction so the dotted lines continue the solid ones.
  const forecast = [{ yr: yrOf(curCycle), forecast: mintedToDate, emitF: curReward }];
  for (let H = step; H <= horizonCycles; H += step) {
    forecast.push({ yr: yrOf(curCycle + H), forecast: mintedToDate + sumH(H), emitF: emitAt(H) });
  }

  // Year markers scale with horizon so the axis never crowds.
  const mStep = horizonYears <= 5 ? 1 : horizonYears <= 10 ? 2 : horizonYears <= 25 ? 5 : 10;
  const markers = [];
  for (let y = mStep; y <= horizonYears; y += mStep) {
    const H = y * CYCLES_PER_YEAR;
    markers.push({ year: y, yr: yrOf(curCycle + H), cumulative: mintedToDate + sumH(H), emit: emitAt(H) });
  }

  // Single merged array: minted/emit on history points, forecast/emitF on future
  // points; connectNulls stitches each dataKey across its own points.
  const chartData = [
    ...hist.map((h) => ({ yr: h.yr, minted: h.minted, emit: h.emit })),
    ...forecast.map((f) => ({ yr: f.yr, forecast: f.forecast, emitF: f.emitF })),
  ].sort((a, b) => a.yr - b.yr);

  return {
    factor, decayPct: (1 - factor) * 100, mintedToDate, cap,
    pctMinted: cap > 0 ? (mintedToDate / cap) * 100 : 0,
    curYr: yrOf(curCycle), curReward, markers, chartData, horizonYears,
  };
}
