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

const cache = new Map(); // `${chainKey}:${addr}` -> { ts, data }
const TTL = 5 * 60 * 1000;

async function txlist(base, params) {
  const url = `${base}?${new URLSearchParams(params)}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(9000) });
  const d = await r.json();
  return Array.isArray(d.result) ? d.result : [];
}

// Reconstructs one address's per-cycle burn history on the given chain. `provider`
// is any ethers read provider for that chain (used for the per-cycle on-chain reads
// that turn raw batches into an est. DXN reward).
export async function fetchBurnHistory(chainKey, address, provider) {
  const src = SOURCES[chainKey];
  if (!src) return { supported: false };
  const addr = address.toLowerCase();
  const key = `${chainKey}:${addr}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.ts < TTL) return hit.data;

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

  const data = { supported: true, cycles, totals: cycles.length ? totals : null };
  cache.set(key, { ts: now, data });
  return data;
}
