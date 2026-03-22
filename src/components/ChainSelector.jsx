import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { CHAINS } from '../config/chains';
import { useWallet } from '../hooks/WalletContext';

export default function ChainSelector() {
  const { chainKey, switchChain } = useWallet();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const chain = CHAINS[chainKey];

  // Close on outside tap — use pointerdown (fires before click, reliable on mobile)
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    // Delay listener attachment so the opening tap doesn't immediately close
    const id = requestAnimationFrame(() => {
      document.addEventListener('pointerdown', handler);
    });
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener('pointerdown', handler);
    };
  }, [open]);

  const handleSelect = useCallback((k) => {
    setOpen(false);
    if (k !== chainKey) switchChain(k);
  }, [chainKey, switchChain]);

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
              onClick={(e) => { e.stopPropagation(); handleSelect(k); }}
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
