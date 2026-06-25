// DexScreener-based DXN price (denominated in the chain's native token), used for
// the staking APR. We derive dxn-in-native = dxnUsd / nativeUsd so it's unambiguous
// regardless of which quote token the DXN pool uses. Cached 10 min per chain.
//
// Note: DXNv2 pools are thin, so this price (and the resulting APR) is a rough estimate.
// Chains without a DXN DEX pool (e.g. ETHW, current PulseChain token) return null.

import { ethers } from 'ethers';

const DEX = {
  ethereum:   { id: 'ethereum',   wnative: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' }, // WETH
  polygon:    { id: 'polygon',    wnative: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270' }, // WPOL/WMATIC
  avalanche:  { id: 'avalanche',  wnative: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7' }, // WAVAX
  bsc:        { id: 'bsc',        wnative: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' }, // WBNB
  base:       { id: 'base',       wnative: '0x4200000000000000000000000000000000000006' }, // WETH
  optimism:   { id: 'optimism',   wnative: '0x4200000000000000000000000000000000000006' }, // WETH
  pulsechain: { id: 'pulsechain', wnative: '0xA1077a294dDE1B09bB078844df40758a5D0f9a27' }, // WPLS
  // ethw: DexScreener has no coverage
};

const cache = {};
const TTL = 10 * 60 * 1000;

async function tokenUsd(dexId, addr) {
  const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addr}`);
  if (!r.ok) return null;
  const d = await r.json();
  const pairs = (d.pairs || []).filter((p) => p.chainId === dexId && p.priceUsd);
  if (!pairs.length) return null;
  pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
  const px = parseFloat(pairs[0].priceUsd);
  return Number.isFinite(px) && px > 0 ? px : null;
}

// DXNv2/WETH trades only in a Uniswap V3 1%-fee pool on Ethereum that DexScreener
// does NOT index, so we read the price straight from the pool on-chain. Both tokens
// are 18 decimals, so no decimal adjustment is needed. Cached 60s. Needs an
// Ethereum provider. Returns DXNv2 price denominated in ETH, or null.
const DXNV2_ETH = '0x1b08d317963cc65932f3f79f00987b2e23df52ab';
const DXNV2_ETH_POOL = '0x582B074e1016e8774D91dBF5c88E9859a6c7E7d8';
const V3_POOL_ABI = [
  'function slot0() view returns (uint160 sqrtPriceX96, int24, uint16, uint16, uint16, uint8, bool)',
  'function token0() view returns (address)',
];
export async function getDxnV2InEth(provider, nowMs) {
  const hit = cache.__dxnv2eth;
  if (hit && nowMs - hit.ts < 60 * 1000) return hit.val;
  try {
    const pool = new ethers.Contract(DXNV2_ETH_POOL, V3_POOL_ABI, provider);
    const [s, t0] = await Promise.all([pool.slot0(), pool.token0()]);
    const sp = Number(s[0]); // sqrtPriceX96
    if (!sp) return null;
    const t1PerT0 = (sp / 2 ** 96) ** 2; // token1 per token0
    const val = t0.toLowerCase() === DXNV2_ETH ? t1PerT0 : 1 / t1PerT0;
    cache.__dxnv2eth = { val, ts: nowMs };
    return val;
  } catch {
    return null;
  }
}

// Native-token (wrapped) price in USD via DexScreener for a given chain, cached
// 10 min. Returns null if the chain has no DexScreener coverage (e.g. ETHW).
export async function getNativeUsd(chainKey, nowMs) {
  const cfg = DEX[chainKey];
  if (!cfg) return null;
  const k = '__nat_' + chainKey;
  const hit = cache[k];
  if (hit && nowMs - hit.ts < TTL) return hit.val;
  try {
    const val = await tokenUsd(cfg.id, cfg.wnative);
    cache[k] = { val, ts: nowMs };
    return val;
  } catch {
    return null;
  }
}
export async function getEthUsd(nowMs) { return getNativeUsd('ethereum', nowMs); }

// Returns DXN price denominated in the chain's native token, or null if unavailable.
export async function getDxnPriceInNative(chainKey, dxnAddr, nowMs) {
  const cfg = DEX[chainKey];
  if (!cfg || !dxnAddr) return null;
  const hit = cache[chainKey];
  if (hit && nowMs - hit.ts < TTL) return hit.val;
  try {
    const [dxnUsd, nativeUsd] = await Promise.all([
      tokenUsd(cfg.id, dxnAddr),
      tokenUsd(cfg.id, cfg.wnative),
    ]);
    const val = dxnUsd && nativeUsd ? dxnUsd / nativeUsd : null;
    cache[chainKey] = { val, ts: nowMs };
    return val;
  } catch {
    return null;
  }
}
