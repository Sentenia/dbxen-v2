import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { CHAINS } from '../config/chains';
import { useWallet } from '../hooks/WalletContext';

export default function ChainSelector() {
  const { chainKey, switchChain } = useWallet();
  const [open, setOpen] = useState(false);
  const chain = CHAINS[chainKey];

  const dropdown = open ? createPortal(
    <>
      <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
      <div style={{
        position: 'fixed', top: 60, right: 16, zIndex: 9999,
        minWidth: 200, maxHeight: '70vh', overflowY: 'auto',
        background: '#111827', border: '1px solid #1e2a3a', borderRadius: 12,
        padding: 6, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}>
        {Object.entries(CHAINS).map(([k, c]) => (
          <button
            key={k}
            className={`chain-opt${k === chainKey ? ' active' : ''}`}
            onClick={() => { setOpen(false); if (k !== chainKey) switchChain(k); }}
          >
            <span className="chain-dot-lg" style={{ background: c.color }} />
            {c.name}
          </button>
        ))}
      </div>
    </>,
    document.body
  ) : null;

  return (
    <div className="chain-selector">
      <button className="chain-sel-btn" onClick={() => setOpen(o => !o)}>
        <span className="chain-dot-lg" style={{ background: chain.color }} />
        <span>{chain.name}</span>
        <ChevronDown size={12} />
      </button>
      {dropdown}
    </div>
  );
}