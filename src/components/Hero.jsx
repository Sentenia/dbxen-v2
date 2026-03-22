import { useState, useEffect, useRef } from 'react';
import { Timer } from 'lucide-react';
import { ethers } from 'ethers';
import { useWallet } from '../hooks/WalletContext';
import { fmt, formatTimer } from '../utils/helpers';
import AnimatedNumber from './AnimatedNumber';
import Skeleton from './Skeleton';

export default function Hero() {
  const { chain, protocolStats } = useWallet();
  const [timerStr, setTimerStr] = useState('—');
  const hasLoadedOnce = useRef(false);
  const [loadTimedOut, setLoadTimedOut] = useState(false);

  useEffect(() => {
    if (!protocolStats.nextCycleTs) return;
    const tick = () => {
      const secsLeft = protocolStats.nextCycleTs - Math.floor(Date.now() / 1000);
      setTimerStr(secsLeft > 0 ? formatTimer(secsLeft) : 'New cycle!');
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [protocolStats.nextCycleTs]);

  // Hide skeletons after 5s even if fetch failed — show "—" fallback instead of infinite shimmer
  useEffect(() => {
    const id = setTimeout(() => { if (!hasLoadedOnce.current) setLoadTimedOut(true); }, 5000);
    return () => clearTimeout(id);
  }, []);

  if (protocolStats.cycle > 0) hasLoadedOnce.current = true;
  const loaded = hasLoadedOnce.current || loadTimedOut;
  const hasData = hasLoadedOnce.current;
  const rewardFloat = protocolStats.reward ? parseFloat(ethers.formatEther(protocolStats.reward)) : (hasData ? 0 : null);
  const v1Float = protocolStats.xenBurnedV1 > 0n ? parseFloat(ethers.formatEther(protocolStats.xenBurnedV1)) : (hasData ? 0 : null);
  const v2Float = protocolStats.xenBurnedV2 > 0n ? parseFloat(ethers.formatEther(protocolStats.xenBurnedV2)) : (hasData ? 0 : null);
  const stakedFloat = protocolStats.totalStaked > 0n ? parseFloat(ethers.formatEther(protocolStats.totalStaked)) : (hasData ? 0 : null);

  return (
    <section className="hero fade-up">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 24 }}>
        <div className="hero-badge"><span className="pulse-dot" /> Live on {chain.name}</div>
        <div className="hero-badge" style={{ color: 'var(--amber)', borderColor: 'var(--amber-glow)', background: 'var(--amber-glow)' }}>
          <Timer size={14} /> Next cycle: {timerStr}
        </div>
      </div>
      <h1>Burn <span className="cyan">XEN</span>. Earn <span className="amber">DXN</span>.</h1>
      <p>Trustless Yield. Community-built Protocol. Fully Immutable.</p>
      <div className="hero-stats fade-up fade-up-2">
        <div className="hero-stat">
          <div className="hero-stat-value">
            {loaded ? <AnimatedNumber value={protocolStats.cycle || null} decimals={0} /> : <Skeleton width="40px" />}
          </div>
          <div className="hero-stat-label">Current Cycle</div>
        </div>
        <div className="hero-stat">
          <div className="hero-stat-value">
            {loaded ? <AnimatedNumber value={rewardFloat} decimals={2} /> : <Skeleton width="60px" />}
          </div>
          <div className="hero-stat-label">Daily Reward</div>
        </div>
        <div className="hero-stat">
          <div className="hero-stat-value">
            {loaded ? <AnimatedNumber value={v1Float} decimals={0} /> : <Skeleton width="80px" />}
          </div>
          <div className="hero-stat-label">V1 XEN Burned</div>
        </div>
        <div className="hero-stat">
          <div className="hero-stat-value" style={{ color: 'var(--cyan)' }}>
            {loaded ? <AnimatedNumber value={v2Float} decimals={0} /> : <Skeleton width="80px" />}
          </div>
          <div className="hero-stat-label">V2 XEN Burned</div>
        </div>
        <div className="hero-stat">
          <div className="hero-stat-value">
            {loaded ? <AnimatedNumber value={stakedFloat} decimals={2} /> : <Skeleton width="70px" />}
          </div>
          <div className="hero-stat-label">DXN Staked</div>
        </div>
      </div>
    </section>
  );
}
