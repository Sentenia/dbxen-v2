import { useState, useEffect } from 'react';
import { CandlestickChart, ExternalLink } from 'lucide-react';

// NXDv2 trades in a single Uniswap V2 pool on Ethereum, quoted in DXNv2 —
// DexScreener indexes it, so the same embed the DBXen page uses works here.
const PAIR = '0x02ecfb5fF6D87B4206dF1E0DCa6D449b26c9a216';
const FULL = `https://dexscreener.com/ethereum/${PAIR}`;

export default function NXDChart() {
  // Same single-mount retry as DexChart: in production the first embed load can
  // be dropped during the heavy initial render and never retries on its own.
  const [retry, setRetry] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setRetry(true), 1200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="dexchart-card" style={{ marginTop: 24 }}>
      <div className="dexchart-head">
        <div className="dexchart-title">
          <CandlestickChart size={18} style={{ color: 'var(--cyan)' }} />
          NXDv2 / DXNv2 Price <span>· Ethereum</span>
        </div>
        <a className="dexchart-link" href={FULL} target="_blank" rel="noopener noreferrer">
          DexScreener <ExternalLink size={12} />
        </a>
      </div>
      <div className="dexchart-frame">
        <iframe key={String(retry)} title="NXDv2/DXNv2 price chart" src={`${FULL}?embed=1&theme=dark&info=0&trades=0`} />
      </div>
    </div>
  );
}
