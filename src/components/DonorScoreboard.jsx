import { useEffect, useRef, useState } from 'react';
import { Trophy, X, RotateCw } from 'lucide-react';
import { useWallet } from '../hooks/WalletContext';
import { fetchDonorBoard, BONUS_START, BONUS_CYCLES } from '../utils/donors';

const MEDALS = ['🥇', '🥈', '🥉'];
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const dateOf = (ts) => new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// Sort accessors for the table columns. Rank stays pinned to points order (the
// donors array arrives points-sorted), whatever column is being sorted on.
const ACCESSORS = {
  points: (d) => d.points,
  usd: (d) => d.usd,
  count: (d) => d.count,
  bonus: (d) => (d.usd > 0 ? d.rawPts / d.usd : 0),
  last: (d) => d.lastTs,
};

// Modal points leaderboard for the community chest — spreadsheet edition. Points
// are real (actual donation history from explorer APIs × the fading launch bonus)
// but deliberately mean nothing. Same suspenseful, no-promises spirit as the rest
// of the chest's flavor text.
export default function DonorScoreboard({ onClose }) {
  const { userAddr } = useWallet();
  const [state, setState] = useState({ loading: true, donors: [] });
  const [sort, setSort] = useState({ key: 'points', dir: -1 });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const load = (opts) => {
    fetchDonorBoard(opts).then((board) => { if (alive.current) setState({ loading: false, ...board }); });
  };
  const retry = () => { setState((s) => ({ ...s, loading: true })); load({ force: true }); };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const me = userAddr?.toLowerCase();
  const bonus = state.bonus;
  const dayNow = bonus ? Math.min(BONUS_CYCLES, BONUS_CYCLES - bonus.cyclesLeft) : 0;
  const decayPct = (dayNow / BONUS_CYCLES) * 100;

  const rank = new Map(state.donors.map((d, i) => [d.address, i]));
  const sorted = [...state.donors]
    .sort((a, b) => (ACCESSORS[sort.key](b) - ACCESSORS[sort.key](a)) * -sort.dir || b.points - a.points)
    .slice(0, 100);

  const header = (key, label, align) => (
    <th
      className={`${align === 'right' ? 'num' : ''}${sort.key === key ? ' active' : ''}`}
      onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : -1 }))}
    >
      {label}{sort.key === key ? (sort.dir < 0 ? ' ↓' : ' ↑') : ''}
    </th>
  );

  return (
    <div className="scoreboard-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="scoreboard-modal">
        <button type="button" className="scoreboard-close" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
        <div className="scoreboard-title"><Trophy size={18} /> Chest Scoreboard</div>
        <div className="scoreboard-sub">Every donor earns points. What are they for? Unclear. 👀</div>

        {bonus && bonus.multiplier > 1 && (
          <div className="scoreboard-bonus">
            🔥 {bonus.multiplier.toFixed(1)}× points per $1 right now, fading every DXNv2 cycle until 1× ({bonus.cyclesLeft} cycles left)
          </div>
        )}

        {/* How the decay works: 10× at launch → 1× at cycle 90, ~0.1× lost per cycle.
            The marker shows where the bonus sits today. */}
        <div className="scoreboard-decay">
          <div className="scoreboard-decay-caption">
            <span>Point bonus by cycle. Donations keep the bonus they were earned at</span>
            <span>cycle {dayNow} of {BONUS_CYCLES}</span>
          </div>
          <div className="scoreboard-decay-track">
            {Array.from({ length: BONUS_START - 1 }, (_, i) => {
              const mult = BONUS_START - i;
              return (
                <div key={mult} className="scoreboard-decay-seg" style={{ background: `rgba(245, 158, 11, ${(mult / BONUS_START) * 0.85})` }}>
                  {mult}×
                </div>
              );
            })}
            <div className="scoreboard-decay-marker" style={{ left: `${decayPct}%` }} />
          </div>
          <div className="scoreboard-decay-caption">
            <span>launch · 10×</span>
            <span>−0.1× per cycle</span>
            <span>cycle 90+ · 1×</span>
          </div>
        </div>

        {state.loading && <div className="scoreboard-empty">Counting coins…</div>}
        {!state.loading && state.donors.length === 0 && state.uncertain && (
          <div className="scoreboard-empty">
            Having trouble loading donor history right now.
            <button type="button" className="scoreboard-retry" onClick={retry}>
              <RotateCw size={12} /> Try again
            </button>
          </div>
        )}
        {!state.loading && state.donors.length === 0 && !state.uncertain && (
          <div className="scoreboard-empty">No donations tracked yet. First mover gets 10× points.</div>
        )}
        {!state.loading && state.donors.length > 0 && (
          <div className="scoreboard-table-wrap">
            <table className="scoreboard-table">
              <thead>
                <tr>
                  <th className="rank">#</th>
                  <th>Donor</th>
                  {header('usd', '$ Donated', 'right')}
                  {header('count', 'Gifts', 'right')}
                  {header('bonus', 'Avg Bonus', 'right')}
                  {header('last', 'Last Gift', 'right')}
                  {header('points', 'Points', 'right')}
                </tr>
              </thead>
              <tbody>
                {sorted.map((d) => {
                  const r = rank.get(d.address);
                  return (
                    <tr key={d.address} className={d.address === me ? 'you' : ''}>
                      <td className="rank">{MEDALS[r] || `#${r + 1}`}</td>
                      <td className="addr">{short(d.address)}{d.address === me ? ' (you)' : ''}</td>
                      <td className="num">${d.usd.toFixed(2)}</td>
                      <td className="num">{d.count}</td>
                      <td className="num">{d.usd > 0 ? (d.rawPts / d.usd).toFixed(1) : '—'}×</td>
                      <td className="num">{dateOf(d.lastTs)}</td>
                      <td className="num pts">{d.points.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="scoreboard-note">points = $ donated × the bonus at donation time · sort by any column · no known use. yet.</div>
      </div>
    </div>
  );
}
