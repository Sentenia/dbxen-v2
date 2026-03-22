import { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { CHAINS } from '../config/chains';
import { useWallet } from '../hooks/WalletContext';

export default function ChainSelector() {
  const { chainKey, switchChain } = useWallet();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const chain = CHAINS[chainKey];

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  return (
    <div className="chain-selector" ref={ref}>
      <button className="chain-sel-btn" onClick={() => setOpen(!open)}>
        <span className="chain-dot-lg" style={{ background: chain.color }} />
        <span>{chain.name}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="chain-dd show">
          {Object.entries(CHAINS).map(([k, c]) => (
            <button
              key={k}
              className={`chain-opt${k === chainKey ? ' active' : ''}`}
              onClick={() => { switchChain(k); setOpen(false); }}
            >
              <span className="chain-dot-lg" style={{ background: c.color }} />
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
