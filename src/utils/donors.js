// Reconstructs "who has donated to the community chest" from on-chain history, since
// the app has no backend of its own, and scores it in points.
//
// ── Points game ─────────────────────────────────────────────────────────────
// points = $ donated × a launch bonus that starts at 10× and fades linearly to 1×
// over 90 DXN cycles (1 cycle = 1 day). Donations from before the game shipped
// get the full 10×. What points are for is deliberately unspecified. Suspense.
//
// ── Data sources ────────────────────────────────────────────────────────────
// Blockscout (keyless, CORS-open, Etherscan-compatible format) is the workhorse —
// it kept answering correctly while Etherscan's free index flip-flopped between
// real donors and "No transactions found" for a wallet that verifiably holds ETH.
// Etherscan V2 (needs VITE_ETHERSCAN_API_KEY, free tier = Ethereum+Polygon only,
// 3 req/s) is merged in as redundancy when a key is configured. Rows dedupe by tx
// hash, so double-listing is harmless. BSC/Avalanche have no keyless explorer API
// and PulseChain/EthereumPoW no compatible one — donations there aren't tracked,
// same best-effort spirit as the app's other explorer/getLogs limitations.
import { ethers } from 'ethers';
import { CHAINS } from '../config/chains';
import { JAR_ADDRESS, STABLES, STABLE_ABI } from '../config/chest';
import { getNativeUsd } from './price';

const SOURCES = {
  ethereum: { chainid: 1,    etherscanFree: true,  blockscout: 'https://eth.blockscout.com/api' },
  polygon:  { chainid: 137,  etherscanFree: true,  blockscout: 'https://polygon.blockscout.com/api' },
  base:     { chainid: 8453, etherscanFree: false, blockscout: 'https://base.blockscout.com/api' },
  optimism: { chainid: 10,   etherscanFree: false, blockscout: 'https://explorer.optimism.io/api' }, // optimism.blockscout.com 301s here
};
const EXPLORER_CHAINS = Object.keys(SOURCES);
const API_KEY = import.meta.env.VITE_ETHERSCAN_API_KEY;
const ES_API = 'https://api.etherscan.io/v2/api';

// Launch bonus decay, measured in DXN cycles read from the Ethereum DBXen contract.
// CAMPAIGN_START_CYCLE was the current cycle when the points game shipped; the
// timestamp is a fallback clock for when the contract read fails (±a day is fine
// for a fallback — the chain is the source of truth).
const CAMPAIGN_START_CYCLE = 1199; // cycle current on 2026-07-04
const CAMPAIGN_START_TS = Math.floor(Date.UTC(2026, 6, 4) / 1000);
export const BONUS_START = 10;
export const BONUS_CYCLES = 90;

let cache = null; // { ts, board }
const TTL = 10 * 60 * 1000;

// Etherscan's free tier caps at 3 req/sec; a burst over that gets some requests
// dropped by their WAF (Chrome then reports it as a misleading CORS failure, since
// the connection never completes). All Etherscan calls go through this single
// serialized queue. Blockscout hosts are separate origins with saner limits and
// are called directly.
let queue = Promise.resolve();
const MIN_GAP = 400; // ms between requests (~2.5/sec, safely under the 3/sec cap)
function fetchEtherscan(params) {
  const run = queue.then(async () => {
    const url = `${ES_API}?${new URLSearchParams({ ...params, apikey: API_KEY })}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const d = await r.json();
    return Array.isArray(d.result) ? d.result : [];
  });
  queue = run.then(() => new Promise((res) => setTimeout(res, MIN_GAP)), () => new Promise((res) => setTimeout(res, MIN_GAP)));
  return run;
}

async function fetchBlockscout(base, params) {
  const url = `${base}?${new URLSearchParams(params)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const d = await r.json();
  return Array.isArray(d.result) ? d.result : [];
}

// Donations to the chest in USD, priced live (not at tx time) — same approximation
// TipJar's own fill bar already makes for the "total raised" figure.
async function chainDonations(chainKey, nowMs) {
  const src = SOURCES[chainKey];
  const jar = JAR_ADDRESS.toLowerCase();
  const listParams = { module: 'account', action: 'txlist', address: JAR_ADDRESS, sort: 'desc' };
  const tokenParams = { module: 'account', action: 'tokentx', address: JAR_ADDRESS, sort: 'desc' };
  const useEtherscan = API_KEY && src.etherscanFree;

  // decimals come from our own verified config, not the API's tokenDecimal field
  const stableDecimals = {};
  for (const s of Object.values(STABLES[chainKey] || {})) stableDecimals[s.address.toLowerCase()] = s.decimals;

  // getNativeUsd (price.js) has no fetch timeout of its own; race it so a stalled
  // DexScreener call can't hang the whole board. Null price just skips native rows.
  const [bsNative, bsToken, esNative, esToken, nativeUsd] = await Promise.all([
    fetchBlockscout(src.blockscout, listParams).catch(() => []),
    fetchBlockscout(src.blockscout, tokenParams).catch(() => []),
    useEtherscan ? fetchEtherscan({ chainid: src.chainid, ...listParams }).catch(() => []) : [],
    useEtherscan ? fetchEtherscan({ chainid: src.chainid, ...tokenParams }).catch(() => []) : [],
    Promise.race([getNativeUsd(chainKey, nowMs), new Promise((res) => setTimeout(() => res(null), 8000))]),
  ]);

  const rows = [];
  for (const tx of [...bsNative, ...esNative]) {
    if (tx.to?.toLowerCase() !== jar || tx.isError !== '0' || !tx.value || tx.value === '0' || !nativeUsd) continue;
    const usd = Number(ethers.formatEther(tx.value)) * nativeUsd;
    if (usd > 0) rows.push({ from: tx.from.toLowerCase(), usd, ts: Number(tx.timeStamp), hash: tx.hash });
  }
  for (const tx of [...bsToken, ...esToken]) {
    const dec = stableDecimals[tx.contractAddress?.toLowerCase()];
    if (tx.to?.toLowerCase() !== jar || dec === undefined) continue;
    const usd = Number(ethers.formatUnits(tx.value, dec));
    if (usd > 0) rows.push({ from: tx.from.toLowerCase(), usd, ts: Number(tx.timeStamp), hash: `${tx.hash}:${tx.contractAddress}` });
  }
  return rows;
}

const balProvCache = {};
function balProvFor(chainKey) {
  if (!balProvCache[chainKey]) balProvCache[chainKey] = new ethers.JsonRpcProvider(CHAINS[chainKey].rpc, parseInt(CHAINS[chainKey].chainId, 16), { staticNetwork: true });
  return balProvCache[chainKey];
}

// DXN cycle timing from the Ethereum DBXen contract (cycles are the game clock).
const TIMING_ABI = [
  'function i_initialTimestamp() view returns (uint256)',
  'function i_periodDuration() view returns (uint256)',
];
let timingCache;
async function getCycleTiming() {
  if (timingCache) return timingCache;
  try {
    const c = new ethers.Contract(CHAINS.ethereum.contracts.DBXEN_V2, TIMING_ABI, balProvFor('ethereum'));
    const [init, period] = await Promise.all([c.i_initialTimestamp(), c.i_periodDuration()]);
    if (Number(period) > 0) timingCache = { init: Number(init), period: Number(period) };
  } catch { /* fall back to timestamp clock below */ }
  return timingCache || null;
}

// Points multiplier for a unix timestamp: 10× through the launch cycle, then
// linearly down to 1× over the next 90 cycles, 1× forever after.
function bonusAt(ts, timing) {
  const day = timing
    ? Math.floor((ts - timing.init) / timing.period) - CAMPAIGN_START_CYCLE
    : Math.floor((ts - CAMPAIGN_START_TS) / 86400);
  if (day <= 0) return BONUS_START;
  if (day >= BONUS_CYCLES) return 1;
  return BONUS_START - ((BONUS_START - 1) * day) / BONUS_CYCLES;
}

// Cheap direct-RPC ground-truth check, used only when the history APIs come back
// empty: does the chest actually hold any funds on the chains we can read?
// Returns true when funds exist OR when any probe failed — a partial answer can't
// rule out funds on the chain we couldn't reach, so the UI must say "having
// trouble" rather than "no donations yet". Only a full sweep of zeros returns false.
async function hasAnyBalance() {
  const probes = await Promise.allSettled(EXPLORER_CHAINS.flatMap((k) => {
    const p = balProvFor(k);
    const stables = STABLES[k] || {};
    return [
      p.getBalance(JAR_ADDRESS).then((b) => b > 0n),
      ...Object.values(stables).map((s) => new ethers.Contract(s.address, STABLE_ABI, p).balanceOf(JAR_ADDRESS).then((b) => b > 0n)),
    ];
  }));
  return probes.some((p) => p.status === 'rejected' || p.value === true);
}

// Aggregates every donation into a per-address points leaderboard.
// Concurrent callers share one in-flight build (React StrictMode double-mounts the
// modal in dev, and each build is several rate-limited requests — running two
// interleaved doubles the wait for both).
let inflight = null;
export function fetchDonorBoard({ force = false } = {}) {
  const now = Date.now();
  if (!force && cache && now - cache.ts < TTL) return Promise.resolve(cache.board);
  if (!inflight) inflight = buildBoard(now).finally(() => { inflight = null; });
  return inflight;
}

async function buildBoard(now) {
  const timing = await getCycleTiming();

  const seen = new Map(); // tx hash -> row, deduped across sources and retry rounds
  const MAX_ROUNDS = 2;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const perChain = await Promise.all(EXPLORER_CHAINS.map((k) => chainDonations(k, now).catch(() => [])));
    for (const rows of perChain) for (const row of rows) seen.set(row.hash, row);
    if (seen.size > 0) break; // got real data — no need to keep hammering flaky endpoints
    if (round < MAX_ROUNDS - 1) await new Promise((r) => setTimeout(r, 1200));
  }

  const byAddr = new Map();
  for (const { from, usd, ts } of seen.values()) {
    const hit = byAddr.get(from) || { address: from, usd: 0, rawPts: 0, count: 0, lastTs: 0 };
    hit.usd += usd;
    hit.rawPts += usd * bonusAt(ts, timing);
    hit.count += 1;
    hit.lastTs = Math.max(hit.lastTs, ts);
    byAddr.set(from, hit);
  }
  const donors = [...byAddr.values()]
    .map((d) => ({ ...d, points: Math.max(1, Math.round(d.rawPts)) }))
    .sort((a, b) => b.points - a.points || b.lastTs - a.lastTs);

  const uncertain = donors.length === 0 && await Promise.race([
    hasAnyBalance(),
    new Promise((res) => setTimeout(() => res(true), 8000)), // couldn't verify in time = "having trouble", not "empty"
  ]);

  const nowBonus = bonusAt(Math.floor(now / 1000), timing);
  const dayNow = timing
    ? Math.floor((now / 1000 - timing.init) / timing.period) - CAMPAIGN_START_CYCLE
    : Math.floor((now / 1000 - CAMPAIGN_START_TS) / 86400);
  const board = {
    donors,
    uncertain,
    bonus: { multiplier: nowBonus, cyclesLeft: Math.max(0, BONUS_CYCLES - Math.max(0, dayNow)) },
  };
  cache = { ts: now, board };
  return board;
}
