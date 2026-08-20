import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { CheckCircle2, ArrowLeftRight } from 'lucide-react';
import { CHAINS } from '../config/chains';
import { fmt } from '../utils/helpers';

// The migration bridges are permanently closed (all unclaimed DXNv2 swept to 0xdEaD,
// ownership renounced). This card is a read-only record of how much was migrated 1:1.
const SINGLE_ABI = ['function totalSwapped() view returns (uint256)'];
const DUAL_ABI = [
  'function totalSwappedV1() view returns (uint256)',
  'function totalSwappedV2() view returns (uint256)',
];
const CACHE_KEY = 'dxnv2_bridged_v1';

// Browser-CORS-friendly public RPCs (config endpoints use ankr/cloudflare which block CORS).
// CORS-enabled public RPCs only (publicnode/drpc). NO llamarpc — it CORS-blocks in browsers.
const RPCS = {
  ethereum:   ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org'],
  optimism:   ['https://optimism-rpc.publicnode.com', 'https://optimism.drpc.org'],
  base:       ['https://base-rpc.publicnode.com', 'https://base.drpc.org'],
  avalanche:  ['https://avalanche-c-chain-rpc.publicnode.com', 'https://api.avax.network/ext/bc/C/rpc'],
  bsc:        ['https://bsc-rpc.publicnode.com', 'https://bsc.drpc.org'],
  polygon:    ['https://polygon.publicnode.com', 'https://polygon.drpc.org'],
  ethw:       ['https://mainnet.ethereumpow.org'],
  pulsechain: ['https://rpc.pulsechain.com', 'https://rpc-pulsechain.g4mm4.io'],
};

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))]);

async function makeProvider(key, c) {
  // Pinned chainId: skips ethers' network detection, which retry-loops forever
  // against a dead/CORS-blocked RPC (see SupplyPanel.makeProvider).
  const network = parseInt(c.chainId, 16);
  for (const url of [...(RPCS[key] || []), c.rpc, c.rpcBackup].filter(Boolean)) {
    const p = new ethers.JsonRpcProvider(url, network, { staticNetwork: true });
    try { await withTimeout(p.getBlockNumber(), 6000); return p; }
    catch { p.destroy(); /* next */ }
  }
  return null;
}

async function readMig(provider, addr, dual) {
  if (dual) {
    const m = new ethers.Contract(addr, DUAL_ABI, provider);
    const [v1, v2] = await withTimeout(Promise.all([m.totalSwappedV1(), m.totalSwappedV2()]), 8000);
    return v1 + v2;
  }
  const m = new ethers.Contract(addr, SINGLE_ABI, provider);
  return withTimeout(m.totalSwapped(), 8000);
}

async function fetchChain(key, c) {
  const provider = await makeProvider(key, c);
  if (!provider) return { key, error: true };
  // PulseChain: dual migration (current) + a legacy single migration.
  const migs = c.dualMigration
    ? [{ addr: c.contracts.MIGRATION, dual: true }, ...(c.legacy?.MIGRATION ? [{ addr: c.legacy.MIGRATION, dual: false }] : [])]
    : [{ addr: c.contracts.MIGRATION, dual: false }];
  let total = 0n, got = false;
  for (const mg of migs) {
    try { total += await readMig(provider, mg.addr, mg.dual); got = true; }
    catch { /* skip */ }
  }
  return got ? { key, bridged: total.toString() } : { key, error: true };
}

export default function MigrationStats() {
  const [data, setData] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || null; } catch { return null; }
  });
  const [loading, setLoading] = useState(!data);

  async function load() {
    setLoading(true);
    const keys = Object.keys(CHAINS);
    const results = await Promise.all(keys.map((k) => fetchChain(k, CHAINS[k])));
    const chains = {};
    let grand = 0n;
    for (const r of results) {
      if (r.error) { chains[r.key] = null; continue; }
      chains[r.key] = r.bridged; grand += BigInt(r.bridged);
    }
    const payload = { updatedAt: Date.now(), chains, grand: grand.toString() };
    setData(payload); setLoading(false);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(payload)); } catch { /* ignore */ }
  }

  useEffect(() => {
    // Values are frozen (bridges closed) — only fetch if we don't already have a complete set.
    const complete = data && Object.keys(CHAINS).every((k) => data.chains?.[k]);
    if (complete) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const order = Object.keys(CHAINS);

  return (
    <div className="card fade-up">
      <div className="card-header">
        <div className="card-icon" style={{ background: 'linear-gradient(135deg, var(--cyan), var(--cyan-dim))' }}>
          <ArrowLeftRight size={20} color="white" />
        </div>
        <div>
          <div className="card-title">Migration Complete</div>
          <div className="card-desc">1:1 swap of v1 DXN → DXNv2 across all chains, now permanently closed</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'var(--green-glow, rgba(52,211,153,0.08))', border: '1px solid var(--green-glow, rgba(52,211,153,0.25))', marginBottom: 20 }}>
        <CheckCircle2 size={16} style={{ color: 'var(--green)', flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: 'var(--text-secondary, #cbd5e1)' }}>
          Bridges closed. Unclaimed DXNv2 was burned to the dead address and ownership renounced on every chain.
        </span>
      </div>

      <div style={{ textAlign: 'center', padding: '8px 0 22px' }}>
        <div style={{ fontSize: 40, fontWeight: 800, color: 'var(--cyan)', lineHeight: 1.1 }}>
          {data?.grand != null ? fmt(data.grand) : (loading ? '…' : '—')}
        </div>
        <div className="hero-stat-label">Total v1 DXN migrated (all chains)</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
        {order.map((key) => {
          const c = CHAINS[key];
          const v = data?.chains?.[key];
          return (
            <div key={key} style={{ background: 'var(--bg-card-hover, rgba(255,255,255,0.03))', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.color, display: 'inline-block', flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: 'var(--text-secondary, #cbd5e1)', fontWeight: 600 }}>{c.name}</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
                {v ? fmt(v) : (loading ? '…' : '—')}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {c.dxnSym} migrated
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
