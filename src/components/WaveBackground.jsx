import { useEffect, useRef, useState } from 'react';

// Flag-in-the-wind background. The fabric is a height field displaced in DEPTH
// (z, toward/away from the viewer) then projected through a focal point. Where
// the cloth turns toward you the lines spread + brighten; where it folds away
// they compress + dim — that perspective compression reads as fabric folding
// over itself in 3D. Amplitude is ~0 at the left "pole" and grows toward the
// free right edge.
//
// Motion is intentionally very slow and non-repeating: the surface is the sum of
// several incommensurate low-frequency harmonics (so it never loops) plus a few
// slowly-roaming Gaussian bumps — gusts of wind / a ball rolling underneath the
// cloth — that lift the fabric locally as they drift around.

const N = 22;                 // main contour lines
const COLS = 84;              // horizontal samples per line (covers the extended span)
const W = 1800, H = 900;
const TOP_Y = 80, BOT_Y = 820;
const SPACING = (BOT_Y - TOP_Y) / (N - 1);
const CX = W * 0.5, CY = H * 0.4;   // projection focus
const FOCAL = 1500;
const SPEED = 0.06;           // global time scale — small = barely-there drift
// Sample well past the visible window (u 0..1 fills the viewBox) so the line ends
// stay off-screen even when perspective pulls them inward as the cloth folds.
const U_MIN = -0.4, U_MAX = 1.4;
const S_MIN = 0.62, S_MAX = 2.9;    // clamp perspective; high max lets gusts balloon outward

function lerp(a, b, t) { return a + (b - a) * t; }
function rand(a, b) { return a + Math.random() * (b - a); }

// dark teal (bottom) -> bright cyan (top); tColor 0 = bottom, 1 = top
function color(tColor) {
  const r = Math.round(lerp(11, 28, tColor));
  const g = Math.round(lerp(64, 232, tColor));
  const b = Math.round(lerp(88, 242, tColor));
  return `rgb(${r},${g},${b})`;
}

// flag flaps harder toward the top edge, calmer at the bottom
function topFactor(p) { return 0.5 + (1 - p / (N - 1)) * 0.95; }
// top 4 lines fade out
function opacityFor(i) { return [0.45, 0.65, 0.8, 0.92][i] ?? 1; }

// --- organic surface: incommensurate harmonics (never repeats) ---
const HARM = Array.from({ length: 5 }, (_, k) => ({
  fu: rand(0.5, 1.0) + k * 0.6,   // spatial frequency across the width
  fv: rand(-1.1, 1.1),            // how the wave skews across lines (drape)
  sp: rand(0.5, 1.0) / (k + 1.4), // temporal speed (already scaled by SPEED later)
  ph: rand(0, Math.PI * 2),
  amp: 1 / (k + 1),
}));
const HARM_NORM = HARM.reduce((s, h) => s + h.amp, 0);

// --- roaming gusts: wind pushing up from beneath the cloth, in random places ---
const BUMPS = Array.from({ length: 4 }, () => ({
  su: rand(0.2, 0.55), pu: rand(0, Math.PI * 2),   // horizontal roam
  sv: rand(0.15, 0.45), pv: rand(0, Math.PI * 2),  // vertical roam
  wu: rand(0.04, 0.15),                            // horizontal spread (some wide, some tight)
  wv: rand(0.1, 0.32),                             // vertical spread
  h: rand(1.3, 2.5),                               // lift strength — drives the ballooning
}));

// gentle ripple (harmonics), ~[-1,1]
function ripple(u, vNorm, T) {
  let w = 0;
  for (const h of HARM) {
    w += h.amp * Math.sin(u * Math.PI * 2 * h.fu + vNorm * h.fv * Math.PI + T * h.sp + h.ph);
  }
  return w / HARM_NORM;
}

// roaming gust lift (>= 0): localized swells that drift around under the cloth
function gust(u, vNorm, T) {
  let g = 0;
  for (const b of BUMPS) {
    const bu = 0.5 + 0.42 * Math.sin(T * b.su + b.pu);
    const bv = 0.5 + 0.42 * Math.sin(T * b.sv + b.pv);
    const du = u - bu, dv = vNorm - bv;
    g += b.h * Math.exp(-(du * du) / b.wu - (dv * dv) / b.wv);
  }
  return g;
}

// Build the line list (thin filler lines first so the bright main lines sit on top).
const LINES = [];
for (let i = 0; i < N - 1; i++) {
  const p = i + 0.5;
  LINES.push({ p, stroke: color(1 - p / (N - 1)), width: 0.6, opacity: 0.3,
    baseY: TOP_Y + p * SPACING, tf: topFactor(p) });
}
for (let i = 0; i < N; i++) {
  LINES.push({ p: i, stroke: color(1 - i / (N - 1)), width: 1.1 + 0.6 * (1 - i / (N - 1)),
    opacity: opacityFor(i), baseY: TOP_Y + i * SPACING, tf: topFactor(i) });
}

export default function WaveBackground() {
  const refs = useRef([]);
  // On narrow screens the full 1800-wide viewBox gets squished, scrunching the
  // waves. Show a narrower, centered window on mobile so the lines spread out.
  const [viewBox, setViewBox] = useState('0 0 1800 900');

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const apply = () => setViewBox(mq.matches ? '550 0 700 900' : '0 0 1800 900');
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf, t0;

    const render = (T) => {
      for (let li = 0; li < LINES.length; li++) {
        const el = refs.current[li];
        if (!el) continue;
        const { baseY, tf, opacity } = LINES[li];
        const vNorm = (baseY - TOP_Y) / (BOT_Y - TOP_Y);
        let d = '', meanZ = 0;
        for (let j = 0; j <= COLS; j++) {
          const u = U_MIN + (j / COLS) * (U_MAX - U_MIN); // 0 = pole, 1 = free edge; extends past both
          const x = u * W;                       // u 0..1 maps across the viewBox
          const env = Math.pow(Math.max(0, u), 0.7); // ripple loosely anchored at the left pole
          const envG = 0.55 + 0.45 * Math.pow(Math.max(0, u), 0.5); // gusts work even on the left
          const w = ripple(u, vNorm, T);
          const g = gust(u, vNorm, T);
          const a = 260 * env * tf * w;
          // Wind from beneath: a gust pushes the cloth TOWARD the viewer, so that
          // patch balloons outward (perspective scale > 1, lines spread wider) and
          // lifts up. The ripple adds gentle depth/bend on top.
          const z = a * 0.5 - g * 360 * envG;    // negative z (closer) = balloon
          const yw = a * 0.9 - g * 150 * envG;   // gusts also lift the cloth up
          // Clamp the DENOMINATOR (not s) so the scale can't blow through the
          // z = -FOCAL pole — that pole is what spiked the fabric when gusts stacked.
          const denom = Math.min(FOCAL / S_MIN, Math.max(FOCAL / S_MAX, FOCAL + z));
          const s = FOCAL / denom;               // perspective scale, smoothly bounded
          const sx = CX + (x - CX) * s;
          const sy = CY + (baseY + yw - CY) * s;
          d += (j ? 'L' : 'M') + sx.toFixed(1) + ',' + sy.toFixed(1) + ' ';
          meanZ += z;
        }
        meanZ /= COLS + 1;
        // depth shading: lines closer to the viewer (z<0) read brighter
        const mult = Math.max(0.3, Math.min(1.05, 0.62 - meanZ / 900));
        el.setAttribute('d', d);
        el.setAttribute('opacity', (opacity * mult).toFixed(3));
      }
    };

    if (reduce) { render(0); return; }
    const loop = (now) => {
      if (t0 == null) t0 = now;
      render(((now - t0) / 1000) * SPEED);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      <div className="wave-bg">
        <svg viewBox={viewBox} preserveAspectRatio="none">
          {LINES.map((l, i) => (
            <path
              key={i}
              ref={(el) => (refs.current[i] = el)}
              className="wave-line"
              stroke={l.stroke}
              strokeWidth={l.width}
              opacity={l.opacity}
            />
          ))}
        </svg>
      </div>
      <div className="glow-orb cyan" />
      <div className="glow-orb amber" />
    </>
  );
}
