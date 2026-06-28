import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Coins, RefreshCw } from 'lucide-react';
import { CHAINS } from '../config/chains';
import { fmt } from '../utils/helpers';
import { useWallet } from '../hooks/WalletContext';

// Circulating DXNv2 = totalSupply - balance held at the dead address (burned).
const DEAD = '0x000000000000000000000000000000000000dEaD';
const SUPPLY_ABI = [
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
];
const CACHE_KEY = 'dxnv2_supply_v2';
const todayStr = () => new Date().toISOString().slice(0, 10);

// Browser-friendly (CORS-enabled) public RPCs per chain, tried before the config
// endpoints — the config uses ankr/cloudflare/polygon-rpc which often block CORS.
// CORS-enabled public RPCs only (publicnode/drpc). NO llamarpc — it CORS-blocks in browsers.
const SUPPLY_RPCS = {
  ethereum:   ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org'],
  optimism:   ['https://optimism-rpc.publicnode.com', 'https://optimism.drpc.org'],
  base:       ['https://base-rpc.publicnode.com', 'https://base.drpc.org'],
  avalanche:  ['https://avalanche-c-chain-rpc.publicnode.com', 'https://api.avax.network/ext/bc/C/rpc'],
  bsc:        ['https://bsc-rpc.publicnode.com', 'https://bsc.drpc.org'],
  polygon:    ['https://polygon-bor-rpc.publicnode.com', 'https://polygon.drpc.org'],
  ethw:       ['https://mainnet.ethereumpow.org'],
  pulsechain: ['https://rpc.pulsechain.com', 'https://rpc-pulsechain.g4mm4.io'],
};

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);
}

async function makeProvider(key, c) {
  const urls = [...(SUPPLY_RPCS[key] || []), c.rpc, c.rpcBackup].filter(Boolean);
  for (const url of urls) {
    try {
      const p = new ethers.JsonRpcProvider(url, undefined, { staticNetwork: true });
      await withTimeout(p.getBlockNumber(), 6000);
      return p;
    } catch { /* fail fast, try next */ }
  }
  return null;
}

// One number per chain: sum circulating across the chain's DXNv2 token(s).
// PulseChain has a current + a legacy token, so include both when present.
async function fetchChainSupply(key, c) {
  const provider = await makeProvider(key, c);
  if (!provider) return { key, error: true };
  const tokens = [c.contracts.DXN_V2, ...(c.legacy?.DXN_V2 ? [c.legacy.DXN_V2] : [])];
  let circulating = 0n, total = 0n, burned = 0n, gotAny = false;
  for (const t of tokens) {
    try {
      const token = new ethers.Contract(t, SUPPLY_ABI, provider);
      const [ts, dead] = await withTimeout(
        Promise.all([token.totalSupply(), token.balanceOf(DEAD)]), 8000
      );
      total += ts; burned += dead; circulating += ts - dead; gotAny = true;
    } catch { /* skip this token */ }
  }
  if (!gotAny) return { key, error: true };
  return { key, circulating, total, burned };
}

export default function SupplyPanel() {
  // Feature whatever chain the wallet is on (defaults to ethereum / when disconnected).
  const w = useWallet();
  const switchChain = w?.switchChain;
  const activeKey = (w?.chainKey && CHAINS[w.chainKey]) ? w.chainKey : 'ethereum';
  const [data, setData] = useState(() => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || null; } catch { return null; }
  });
  const [loading, setLoading] = useState(!data);
  const [cooldown, setCooldown] = useState(false);

  // Manual refresh: fetches all chains, then locks the button for a minute so it
  // can't be spam-clicked into hammering 8 chains' worth of RPCs.
  async function handleRefresh() {
    if (loading || cooldown) return;
    setCooldown(true);
    setTimeout(() => setCooldown(false), 60000);
    await load(true);
  }

  async function load(force = false) {
    setLoading(true);
    const keys = Object.keys(CHAINS);
    const results = await Promise.all(keys.map((k) => fetchChainSupply(k, CHAINS[k])));
    const chains = {};
    let grandCirc = 0n, grandBurned = 0n;
    for (const r of results) {
      if (r.error) { chains[r.key] = null; continue; }
      chains[r.key] = { circulating: r.circulating.toString(), burned: r.burned.toString() };
      grandCirc += r.circulating; grandBurned += r.burned;
    }
    const payload = {
      date: todayStr(), updatedAt: Date.now(), chains,
      grandCirc: grandCirc.toString(), grandBurned: grandBurned.toString(),
    };
    setData(payload);
    setLoading(false);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(payload)); } catch { /* ignore */ }
  }

  useEffect(() => {
    // Show cache instantly. Skip the daily refetch only if today's cache is COMPLETE
    // (every chain present) — otherwise retry so previously-failed chains fill in.
    const complete = data && Object.keys(CHAINS).every((k) => data.chains?.[k]);
    if (data?.date === todayStr() && complete) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const order = Object.keys(CHAINS);
  const updated = data?.updatedAt ? new Date(data.updatedAt).toLocaleString() : null;

  return (
    <section className="content supply-panel fade-up">
      <div className="card">
        <div className="card-header" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="card-icon" style={{ background: 'linear-gradient(135deg, var(--amber), #d97706)' }}>
              <Coins size={20} color="#1a1205" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 20 }}>DXNv2 Circulating Supply</h2>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Circulating DXNv2 per chain (excludes burned tokens) · updates daily
              </div>
            </div>
          </div>
          <button
            className="icon-btn"
            onClick={handleRefresh}
            disabled={loading || cooldown}
            title={cooldown ? 'Just refreshed — try again in a moment' : 'Refresh all chains'}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: 8, cursor: loading || cooldown ? 'not-allowed' : 'pointer', color: 'var(--text-muted)', opacity: loading || cooldown ? 0.5 : 1 }}
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
          </button>
        </div>

        {/* Featured: the connected chain */}
        <div style={{ textAlign: 'center', padding: '16px 0 24px' }}>
          <div style={{ fontSize: 40, fontWeight: 800, color: 'var(--amber)', lineHeight: 1.1 }}>
            {data?.chains?.[activeKey] ? fmt(data.chains[activeKey].circulating) : (loading ? '…' : '—')}
          </div>
          <div className="hero-stat-label">{CHAINS[activeKey]?.name} · DXNv2 in circulation</div>
        </div>

        {/* Other chains */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
          {order.filter((key) => key !== activeKey).map((key) => {
            const c = CHAINS[key];
            const row = data?.chains?.[key];
            return (
              <div key={key} className="supply-chain-card" onClick={() => switchChain?.(key)} title={`Switch to ${c.name}`} style={{ background: 'var(--bg-card-hover, rgba(255,255,255,0.03))', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.color, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary, #cbd5e1)', fontWeight: 600 }}>{c.name}</span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {row ? fmt(row.circulating) : (loading ? '…' : '—')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {c.dxnSym}
                </div>
              </div>
            );
          })}
        </div>

        {updated && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', marginTop: 14 }}>
            Last updated {updated}
          </div>
        )}
      </div>
    </section>
  );
}
