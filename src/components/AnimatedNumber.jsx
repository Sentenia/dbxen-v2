import { useState, useEffect, useRef } from 'react';

// Animated counter that counts up from 0 to target value
export default function AnimatedNumber({ value, decimals = 2, suffix = '', prefix = '', duration = 1200 }) {
  const [display, setDisplay] = useState('—');
  const prevValue = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (value === null || value === undefined || value === '—') {
      setDisplay('—');
      return;
    }

    const numVal = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numVal)) { setDisplay(value); return; }

    const startVal = prevValue.current ?? 0;
    prevValue.current = numVal;
    const startTime = performance.now();

    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startVal + (numVal - startVal) * eased;

      // Always show 2 decimal places at T/B/M scale (matches fmt() behavior)
      if (numVal >= 1e12) setDisplay((current / 1e12).toFixed(2) + 'T');
      else if (numVal >= 1e9) setDisplay((current / 1e9).toFixed(2) + 'B');
      else if (numVal >= 1e6) setDisplay((current / 1e6).toFixed(2) + 'M');
      else setDisplay(current.toLocaleString('en-US', { maximumFractionDigits: decimals }));

      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value, decimals, duration]);

  return <>{prefix}{display}{suffix}</>;
}
