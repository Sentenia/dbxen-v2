import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { CHAINS } from '../config/chains';
import { useWallet } from '../hooks/WalletContext';

export default function ChainSelector() {
  const { chainKey, switchChain } = useWallet();
  const [open, setOpen] = useState(false);
  const chain = CHAINS[chainKey];

  return (
    <>
      {open && <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 999 }} />}
      <div className="chain-selector" style={{ zIndex: 1000 }}>
        <button className="chain-sel-btn" onClick={() => setOpen(o => !o)}>
          <span className="chain-dot-lg" style={{ background: chain.color }} />
          <span>{chain.name}</span>
          <ChevronDown size={12} />
        </button>
        {open && (
          <div className="chain-dd show" style={{ maxHeight: '70vh', overflowY: 'auto', zIndex: 1001 }}>
            {Object.entries(CHAINS).map(([k, c]) => (
              <button
                key={k}
                className={`chain-opt${k === chainKey ? ' active' : ''}`}
                onClick={() => {
                  setOpen(false);
                  if (k !== chainKey) switchChain(k);
                }}
              >
                <span className="chain-dot-lg" style={{ background: c.color }} />
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}