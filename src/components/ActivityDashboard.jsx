import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ethers } from 'ethers';
import { useWallet } from '../hooks/WalletContext';
import { fmt, formatTimer, shortAddr } from '../utils/helpers';
import { getBatchSize, CHAINS } from '../config/chains';
import { DBXEN_ABI } from '../config/abis';

const BURN_EVENT_SIG = ethers.id('Burn(address,uint256)');
const PAGE_SIZE = 10;

export default function ActivityDashboard() {
  const { chain, chainKey, connected, userAddr, protocolStats, getReadProvider } = useWallet();
  const [timerStr, setTimerStr] = useState('—');
  const [actData, setActData] = useState(null);
  const [page, setPage] = useState(1);
  const epochRef = useRef(0);

  // Bump epoch on chain change to abort stale fetches
  useEffect(() => { epochRef.current += 1; }, [chainKey]);

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

  const refreshActivity = useCallback(async () => {
    const epoch = epochRef.current;
    const { provider, isFallback } = getReadProvider();
    if (!provider) return;
    const c = CHAINS[chainKey];
    const isStale = () => epoch !== epochRef.current;
    try {
      const dbxRead = new ethers.Contract(c.contracts.DBXEN_V2, DBXEN_ABI, provider);

      let cycle, reward, initTs, period;
      if (isFallback) {
        cycle = await dbxRead.getCurrentCycle();
        if (isStale()) return;
        reward = await dbxRead.currentCycleReward();
        if (isStale()) return;
        initTs = await dbxRead.i_initialTimestamp();
        if (isStale()) return;
        period = await dbxRead.i_periodDuration();
        if (isStale()) return;
      } else {
        [cycle, reward, initTs, period] = await Promise.all([
          dbxRead.getCurrentCycle(), dbxRead.currentCycleReward(), dbxRead.i_initialTimestamp(), dbxRead.i_periodDuration(),
        ]);
        if (isStale()) return;
      }

      const now = BigInt(Math.floor(Date.now() / 1000));
      const cycleStartTs = initTs + (cycle * period);
      const currentBlock = await provider.getBlockNumber();
      if (isStale()) return;
      const secsIntoCycle = Number(now - cycleStartTs);
      const blockTimes = { '0x1': 12, '0x38': 3, '0x171': 10, '0xa86a': 2, '0x2711': 12 };
      const blockTime = blockTimes[c.chainId] || 2;
      const blocksIntoCycle = Math.ceil(secsIntoCycle / blockTime) + 500;
      const startBlock = Math.max(currentBlock - blocksIntoCycle, 0);

      // Chunk getLogs for RPCs with block range limits (BSC = 5000 max)
      const MAX_BLOCK_RANGE = c.chainId === '0x38' ? 4999 : 49999;
      let logs = [];
      for (let from = startBlock; from <= currentBlock; from += MAX_BLOCK_RANGE + 1) {
        const to = Math.min(from + MAX_BLOCK_RANGE, currentBlock);
        const chunk = await provider.getLogs({
          address: c.contracts.DBXEN_V2, topics: [BURN_EVENT_SIG], fromBlock: from, toBlock: to,
        });
        logs = logs.concat(chunk);
        if (isStale()) return;
      }

      // Get gas price once for estimating gas costs
      const feeData = await provider.getFeeData();
      if (isStale()) return;
      const gasPrice = feeData.gasPrice || 1000000000n;
      const isL2 = c.chainId !== '0x1';
      const estGasPerTx = BigInt(isL2 ? 600000 : 200000);

      const burners = {};
      let totalBatches = 0;
      for (const log of logs) {
        const addr = ('0x' + log.topics[1].slice(26)).toLowerCase();
        const xenAmount = BigInt(log.data);
        const batches = Number(xenAmount / getBatchSize(c));
        if (!burners[addr]) burners[addr] = { batches: 0, gasCost: 0n, txCount: 0 };
        burners[addr].batches += batches;
        burners[addr].txCount += 1;
        totalBatches += batches;
      }

      for (const [, data] of Object.entries(burners)) {
        data.gasCost = gasPrice * estGasPerTx * BigInt(data.txCount);
      }

      let totalEthFees = 0n;
      try {
        totalEthFees = await dbxRead.cycleAccruedFees(cycle);
        if (isStale()) return;
      } catch {}

      const sorted = Object.entries(burners).sort((a, b) => b[1].batches - a[1].batches);
      let totalGasCost = 0n;
      for (const [, d] of sorted) totalGasCost += d.gasCost;

      if (isStale()) return;
      setActData({
        cycle: Number(cycle), reward, totalBatches, burnerCount: sorted.length,
        totalEthFees, sorted, totalGasCost,
      });
      setPage(1);
    } catch (e) {
      console.error('Activity refresh failed:', e);
    }
  }, [chainKey, getReadProvider]);

  useEffect(() => { refreshActivity(); }, [refreshActivity]);

  useEffect(() => {
    const id = setInterval(refreshActivity, 30000);
    return () => clearInterval(id);
  }, [refreshActivity]);

  const myAddr = userAddr?.toLowerCase() || '';
  const d = actData || {};
  const myBurner = d.sorted?.find(([a]) => a === myAddr)?.[1];
  const myBatches = myBurner?.batches || 0;
  const myShare = d.totalBatches > 0 ? ((myBatches / d.totalBatches) * 100) : 0;
  const rewardFloat = d.reward ? parseFloat(ethers.formatEther(d.reward)) : 0;
  const myReward = d.totalBatches > 0 ? (myBatches / d.totalBatches) * rewardFloat : 0;
  const totalEthFloat = d.totalEthFees ? parseFloat(ethers.formatEther(d.totalEthFees)) : 0;
  const myGasCost = myBurner?.gasCost || 0n;
  const myProtocolFee = d.totalBatches > 0 ? (myBatches / d.totalBatches) * totalEthFloat : 0;

  const totalPages = d.sorted ? Math.ceil(d.sorted.length / PAGE_SIZE) : 1;
  const pageData = d.sorted?.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) || [];

  return (
    <div className="activity-layout">
      <div className="cycle-sidebar">
        <div className="cycle-sidebar-header">
          <span style={{ fontSize: 15, fontWeight: 700 }}>Cycle <span style={{ color: 'var(--cyan)' }}>{d.cycle || protocolStats.cycle}</span></span>
          <span className="pulse-dot" />
        </div>
        <div className="cycle-stats-grid">
          <div className="cycle-stat-box"><div className="cycle-stat-label">Total batches</div><div className="cycle-stat-val">{(d.totalBatches || 0).toLocaleString()}</div></div>
          <div className="cycle-stat-box"><div className="cycle-stat-label">Burners</div><div className="cycle-stat-val">{d.burnerCount || 0}</div></div>
          <div className="cycle-stat-box"><div className="cycle-stat-label">Reward pool</div><div className="cycle-stat-val">{d.reward ? fmt(d.reward) : '—'} <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>DXN</span></div></div>
          <div className="cycle-stat-box"><div className="cycle-stat-label">Fees</div><div className="cycle-stat-val">{d.totalEthFees ? fmt(d.totalEthFees, 4) : '—'} <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{chain.native}</span></div></div>
        </div>
        <div className="cycle-timer-section">
          <div className="cycle-stat-label">Time remaining</div>
          <div className="cycle-timer">{timerStr}</div>
        </div>
        {connected && (
          <div className="cycle-your-position">
            <div className="cycle-stat-label" style={{ marginBottom: 10 }}>Your position</div>
            <div className="cycle-pos-row"><span>Your batches</span><span>{myBatches}</span></div>
            <div className="cycle-pos-row"><span>Your share</span><span>{myShare.toFixed(2)}%</span></div>
            <div className="cycle-pos-row"><span>Est. DXN reward</span><span style={{ color: 'var(--green)', fontWeight: 700 }}>{myReward.toFixed(2)} DXN</span></div>
            <div className="cycle-pos-row"><span>Your gas cost</span><span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>~{parseFloat(ethers.formatEther(myGasCost)).toFixed(4)} {chain.native}</span></div>
            <div className="cycle-pos-row"><span>Your protocol fee</span><span style={{ color: 'var(--amber)', fontWeight: 700 }}>{myProtocolFee.toFixed(4)} {chain.native}</span></div>
          </div>
        )}
      </div>

      <div className="burn-feed">
        <div className="burn-feed-header">
          <span style={{ fontSize: 15, fontWeight: 700 }}>Burn activity — cycle <span style={{ color: 'var(--cyan)' }}>{d.cycle || protocolStats.cycle}</span></span>
          <span className="burn-feed-live"><span className="pulse-dot" /> Live</span>
        </div>
        <div className="burn-table-wrap">
          <table className="burn-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Address</th>
                <th style={{ textAlign: 'left' }}>Batches</th>
                <th style={{ textAlign: 'left' }}>XEN burned</th>
                <th style={{ textAlign: 'right' }}>Est. Gas</th>
                <th style={{ textAlign: 'right' }}>Protocol fee</th>
                <th style={{ textAlign: 'right' }}>Share</th>
                <th style={{ textAlign: 'right' }}>Est. DXN</th>
              </tr>
            </thead>
            <tbody>
              {pageData.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>
                  {actData === null ? 'Loading burn activity...' : 'No burns this cycle yet.'}
                </td></tr>
              ) : pageData.map(([addr, data]) => {
                const isYou = addr === myAddr;
                const share = ((data.batches / d.totalBatches) * 100).toFixed(2);
                const estDxn = ((data.batches / d.totalBatches) * rewardFloat).toFixed(2);
                const gasCost = parseFloat(ethers.formatEther(data.gasCost)).toFixed(4);
                const protFee = ((data.batches / d.totalBatches) * totalEthFloat).toFixed(4);
                const xenBurned = fmt(BigInt(data.batches) * getBatchSize(chain), 0);
                return (
                  <tr key={addr} className={isYou ? 'you-row' : ''}>
                    <td style={{ textAlign: 'left' }}>
                      <code className="burn-addr" onClick={() => navigator.clipboard.writeText(addr)} title="Click to copy">{shortAddr(addr)}</code>
                      {isYou && <span className="burn-you-badge">you</span>}
                    </td>
                    <td style={{ textAlign: 'left', fontWeight: 700 }}>{data.batches}</td>
                    <td style={{ textAlign: 'left' }}>{xenBurned}</td>
                    <td style={{ textAlign: 'right' }}>~{gasCost}</td>
                    <td style={{ textAlign: 'right', color: 'var(--amber)' }}>{protFee}</td>
                    <td style={{ textAlign: 'right' }}>{share}%</td>
                    <td style={{ textAlign: 'right', color: 'var(--green)', fontWeight: 700 }}>{estDxn}</td>
                  </tr>
                );
              })}
            </tbody>
            {d.sorted?.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)' }}>
                  <td style={{ textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: 12 }}>TOTAL</td>
                  <td style={{ textAlign: 'left', fontWeight: 700 }}>{d.totalBatches?.toLocaleString()}</td>
                  <td style={{ textAlign: 'left', fontWeight: 700 }}>{fmt(BigInt(d.totalBatches || 0) * getBatchSize(chain), 0)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>~{d.totalGasCost ? parseFloat(ethers.formatEther(d.totalGasCost)).toFixed(4) : '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--amber)' }}>{d.totalEthFees ? fmt(d.totalEthFees, 4) : '—'}</td>
                  <td /><td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {totalPages > 1 && (
          <div className="burn-pagination">
            <button className="burn-page-btn" onClick={() => setPage(p => p - 1)} disabled={page <= 1}><ChevronLeft size={16} /></button>
            <span className="burn-page-info" style={{ fontSize: 13, color: 'var(--text-muted)' }}>{page} / {totalPages}</span>
            <button className="burn-page-btn" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}><ChevronRight size={16} /></button>
          </div>
        )}
      </div>
    </div>
  );
}
