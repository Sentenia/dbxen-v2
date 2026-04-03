import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { CHAINS } from '../config/chains';
import { useWallet } from '../hooks/WalletContext';

export default function MobileChainDot() {
  const { chainKey, switchChain } = useWallet();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const wrapRef = useRef(null);
  const ddRef = useRef(null);
  const chain = CHAINS[chainKey];

  const handleToggle = () => {
    if (!open && wrapRef.current) {
      const btn = wrapRef.current.querySelector('.mobile-chain-dot-btn');
      if (btn) {
        const rect = btn.getBoundingClientRect();
        setPos({ top: rect.bottom + 6, left: Math.max(8, rect.left - 60) });
      }
    }
    setOpen(o => !o);
  };

  // Close on tap/click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (!wrapRef.current?.contains(e.target) && !ddRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('touchstart', handler);
    document.addEventListener('mousedown', handler);
    return () => {
      document.removeEventListener('touchstart', handler);
      document.removeEventListener('mousedown', handler);
    };
  }, [open]);

  const dropdown = open ? createPortal(
    <div ref={ddRef} className="mobile-chain-dropdown" style={{ top: pos.top, left: pos.left }}>
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
    </div>,
    document.body
  ) : null;

  return (
    <div ref={wrapRef} className="mobile-chain-dot-wrap">
      <button className="mobile-chain-dot-btn" onClick={handleToggle} aria-label="Select chain">
        <span className="mobile-chain-dot" style={{ background: chain.color }} />
        <ChevronDown size={10} className="mobile-chain-chevron" />
      </button>
      {dropdown}
    </div>
  );
}
