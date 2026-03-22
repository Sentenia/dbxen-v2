import { useState, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { CHAINS } from '../config/chains';
import { useWallet } from '../hooks/WalletContext';

export default function ChainSelector() {
  const { chainKey, switchChain } = useWallet();
  const [open, setOpen] = useState(false);
  const chain = CHAINS[chainKey];

  const handleSelect = useCallback(async (k) => {
    setOpen(false);
    if (k !== chainKey) await switchChain(k);
  }, [chainKey, switchChain]);

  return (
    <div className="chain-selector">
      <button className="chain-sel-btn" onClick={() => setOpen(!open)}>
        <span className="chain-dot-lg" style={{ background: chain.color }} />
        <span>{chain.name}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <>
          <div className="chain-overlay" onClick={() => setOpen(false)} />
          <div className="chain-dd show">
            {Object.entries(CHAINS).map(([k, c]) => (
              <button
                key={k}
                className={`chain-opt${k === chainKey ? ' active' : ''}`}
                onClick={() => handleSelect(k)}
              >
                <span className="chain-dot-lg" style={{ background: c.color }} />
                {c.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
