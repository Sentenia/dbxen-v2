import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { fireEgg } from '../utils/eggs';

// Hidden fun. Konami code → background storm; typed keywords → little reactions;
// plus a message for anyone who opens the console. Nothing here touches wallet or
// transaction state — it's all cosmetic overlays + toasts.
const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
const COLORS = ['#f59e0b', '#22d3ee', '#34d399', '#e879f9', '#f87171', '#fde68a'];

export default function EasterEggs() {
  const [items, setItems] = useState([]);
  const idRef = useRef(0);

  useEffect(() => {
    const add = (item, ttl) => {
      const id = ++idRef.current;
      setItems((s) => [...s, { id, ...item }]);
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), ttl);
    };
    const floatEmoji = (content) => add({ kind: 'float', content, left: 10 + Math.random() * 80 }, 3200);
    const confetti = () => {
      for (let i = 0; i < 26; i++) add({ kind: 'confetti', left: Math.random() * 100, color: COLORS[i % COLORS.length], delay: Math.random() * 0.5 }, 3200);
    };
    const shake = () => {
      const app = document.querySelector('.app');
      if (!app) return;
      app.classList.add('egg-shake');
      setTimeout(() => app.classList.remove('egg-shake'), 600);
    };

    console.log('%cDBXen V2 🔥', 'color:#f59e0b;font-size:22px;font-weight:800');
    console.log("%cyou're early. few understand. 👀\npsst — try the konami code, or just type gm", 'color:#22d3ee;font-size:12px');

    const gm = () => { floatEmoji('☀️'); toast('gm fren ☀️'); };
    const wagmi = () => { confetti(); toast.success('WAGMI 🚀'); };
    const ngmi = () => { shake(); toast.error('ngmi 😔'); };
    const wenmoon = () => { floatEmoji('🌕'); toast('Moon ETA: soon™ 🌕'); };
    const lfg = () => { fireEgg('flare'); toast('LFG 🔥'); };
    const konami = () => { fireEgg('storm'); confetti(); toast.success('🌪️ STORM MODE'); };
    const WORDS = [['wenmoon', wenmoon], ['wagmi', wagmi], ['ngmi', ngmi], ['lfg', lfg], ['gm', gm]];

    let kI = 0, buf = '', wordTimer = null;
    const evalWords = () => { for (const [w, fn] of WORDS) { if (buf.endsWith(w)) { buf = ''; fn(); break; } } };
    const onKey = (e) => {
      const k = e.key;
      // Konami sequence (works anywhere)
      const want = KONAMI[kI];
      if (k.toLowerCase() === want.toLowerCase()) { kI++; if (kI === KONAMI.length) { kI = 0; konami(); } }
      else { kI = (k.toLowerCase() === KONAMI[0].toLowerCase()) ? 1 : 0; }
      // Typed keywords — but not while typing into a field
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (/^[a-z]$/i.test(k)) {
        buf = (buf + k.toLowerCase()).slice(-8);
        clearTimeout(wordTimer);
        wordTimer = setTimeout(evalWords, 350); // evaluate on a pause so "wagmi" doesn't trip "gm"
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(wordTimer); };
  }, []);

  return (
    <div className="egg-layer">
      {items.map((it) => it.kind === 'float'
        ? <span key={it.id} className="egg-float" style={{ left: it.left + '%' }}>{it.content}</span>
        : <span key={it.id} className="egg-confetti" style={{ left: it.left + '%', background: it.color, animationDelay: it.delay + 's' }} />
      )}
    </div>
  );
}
