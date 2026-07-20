// Per-chain V1→V2 bridged DXN total ("totalSwapped") — the amount that came over 1:1
// from DBXen V1 and so is each chain's *starting* circulating DXNv2 supply. The bridges
// are permanently closed, so these numbers are FROZEN and safe to cache forever.
// MigrationStats already reads all chains into localStorage under BRIDGED_CACHE_KEY;
// we reuse that, and fall back to a direct single-chain read when the cache is cold.
import { ethers } from 'ethers';

export const BRIDGED_CACHE_KEY = 'dxnv2_bridged_v1';

const SINGLE_ABI = ['function totalSwapped() view returns (uint256)'];
const DUAL_ABI = [
  'function totalSwappedV1() view returns (uint256)',
  'function totalSwappedV2() view returns (uint256)',
];

// Bridged wei for one chain from the shared MigrationStats cache, or null if absent.
export function cachedBridgedWei(chainKey) {
  try {
    const raw = JSON.parse(localStorage.getItem(BRIDGED_CACHE_KEY) || 'null');
    const v = raw?.chains?.[chainKey];
    return v ? BigInt(v) : null;
  } catch { return null; }
}

// Live read of one chain's bridged total (dual chains sum V1+V2, plus any legacy
// migration contract). Returns bigint wei, or null if every read failed.
export async function readBridgedWei(c, provider) {
  const migs = c.dualMigration
    ? [{ addr: c.contracts.MIGRATION, dual: true }, ...(c.legacy?.MIGRATION ? [{ addr: c.legacy.MIGRATION, dual: false }] : [])]
    : [{ addr: c.contracts.MIGRATION, dual: false }];
  let total = 0n, got = false;
  for (const mg of migs) {
    try {
      if (mg.dual) {
        const m = new ethers.Contract(mg.addr, DUAL_ABI, provider);
        const [v1, v2] = await Promise.all([m.totalSwappedV1(), m.totalSwappedV2()]);
        total += v1 + v2;
      } else {
        const m = new ethers.Contract(mg.addr, SINGLE_ABI, provider);
        total += await m.totalSwapped();
      }
      got = true;
    } catch { /* skip this migration contract */ }
  }
  return got ? total : null;
}
