import { useState, useEffect, useRef } from 'react';

// Format a number at the appropriate scale (T/B/M or locale string)
function formatNum(val, target, decimals) {
  if (target >= 1e12) return (val / 1e12).toFixed(2) + 'T';
  if (target >= 1e9) return (val / 1e9).toFixed(2) + 'B';
  if (target >= 1e6) return (val / 1e6).toFixed(2) + 'M';
  return val.toLocaleString('en-US', { maximumFractionDigits: decimals });
}

// Animated counter: counts up from 0 on first load, crossfades on subsequent updates
export default function AnimatedNumber({ value, decimals = 2, suffix = '', prefix = '', duration = 1200 }) {
  const [display, setDisplay] = useState('—');
  const [fading, setFading] = useState(false);
  const prevValue = useRef(null);
  const hasAnimatedOnce = useRef(false);
  const rafRef = useRef(null);
  const fadeTimer = useRef(null);

  useEffect(() => {
    if (value === null || value === undefined || value === '—') {
      setDisplay('—');
      return;
    }

    const numVal = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numVal)) { setDisplay(String(value)); return; }

    // Same value — do nothing
    if (prevValue.current !== null && prevValue.current === numVal) return;

    const oldVal = prevValue.current;
    prevValue.current = numVal;

    if (!hasAnimatedOnce.current) {
      // First load: count up from 0
      hasAnimatedOnce.current = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const startTime = performance.now();

      const animate = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = numVal * eased;
        setDisplay(formatNum(current, numVal, decimals));
        if (progress < 1) rafRef.current = requestAnimationFrame(animate);
      };

      rafRef.current = requestAnimationFrame(animate);
    } else {
      // Subsequent update (chain switch, refresh): quick crossfade
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
      setFading(true);
      fadeTimer.current = setTimeout(() => {
        setDisplay(formatNum(numVal, numVal, decimals));
        setFading(false);
      }, 150);
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    };
  }, [value, decimals, duration]);

  return (
    <span style={{ opacity: fading ? 0 : 1, transition: 'opacity 150ms ease-in-out' }}>
      {prefix}{display}{suffix}
    </span>
  );
}
