import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { CHAINS } from '../config/chains';
import { useWallet } from '../hooks/WalletContext';

export default function MobileChainDot() {
  const { chainKey, switchChain } = useWallet();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const chain = CHAINS[chainKey];

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 6, left: Math.max(8, rect.left - 60) });
    }
    setOpen(o => !o);
  };

  // Close on back button / escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const dropdown = open ? createPortal(
    <>
      <div className="mobile-chain-overlay" onClick={() => setOpen(false)} />
      <div className="mobile-chain-dropdown" style={{ top: pos.top, left: pos.left }}>
        {Object.entries(CHAINS).map(([k, c]) => (
          <button
            key={k}
            className={`mobile-chain-opt${k === chainKey ? ' active' : ''}`}
            onClick={() => { setOpen(false); if (k !== chainKey) switchChain(k); }}
          >
            <span className="mobile-chain-dot-item" style={{ background: c.color }} />
            {c.name}
          </button>
        ))}
      </div>
    </>,
    document.body
  ) : null;

  return (
    <button ref={btnRef} className="mobile-chain-dot-btn" onClick={handleToggle} aria-label="Select chain">
      <span className="mobile-chain-dot" style={{ background: chain.color }} />
      <ChevronDown size={10} className="mobile-chain-chevron" />
      {dropdown}
    </button>
  );
}
