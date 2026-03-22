import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { CHAINS } from '../config/chains';
import { useWallet } from '../hooks/WalletContext';

export default function ChainSelector() {
  const { chainKey, switchChain } = useWallet();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const chain = CHAINS[chainKey];

  const handleToggle = (e) => {
    if (!open) {
      const rect = e.currentTarget.getBoundingClientRect();
      setPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    }
    setOpen(o => !o);
  };

  const dropdown = open ? createPortal(
    <>
      <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
      <div style={{
        position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999,
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
      <button className="chain-sel-btn" onClick={handleToggle}>
        <span className="chain-dot-lg" style={{ background: chain.color }} />
        <span>{chain.name}</span>
        <ChevronDown size={12} />
      </button>
      {dropdown}
    </div>
  );
}