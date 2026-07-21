// Persistent cache for the Activity burn feed (the current cycle's per-address burns,
// reconstructed from getLogs). Lets each refresh scan only NEW blocks since the last one
// instead of re-scanning the whole cycle every 30s, and lets a reload seed instantly.
//
// One entry per chain, holding ONLY the current cycle: { cycle, lastBlock, burners }
// where burners = { [addr]: { batches, txCount } }. Tiny (a handful of addresses per
// chain), so no LRU/quota gymnastics needed — a new cycle simply overwrites the entry.
const KEY = 'dbxen-actfeed-v1';

export function loadFeed(chainKey) {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || 'null');
    return o?.[chainKey] || null;
  } catch { return null; }
}

export function saveFeed(chainKey, entry) {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || 'null') || {};
    o[chainKey] = entry;
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch { /* private mode / quota — cache is best-effort */ }
}
