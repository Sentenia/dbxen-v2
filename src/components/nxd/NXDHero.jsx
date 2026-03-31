import { useState, useEffect, useRef } from 'react';
import { Timer } from 'lucide-react';
import { ethers } from 'ethers';
import { useNXD } from '../../hooks/NXDContext';
import { fmt, formatTimer } from '../../utils/helpers';
import AnimatedNumber from '../AnimatedNumber';
import Skeleton from '../Skeleton';

export default function NXDHero() {
  const { protocolStats } = useNXD();
  const [timerStr, setTimerStr] = useState('—');
  const hasLoadedOnce = useRef(false);
  const [loadTimedOut, setLoadTimedOut] = useState(false);

  useEffect(() => {
    if (!protocolStats.endTime) return;
    const tick = () => {
      const secsLeft = protocolStats.endTime - Math.floor(Date.now() / 1000);
      setTimerStr(secsLeft > 0 ? formatTimer(secsLeft) : 'CSP ended');
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [protocolStats.endTime]);

  useEffect(() => {
    const id = setTimeout(() => { if (!hasLoadedOnce.current) setLoadTimedOut(true); }, 5000);
    return () => clearTimeout(id);
  }, []);

  if (protocolStats.nxdSupply > 0n) hasLoadedOnce.current = true;
  const loaded = hasLoadedOnce.current || loadTimedOut;
  const hasData = hasLoadedOnce.current;

  const supplyFloat = protocolStats.nxdSupply > 0n ? parseFloat(ethers.formatEther(protocolStats.nxdSupply)) : (hasData ? 0 : null);
  const burnedFloat = protocolStats.nxdBurned > 0n ? parseFloat(ethers.formatEther(protocolStats.nxdBurned)) : (hasData ? 0 : null);
  const dxnStakedFloat = protocolStats.dxnStaked > 0n ? parseFloat(ethers.formatEther(protocolStats.dxnStaked)) : (hasData ? 0 : null);
  const ethDistFloat = protocolStats.ethToVault > 0n ? parseFloat(ethers.formatEther(protocolStats.ethToVault)) : (hasData ? 0 : null);

  return (
    <section className="hero fade-up nxd-hero">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 24 }}>
        <div className="hero-badge nxd-badge"><span className="pulse-dot nxd-pulse" /> Live on Ethereum</div>
        <div className="hero-badge nxd-badge-timer">
          <Timer size={14} /> CSP: {timerStr}
        </div>
      </div>
      <h1>Deflationary <span className="nxd-accent">DXN</span> Derivative</h1>
      <p>Deposit DXNv2. Mint NXDv2. Stake and earn ETH.</p>
      <div className="hero-stats fade-up fade-up-2">
        <div className="hero-stat">
          <div className="hero-stat-value nxd-accent">
            {loaded ? <AnimatedNumber value={supplyFloat} decimals={2} /> : <Skeleton width="60px" />}
          </div>
          <div className="hero-stat-label">NXDv2 Supply</div>
        </div>
        <div className="hero-stat">
          <div className="hero-stat-value">
            {loaded ? <AnimatedNumber value={burnedFloat} decimals={2} /> : <Skeleton width="60px" />}
          </div>
          <div className="hero-stat-label">NXDv2 Burned</div>
        </div>
        <div className="hero-stat">
          <div className="hero-stat-value">
            {loaded ? <AnimatedNumber value={dxnStakedFloat} decimals={2} /> : <Skeleton width="60px" />}
          </div>
          <div className="hero-stat-label">DXNv2 Staked</div>
        </div>
        <div className="hero-stat">
          <div className="hero-stat-value nxd-accent">
            {loaded ? <AnimatedNumber value={ethDistFloat} decimals={4} /> : <Skeleton width="60px" />}
          </div>
          <div className="hero-stat-label">ETH Distributed</div>
        </div>
      </div>
    </section>
  );
}
