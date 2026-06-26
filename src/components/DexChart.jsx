import { CandlestickChart, ExternalLink } from 'lucide-react';
import { useWallet } from '../hooks/WalletContext';

// DXNv2 charts per chain. DexScreener indexes the pools on these chains:
const DEX_PAIRS = {
  ethereum:   '0x582B074e1016e8774D91dBF5c88E9859a6c7E7d8', // Uniswap V3 1%
  bsc:        '0x475E72747Fc0328125C7B2A87E30d2318D859071',
  optimism:   '0x625Dd1efE8A6cc24a02aa94d51ceE99DB3d3b5aA',
  pulsechain: '0x899ee07295f9910D314B61291b014396869d7009', // PulseX
};
// Polygon/Avalanche/Base DXNv2 pools are Uniswap V4 (bytes32 pool IDs), which
// DexScreener doesn't index but GeckoTerminal does — fall back to that there.
// (Polygon + Avalanche share a pool ID: V4 IDs are derived from the pool key, and
// DXNv2 has the same token address on both, paired with native at the same fee.)
// Use regular-address (V3) pools where available — GeckoTerminal's embed widget
// renders those as a single clean chart, whereas V4 pools (32-byte IDs) fall back
// to the full page (double chart + CoinGecko header). Avalanche/Base are V4-only.
const GECKO_POOLS = {
  polygon:   { network: 'polygon_pos', pool: '0x837D6104759Cc1a824712E016747dD2D62bd840D' }, // V3 mDXNv2/WPOL
  avalanche: { network: 'avax',        pool: '0x2e8126bf876abaf5f17820b478eff524458e8f875d4b2ec4b702b743beb63a0b' },
  base:      { network: 'base',        pool: '0xda374615f777ed1b8f3d0d3617c17931fddba0d2a38db4ff6da099390c741dd0' },
};
// EthereumPoW has no DXNv2 pool anywhere → no chart.

function chartFor(chainKey) {
  if (DEX_PAIRS[chainKey]) {
    const full = `https://dexscreener.com/${chainKey}/${DEX_PAIRS[chainKey]}`;
    return { src: `${full}?embed=1&theme=dark&info=0&trades=0`, full, source: 'DexScreener' };
  }
  if (GECKO_POOLS[chainKey]) {
    const { network, pool } = GECKO_POOLS[chainKey];
    const full = `https://www.geckoterminal.com/${network}/pools/${pool}`;
    return { src: `${full}?embed=1&info=0&swaps=0&light_chart=0`, full, source: 'GeckoTerminal' };
  }
  return null;
}

export default function DexChart() {
  const { chainKey, chain } = useWallet();
  const chart = chartFor(chainKey);

  if (!chart) {
    return (
      <section className="content">
        <div className="dexchart-card dexchart-empty">
          <div className="dexchart-title">
            <CandlestickChart size={18} style={{ color: 'var(--text-muted)' }} /> DXNv2 Chart
          </div>
          <p className="dexchart-note">No DEX market for DXNv2 on {chain.name} yet — the main pool is on Ethereum.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="content">
      <div className="dexchart-card">
        <div className="dexchart-head">
          <div className="dexchart-title">
            <CandlestickChart size={18} style={{ color: 'var(--cyan)' }} />
            DXNv2 Price <span>· {chain.name}</span>
          </div>
          <a className="dexchart-link" href={chart.full} target="_blank" rel="noopener noreferrer">
            {chart.source} <ExternalLink size={12} />
          </a>
        </div>
        <div className="dexchart-frame">
          <iframe key={chainKey} title={`DXNv2 price chart on ${chain.name}`} src={chart.src} loading="lazy" />
        </div>
      </div>
    </section>
  );
}
