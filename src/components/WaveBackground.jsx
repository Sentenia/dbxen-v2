import { useEffect, useRef, useState } from 'react';
import { onEgg } from '../utils/eggs';

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
// cursor "weight": the cloth eases toward the pointer slowly, with a little wander
// so it's a loose reaction rather than a 1:1 lock.
const CURSOR_EASE = 0.01;           // per-frame rate of EACH smoothing stage (cascaded = ultra-smooth)
const CURSOR_DELAY = 3;             // seconds of pure latency before anything reacts (hides the link)
const CURSOR_WU = 0.10, CURSOR_WV = 0.28, CURSOR_H = 0.08; // broad + extremely faint = barely a tug
const WPH1 = rand(0, Math.PI * 2), WPH2 = rand(0, Math.PI * 2), WPH3 = rand(0, Math.PI * 2);

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
  const mouse = useRef({ u: 0.5, v: 0.5, on: 0 });        // raw pointer target (field coords)
  const mouseSmooth = useRef({ u: 0.5, v: 0.5, s: 0 });    // eased position + strength
  const trail = useRef([]);                                // pointer history, for the latency delay
  const lag = useRef({ u: 0.5, v: 0.5 });                  // first smoothing stage (cascaded)
  const storm = useRef({ pending: false, until: 0, s: 0 }); // konami-code storm burst
  const vb = useRef({ x: 0, w: W });                       // current viewBox window (for mapping)

  // Konami code → a brief wild billow.
  useEffect(() => onEgg('storm', () => { storm.current.pending = true; }), []);
  // On narrow screens the full 1800-wide viewBox gets squished, scrunching the
  // waves. Show a narrower, centered window on mobile so the lines spread out.
  const [viewBox, setViewBox] = useState('0 0 1800 900');

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const apply = () => {
      const m = mq.matches;
      setViewBox(m ? '550 0 700 900' : '0 0 1800 900');
      vb.current = m ? { x: 550, w: 700 } : { x: 0, w: W };
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // Map the pointer into field coordinates (u across the viewBox, v top→bottom).
  useEffect(() => {
    const onMove = (e) => {
      const nx = e.clientX / window.innerWidth;
      const ny = e.clientY / window.innerHeight;
      mouse.current.u = (vb.current.x + nx * vb.current.w) / W;
      mouse.current.v = Math.min(1, Math.max(0, (ny * H - TOP_Y) / (BOT_Y - TOP_Y)));
      mouse.current.on = 1;
    };
    const onLeave = () => { mouse.current.on = 0; };
    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  useEffect(() => {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf, t0;

    const render = (T, realT) => {
      // Undetectable cursor presence: react to where the pointer was CURSOR_DELAY
      // seconds ago (pure latency → no immediate response), then run that through
      // TWO cascaded lerps so the influence point's velocity always ramps from zero
      // — it can never snap to a new direction. Net: a slow, delayed drift that
      // takes several seconds and shows no obvious link to the cursor.
      const m = mouse.current, ms = mouseSmooth.current, tr = trail.current, lg = lag.current;
      tr.push({ t: realT, u: m.u, v: m.v });
      while (tr.length && realT - tr[0].t > CURSOR_DELAY + 0.5) tr.shift();
      let past = null;
      for (let i = tr.length - 1; i >= 0; i--) { if (realT - tr[i].t >= CURSOR_DELAY) { past = tr[i]; break; } }
      const tu = past ? past.u : ms.u;   // no history yet → hold (no motion at all)
      const tv = past ? past.v : ms.v;
      lg.u += (tu - lg.u) * CURSOR_EASE;
      lg.v += (tv - lg.v) * CURSOR_EASE;
      ms.u += (lg.u - ms.u) * CURSOR_EASE;
      ms.v += (lg.v - ms.v) * CURSOR_EASE;
      ms.s += (((past && m.on) ? 1 : 0) - ms.s) * 0.004;
      const cu = ms.u + 0.015 * Math.sin(T * 0.7 + WPH1);
      const cv = ms.v + 0.015 * Math.sin(T * 0.5 + WPH2);
      const cstr = ms.s * CURSOR_H * (1 + 0.15 * Math.sin(T * 1.1 + WPH3));
      // storm easter egg: briefly amplify the gusts into a wild billow
      const sr = storm.current;
      if (sr.pending) { sr.until = realT + 6; sr.pending = false; }
      sr.s += (((realT < sr.until) ? 1 : 0) - sr.s) * 0.06;
      const stormBoost = 1 + sr.s * 3;

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
          // gusts + a weighted, wandering "press" wherever the cursor has settled
          const g = gust(u, vNorm, T)
            + cstr * Math.exp(-((u - cu) ** 2) / CURSOR_WU - ((vNorm - cv) ** 2) / CURSOR_WV);
          const a = 260 * env * tf * w;
          // Wind from beneath: a gust pushes the cloth TOWARD the viewer, so that
          // patch balloons outward (perspective scale > 1, lines spread wider) and
          // lifts up. The ripple carries strong depth too, so its troughs RECEDE
          // (scale < 1, lines bunch tight) — that compression, plus the steep
          // vertical arc the gust adds across lines, is what reads as the fabric
          // folding/creasing over itself.
          const z = a * 0.8 - g * 340 * envG * stormBoost;  // ripple depth (folds) + gust balloon
          const yw = a * 0.9 - g * 260 * envG * stormBoost; // strong gust arc → lines cross into folds
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

    if (reduce) { render(0, 0); return; }
    const loop = (now) => {
      if (t0 == null) t0 = now;
      const realT = (now - t0) / 1000;
      render(realT * SPEED, realT);
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
