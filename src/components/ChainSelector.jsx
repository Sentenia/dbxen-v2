import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { CHAINS } from '../config/chains';
import { useWallet } from '../hooks/WalletContext';

export default function ChainSelector() {
  const { chainKey, switchChain } = useWallet();
  const [open, setOpen] = useState(false);
  const chain = CHAINS[chainKey];

  return (
    <div className="chain-selector">
      <button className="chain-sel-btn" onClick={() => setOpen(o => !o)}>
        <span className="chain-dot-lg" style={{ background: chain.color }} />
        <span>{chain.name}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="chain-dd show" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {Object.entries(CHAINS).map(([k, c]) => (
            <button
              key={k}
              className={`chain-opt${k === chainKey ? ' active' : ''}`}
              onPointerUp={(e) => {
                e.preventDefault();
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
      {open && <div style={{ position: 'fixed', inset: 0, zIndex: 1001 }} onPointerUp={() => setOpen(false)} />}
    </div>
  );
}