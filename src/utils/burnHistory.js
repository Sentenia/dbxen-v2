// Per-cycle burn history for a single address, reconstructed from block-explorer
// transaction history — the contract only exposes an address's MOST RECENT active
// cycle cheaply, so there's no on-chain getter for "batches in cycle N". We rebuild
// it from the wallet's own burnBatch(uint256) transactions.
//
// ── Data sources ────────────────────────────────────────────────────────────
// Same shape as utils/donors.js (the Booty Board): Blockscout keyless (CORS-open,
// Etherscan-compatible) is the workhorse; Etherscan V2 (needs VITE_ETHERSCAN_API_KEY,
// free tier = Ethereum + Polygon only) is merged in as redundancy when configured.
// Rows dedupe by tx hash. Only Ethereum/Polygon/Base/Optimism have a usable keyless
// explorer API — BSC/Avalanche/PulseChain/EthereumPoW return { supported:false } and
// the UI falls back to the lifetime on-chain snapshot instead.
import { ethers } from 'ethers';
import { CHAINS, getBatchSize } from '../config/chains';
import { DBXEN_ABI } from '../config/abis';

// burnBatch(uint256) — the only method we care about. First (only) arg = batch count.
const BURN_SELECTOR = ethers.id('burnBatch(uint256)').slice(0, 10);

const SOURCES = {
  ethereum: { chainid: 1,    etherscanFree: true,  blockscout: 'https://eth.blockscout.com/api' },
  polygon:  { chainid: 137,  etherscanFree: true,  blockscout: 'https://polygon.blockscout.com/api' },
  base:     { chainid: 8453, etherscanFree: false, blockscout: 'https://base.blockscout.com/api' },
  optimism: { chainid: 10,   etherscanFree: false, blockscout: 'https://explorer.optimism.io/api' },
};
const API_KEY = import.meta.env.VITE_ETHERSCAN_API_KEY;
const ES_API = 'https://api.etherscan.io/v2/api';

export function isBurnHistorySupported(chainKey) {
  return !!SOURCES[chainKey];
}

// ── Troll-guard ──────────────────────────────────────────────────────────────
// Layered so button-mashing the address dropdown can't hammer the free explorer/RPC
// APIs: (1) an L1 in-memory + L2 persistent LRU cache so repeat opens cost nothing,
// (2) in-flight dedupe so a double-click shares one request, (3) a token-bucket rate
// limiter that gently slows a click-happy user to a trickle, (4) a concurrency cap so a
// burst can't fire many explorer fetches at once. All client-side and per-browser — it
// protects the shared free-tier quotas and keeps a heavy user from degrading their own
// session; it is NOT a server-side boundary (the public RPCs are the providers' to guard).
const MEM_TTL = 5 * 60 * 1000;         // L1 same-session freshness
const PERSIST_KEY = 'dbxen-burnhist-v1';
const PERSIST_TTL = 10 * 60 * 1000;    // L2 cross-reload freshness (closed cycles barely change)
const LRU_MAX = 60;                    // addresses kept in the persistent store (all chains)
const BUCKET_MAX = 5;                  // burst allowance for new-address fetches
const BUCKET_REFILL_MS = 2000;         // then ~1 fetch / 2s
const MAX_CONCURRENT = 3;              // parallel explorer fetches at once

const mem = new Map();                 // key -> { ts, data }  (L1)
const inflight = new Map();            // key -> Promise        (dedupe)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Persistent LRU store (quota-safe, self-healing) ──
// BigInt fields (fee/xen) can't be JSON-serialized, so encode them to strings on write
// and revive on read.
function encode(data) {
  if (!data || !Array.isArray(data.cycles)) return data;
  return {
    supported: data.supported,
    cycles: data.cycles.map((e) => ({ ...e, fee: e.fee.toString(), xen: e.xen.toString() })),
    totals: data.totals ? { ...data.totals, fee: data.totals.fee.toString(), xen: data.totals.xen.toString() } : null,
  };
}
function decode(enc) {
  if (!enc || !Array.isArray(enc.cycles)) return enc;
  return {
    supported: enc.supported,
    cycles: enc.cycles.map((e) => ({ ...e, fee: BigInt(e.fee), xen: BigInt(e.xen) })),
    totals: enc.totals ? { ...enc.totals, fee: BigInt(enc.totals.fee), xen: BigInt(enc.totals.xen) } : null,
  };
}
function loadStore() {
  try { const o = JSON.parse(localStorage.getItem(PERSIST_KEY)); if (o && o.v === 1 && o.entries) return o; }
  catch { /* corrupt/absent → fresh */ }
  return { v: 1, entries: {} };
}
function saveStore(store) {
  const evictOldest = (n) => {
    const ks = Object.keys(store.entries).sort((a, b) => store.entries[a].ts - store.entries[b].ts);
    for (const k of ks.slice(0, n)) delete store.entries[k];
  };
  const over = Object.keys(store.entries).length - LRU_MAX;
  if (over > 0) evictOldest(over);
  try { localStorage.setItem(PERSIST_KEY, JSON.stringify(store)); }
  catch { // quota exceeded — drop the oldest half and retry once, else give up quietly
    evictOldest(Math.ceil(Object.keys(store.entries).length / 2));
    try { localStorage.setItem(PERSIST_KEY, JSON.stringify(store)); } catch { /* fail soft */ }
  }
}
function persistGet(key, now) {
  const store = loadStore();
  const e = store.entries[key];
  if (!e || now - e.ts >= PERSIST_TTL) return null;
  e.ts = now;                    // LRU touch: recently viewed = kept
  saveStore(store);
  return decode(e.data);
}
function persistSet(key, data, now) {
  const store = loadStore();
  store.entries[key] = { ts: now, data: encode(data) };
  saveStore(store);
}

// ── Token bucket (rate limit) ──
let tokens = BUCKET_MAX;
let lastRefill = Date.now();
function refill() {
  const now = Date.now();
  const gained = Math.floor((now - lastRefill) / BUCKET_REFILL_MS);
  if (gained > 0) { tokens = Math.min(BUCKET_MAX, tokens + gained); lastRefill += gained * BUCKET_REFILL_MS; }
}
async function takeToken() {
  for (;;) {
    refill();
    if (tokens > 0) { tokens -= 1; return; }
    await sleep(Math.max(50, BUCKET_REFILL_MS - (Date.now() - lastRefill)));
  }
}

// ── Concurrency semaphore ──
let active = 0;
const queue = [];
function acquire() {
  if (active < MAX_CONCURRENT) { active += 1; return Promise.resolve(); }
  return new Promise((resolve) => queue.push(resolve));
}
function release() {
  active -= 1;
  if (queue.length && active < MAX_CONCURRENT) { active += 1; queue.shift()(); }
}

async function txlist(base, params) {
  const url = `${base}?${new URLSearchParams(params)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(9000) });
  const d = await r.json();
  return Array.isArray(d.result) ? d.result : [];
}

// Reconstructs one address's per-cycle burn history on the given chain. `provider`
// is any ethers read provider for that chain (used for the per-cycle on-chain reads
// that turn raw batches into an est. DXN reward). Guarded by the layers above.
export async function fetchBurnHistory(chainKey, address, provider) {
  const src = SOURCES[chainKey];
  if (!src) return { supported: false };
  const addr = address.toLowerCase();
  const key = `${chainKey}:${addr}`;
  const now = Date.now();

  // L1 → L2 → shared in-flight request, before touching the network at all.
  const m = mem.get(key);
  if (m && now - m.ts < MEM_TTL) return m.data;
  const p = persistGet(key, now);
  if (p) { mem.set(key, { ts: now, data: p }); return p; }
  if (inflight.has(key)) return inflight.get(key);

  const job = (async () => {
    await takeToken();   // rate limit: a click-happy user slows to the refill rate
    await acquire();     // concurrency cap: at most MAX_CONCURRENT fetches at once
    try {
      const data = await fetchBurnHistoryNetwork(chainKey, addr, provider, src);
      const ts = Date.now();
      mem.set(key, { ts, data });
      persistSet(key, data, ts);
      return data;
    } finally {
      release();
    }
  })();
  inflight.set(key, job);
  try { return await job; } finally { inflight.delete(key); }
}

async function fetchBurnHistoryNetwork(chainKey, addr, provider, src) {
  const c = CHAINS[chainKey];
  const dbx = new ethers.Contract(c.contracts.DBXEN_V2, DBXEN_ABI, provider);

  // Cycle clock is per-chain — read THIS chain's DBXen timing, not Ethereum's.
  const [initTs, period] = await Promise.all([dbx.i_initialTimestamp(), dbx.i_periodDuration()]);
  const init = Number(initTs), per = Number(period);
  if (!(per > 0)) return { supported: true, cycles: [], totals: null };

  const listParams = { module: 'account', action: 'txlist', address: addr, sort: 'desc', page: '1', offset: '10000' };
  const useEtherscan = API_KEY && src.etherscanFree;
  const [bs, es] = await Promise.all([
    txlist(src.blockscout, listParams).catch(() => []),
    useEtherscan ? txlist(ES_API, { chainid: src.chainid, ...listParams, apikey: API_KEY }).catch(() => []) : Promise.resolve([]),
  ]);

  // Keep only successful burnBatch calls into the DBXen contract, deduped by hash.
  const dbxAddr = c.contracts.DBXEN_V2.toLowerCase();
  const txs = new Map();
  for (const tx of [...bs, ...es]) {
    if (tx.to?.toLowerCase() !== dbxAddr) continue;
    if (tx.isError && tx.isError !== '0') continue;
    if (!tx.input || tx.input.slice(0, 10).toLowerCase() !== BURN_SELECTOR) continue;
    txs.set(tx.hash, tx);
  }

  const batchSize = getBatchSize(c);
  // Bucket burns into cycles. batchNumber is the first (only) uint256 arg after the selector.
  const byCycle = new Map();
  for (const tx of txs.values()) {
    let batches;
    try { batches = Number(BigInt('0x' + tx.input.slice(10, 74))); } catch { continue; }
    if (!Number.isFinite(batches) || batches <= 0) continue;
    const ts = Number(tx.timeStamp);
    const cycle = Math.floor((ts - init) / per);
    if (cycle < 0) continue;
    const e = byCycle.get(cycle) || { cycle, ts, batches: 0, fee: 0n, txCount: 0 };
    e.batches += batches;
    e.fee += (() => { try { return BigInt(tx.value || '0'); } catch { return 0n; } })();
    e.txCount += 1;
    e.ts = Math.max(e.ts, ts); // latest burn in the cycle for the date column
    byCycle.set(cycle, e);
  }

  const cycles = [...byCycle.values()].sort((a, b) => b.cycle - a.cycle);

  // Turn batches into an est. DXN reward per cycle: your batches ÷ cycle-total-batches
  // × that cycle's reward. Both are cheap single eth_calls; batch them per distinct cycle.
  await Promise.all(cycles.map(async (e) => {
    try {
      const [totalBN, rewardBN] = await Promise.all([
        dbx.cycleTotalBatchesBurned(e.cycle).catch(() => 0n),
        dbx.rewardPerCycle(e.cycle).catch(() => 0n),
      ]);
      const total = Number(totalBN);
      e.estDxn = total > 0 ? (e.batches / total) * parseFloat(ethers.formatEther(rewardBN)) : 0;
    } catch { e.estDxn = 0; }
    e.xen = BigInt(e.batches) * batchSize;
  }));

  const totals = cycles.reduce((t, e) => {
    t.batches += e.batches; t.fee += e.fee; t.estDxn += e.estDxn; t.xen += e.xen; t.txCount += e.txCount;
    return t;
  }, { batches: 0, fee: 0n, estDxn: 0, xen: 0n, txCount: 0 });

  return { supported: true, cycles, totals: cycles.length ? totals : null };
}
