import { useState, useEffect } from 'react';
import { useWallet } from '../hooks/WalletContext';
import { fmt, formatTimer } from '../utils/helpers';

export default function StatsTicker() {
  const { chain, protocolStats } = useWallet();
  const [timerStr, setTimerStr] = useState('—');

  useEffect(() => {
    if (!protocolStats.nextCycleTs) return;
    const tick = () => {
      const s = protocolStats.nextCycleTs - Math.floor(Date.now() / 1000);
      setTimerStr(s > 0 ? formatTimer(s) : 'New cycle!');
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [protocolStats.nextCycleTs]);

  const items = [
    `Cycle ${protocolStats.cycle || '—'}`,
    `Reward: ${protocolStats.reward ? fmt(protocolStats.reward) : '—'} DXN`,
    protocolStats.apy ? `APY: ${protocolStats.apy}%` : null,
    `Next cycle: ${timerStr}`,
    `Staked: ${protocolStats.totalStaked > 0n ? fmt(protocolStats.totalStaked) : '—'} DXN`,
    `Chain: ${chain.name}`,
  ].filter(Boolean);

  // Duplicate for seamless loop
  const text = items.join('  ·  ');

  return (
    <div className="stats-ticker">
      <div className="stats-ticker-track">
        <span>{text}&nbsp;&nbsp;·&nbsp;&nbsp;</span>
        <span>{text}&nbsp;&nbsp;·&nbsp;&nbsp;</span>
      </div>
    </div>
  );
}
