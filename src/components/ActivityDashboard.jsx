import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, ExternalLink } from 'lucide-react';
import { ethers } from 'ethers';
import { useWallet } from '../hooks/WalletContext';
import { fmt, formatTimer, shortAddr, getGasPrice } from '../utils/helpers';
import { getBatchSize, CHAINS } from '../config/chains';
import { DBXEN_ABI } from '../config/abis';
import { fetchBurnHistory, isBurnHistorySupported } from '../utils/burnHistory';

const HIST_PAGE_SIZES = [5, 10, 20, 50];
const cycleDate = (ts) => new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const BURN_EVENT_SIG = ethers.id('Burn(address,uint256)');
const PAGE_SIZE = 10;

// Chains whose configured/public RPC refuses wide eth_getLogs (archive-gated) — pull the
// burn feed from these getLogs-capable endpoints instead, raw JSON-RPC, rotated + retried.
// Chains whose own public RPC archive-gates wide eth_getLogs — pull the burn feed from
// these getLogs-capable endpoints (raw JSON-RPC) instead. `range` = max blocks per call
// the endpoint allows; `blockTime` is deliberately set a touch BELOW the chain's real
// block time so the scan OVER-covers the cycle (over-scan is harmless — lastActiveCycle
// filters out any previous-cycle burns that get swept in). Their block number is read
// from the chain's own RPC, never the wallet provider (which may be on another chain).
const GETLOGS_RPCS = {
  '0x38':   { rpcs: ['https://bsc.rpc.blxrbdn.com'], range: 45000, blockTime: 0.4 }, // BNB ~0.45s/block (bloXroute)
  '0xa86a': { rpcs: ['https://avalanche.drpc.org'],  range: 9999,  blockTime: 0.9 }, // AVAX ~1.0s/block (drpc caps at 10k)
};

export default function ActivityDashboard() {
  const { chain, chainKey, connected, userAddr, protocolStats, getReadProvider } = useWallet();
  const [timerStr, setTimerStr] = useState('—');
  const [actData, setActData] = useState(null);
  const actDataRef = useRef(null);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(null);   // address whose history row is open
  const [details, setDetails] = useState({});       // addr -> { loading, error, ...on-chain accounting, history }
  const [histPage, setHistPage] = useState(1);      // pagination for the open row's per-cycle table
  const [histSize, setHistSize] = useState(5);
  const epochRef = useRef(0);

  // Bump epoch on chain change to abort stale fetches; also drop any open history
  // dropdown + cached per-address reads (they're chain-specific). Clear actData too so
  // the panel never shows the previous chain's stats while the new one loads.
  useEffect(() => {
    epochRef.current += 1; setExpanded(null); setDetails({});
    actDataRef.current = null; setActData(null);
  }, [chainKey]);

  // Fresh cycle table (page 1, default size) whenever a different row opens.
  useEffect(() => { setHistPage(1); setHistSize(5); }, [expanded]);

  // Lazily read a single address's lifetime on-chain accounting. These are cheap
  // single eth_calls that work on ANY RPC (unlike the getLogs burn feed), so the
  // per-user history is reliable everywhere.
  const fetchAddrDetails = useCallback(async (addr) => {
    setDetails(prev => ({ ...prev, [addr]: { loading: true } }));
    try {
      const { provider } = getReadProvider();
      if (!provider) throw new Error('no provider');
      const c = CHAINS[chainKey];
      const dbx = new ethers.Contract(c.contracts.DBXEN_V2, DBXEN_ABI, provider);
      const [accR, accF, stake, lac, accB] = await Promise.all([
        dbx.accRewards(addr).catch(() => 0n),
        dbx.accAccruedFees(addr).catch(() => 0n),
        dbx.accWithdrawableStake(addr).catch(() => 0n),
        dbx.lastActiveCycle(addr).catch(() => 0n),
        dbx.accCycleBatchesBurned(addr).catch(() => 0n),
      ]);
      const supported = isBurnHistorySupported(chainKey);
      setDetails(prev => ({ ...prev, [addr]: {
        loading: false, accRewards: accR, accFees: accF, stake,
        lastCycle: Number(lac), lastCycleBatches: Number(accB),
        supported, histLoading: supported,
      } }));

      // On supported chains, reconstruct the per-cycle spreadsheet from explorer
      // history in the background — the snapshot above renders immediately.
      if (supported) {
        try {
          const hist = await fetchBurnHistory(chainKey, addr, provider);
          setDetails(prev => ({ ...prev, [addr]: { ...prev[addr], histLoading: false, history: hist } }));
        } catch (e) {
          setDetails(prev => ({ ...prev, [addr]: { ...prev[addr], histLoading: false, histError: true } }));
        }
      }
    } catch (e) {
      setDetails(prev => ({ ...prev, [addr]: { loading: false, error: true } }));
    }
  }, [chainKey, getReadProvider]);

  const toggleRow = useCallback((addr) => {
    setExpanded(cur => (cur === addr ? null : addr));
    if (!details[addr]) fetchAddrDetails(addr);
  }, [details, fetchAddrDetails]);

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
    const myAddr = userAddr?.toLowerCase() || '';
    try {
      const dbxRead = new ethers.Contract(c.contracts.DBXEN_V2, DBXEN_ABI, provider);

      // ── Reliable contract reads (single eth_calls; work on ANY RPC). The cycle
      //    totals + the user's own batches come from here, NOT from getLogs, so the
      //    stats and "Your position" survive even when log queries are unavailable. ──
      let cycle, reward, initTs, period, cycleTotalBN, totalEthFees;
      if (isFallback) {
        cycle = await dbxRead.getCurrentCycle(); if (isStale()) return;
        reward = await dbxRead.currentCycleReward(); if (isStale()) return;
        initTs = await dbxRead.i_initialTimestamp(); if (isStale()) return;
        period = await dbxRead.i_periodDuration(); if (isStale()) return;
        cycleTotalBN = await dbxRead.cycleTotalBatchesBurned(cycle); if (isStale()) return;
        try { totalEthFees = await dbxRead.cycleAccruedFees(cycle); } catch { totalEthFees = 0n; }
        if (isStale()) return;
      } else {
        [cycle, reward, initTs, period] = await Promise.all([
          dbxRead.getCurrentCycle(), dbxRead.currentCycleReward(), dbxRead.i_initialTimestamp(), dbxRead.i_periodDuration(),
        ]);
        if (isStale()) return;
        [cycleTotalBN, totalEthFees] = await Promise.all([
          dbxRead.cycleTotalBatchesBurned(cycle), dbxRead.cycleAccruedFees(cycle).catch(() => 0n),
        ]);
        if (isStale()) return;
      }
      const contractTotalBatches = Number(cycleTotalBN);

      // Your position, straight from the contract — accCycleBatchesBurned is your
      // batch count for your last active cycle, valid only if that IS this cycle.
      let myBatches = 0;
      if (userAddr) {
        try {
          const [accB, lac] = await Promise.all([
            dbxRead.accCycleBatchesBurned(userAddr), dbxRead.lastActiveCycle(userAddr),
          ]);
          if (lac === cycle) myBatches = Number(accB);
        } catch { /* leave at 0 */ }
        if (isStale()) return;
      }

      // Commit the reliable contract stats NOW — the getLogs feed below can take many
      // seconds (BSC scans ~16 chunks) or fail, and stats/your-position must never wait
      // on it or linger on a previous chain. Keep any feed we already have for THIS cycle
      // so the list doesn't blink to empty while the fresh scan runs.
      if (isStale()) return;
      {
        const prevSame = actDataRef.current && actDataRef.current.cycle === Number(cycle) && actDataRef.current.logsOk;
        const statsData = {
          cycle: Number(cycle), reward, totalBatches: contractTotalBatches, totalEthFees, myBatches, feedLoading: true,
          burnerCount: prevSame ? actDataRef.current.burnerCount : 0,
          sorted: prevSame ? actDataRef.current.sorted : [],
          totalGasCost: prevSame ? actDataRef.current.totalGasCost : 0n,
          myGasCost: prevSame ? actDataRef.current.myGasCost : 0n,
          logsOk: prevSame ? true : false,
        };
        if (!actDataRef.current || actDataRef.current.cycle !== Number(cycle)) setPage(1);
        actDataRef.current = statsData;
        setActData(statsData);
      }

      // ── Burn feed (the per-address table) via getLogs — BEST EFFORT. Many public
      //    RPCs now gate wide getLogs behind API keys, so wrap it: a failure leaves
      //    the table empty but must NOT zero out the contract-derived stats above. ──
      let sorted = [], burnerCount = 0, totalGasCost = 0n, myGasCost = 0n, logsOk = false;
      try {
      const now = BigInt(Math.floor(Date.now() / 1000));
      const cycleStartTs = initTs + (cycle * period);
      const secsIntoCycle = Number(now - cycleStartTs);
      const logCfg = GETLOGS_RPCS[c.chainId];
      const blockTimes = { '0x1': 12, '0x38': 1, '0x171': 10, '0xa86a': 2, '0x2711': 12 };
      const blockTime = logCfg?.blockTime || blockTimes[c.chainId] || 2;

      // Chains with a getLogs endpoint read their block number from the chain's own RPC
      // (never the wallet provider — it may be pointed at a different network); everyone
      // else uses the wallet/fallback provider.
      let currentBlock;
      if (logCfg) {
        const bnResp = await fetch(c.rpc, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
        });
        const bnJson = await bnResp.json();
        currentBlock = parseInt(bnJson.result, 16);
      } else {
        currentBlock = await provider.getBlockNumber();
      }
      if (isStale()) return;

      const blocksIntoCycle = Math.ceil(secsIntoCycle / blockTime);
      const startBlock = Math.max(currentBlock - blocksIntoCycle, 0);

      // Chunk getLogs — chains in GETLOGS_RPCS use raw fetch against getLogs-capable
      // endpoints (their own public RPCs archive-gate getLogs); everyone else uses the
      // wallet/fallback provider directly.
      const MAX_BLOCK_RANGE = logCfg?.range || 4999;
      const rawRpcs = logCfg?.rpcs;
      let logs = [];
      for (let from = startBlock; from <= currentBlock; from += MAX_BLOCK_RANGE + 1) {
        const to = Math.min(from + MAX_BLOCK_RANGE, currentBlock);
        if (rawRpcs) {
          const rpc = rawRpcs[Math.floor((from - startBlock) / (MAX_BLOCK_RANGE + 1)) % rawRpcs.length];
          let json;
          for (let retry = 0; retry < 3; retry++) {
            if (retry > 0) await new Promise(r => setTimeout(r, 1000));
            try {
              const resp = await fetch(rpc, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params: [{
                  address: c.contracts.DBXEN_V2, topics: [BURN_EVENT_SIG],
                  fromBlock: '0x' + from.toString(16), toBlock: '0x' + to.toString(16),
                }] }),
              });
              json = await resp.json();
              if (json.result) break;
            } catch {}
          }
          if (json?.result) logs = logs.concat(json.result);
          await new Promise(r => setTimeout(r, 200));
        } else {
          const chunk = await provider.getLogs({
            address: c.contracts.DBXEN_V2, topics: [BURN_EVENT_SIG], fromBlock: from, toBlock: to,
          });
          logs = logs.concat(chunk);
        }
        if (isStale()) return;
      }

      // Get gas price once for estimating gas costs
      const gasPrice = (await getGasPrice(provider)) || 1000000000n;
      if (isStale()) return;
      const isL2 = c.chainId !== '0x1';
      const estGasPerTx = BigInt(isL2 ? 600000 : 200000);

      const burners = {};
      let totalBatches = 0;
      for (const log of logs) {
        const topics = log.topics || [];
        const addr = ('0x' + (topics[1] || '').slice(26)).toLowerCase();
        const xenAmount = BigInt(log.data || '0x0');
        const batches = Number(xenAmount / getBatchSize(c));
        if (!burners[addr]) burners[addr] = { batches: 0, gasCost: 0n, txCount: 0 };
        burners[addr].batches += batches;
        burners[addr].txCount += 1;
        totalBatches += batches;
      }

      // Filter out burners from previous cycles using on-chain lastActiveCycle
      const burnerAddrs = Object.keys(burners);
      if (burnerAddrs.length > 0) {
        let activeCycles;
        if (isFallback) {
          activeCycles = [];
          for (const addr of burnerAddrs) {
            activeCycles.push(await dbxRead.lastActiveCycle(addr));
            if (isStale()) return;
          }
        } else {
          activeCycles = await Promise.all(burnerAddrs.map(addr => dbxRead.lastActiveCycle(addr)));
          if (isStale()) return;
        }
        for (let i = 0; i < burnerAddrs.length; i++) {
          if (activeCycles[i] !== cycle) {
            totalBatches -= burners[burnerAddrs[i]].batches;
            delete burners[burnerAddrs[i]];
          }
        }
      }

      for (const [, data] of Object.entries(burners)) {
        data.gasCost = gasPrice * estGasPerTx * BigInt(data.txCount);
      }

      const built = Object.entries(burners).sort((a, b) => b[1].batches - a[1].batches);
      sorted = built;
      burnerCount = built.length;
      for (const [, dd] of built) totalGasCost += dd.gasCost;
      myGasCost = burners[myAddr]?.gasCost || 0n;
      logsOk = true;
      } catch (e) {
        console.warn('[Activity] burn feed unavailable (RPC getLogs limited):', e?.message || e);
      }

      if (isStale()) return;
      // Feed done. Use the fresh scan if it succeeded; if it failed, keep whatever feed
      // the early stats commit already had for this cycle rather than blanking the list.
      const prev = actDataRef.current;
      const newData = {
        cycle: Number(cycle), reward, totalBatches: contractTotalBatches, totalEthFees, myBatches,
        feedLoading: false,
        burnerCount: logsOk ? burnerCount : (prev?.burnerCount || 0),
        sorted: logsOk ? sorted : (prev?.sorted || []),
        totalGasCost: logsOk ? totalGasCost : (prev?.totalGasCost || 0n),
        myGasCost: logsOk ? myGasCost : (prev?.myGasCost || 0n),
        logsOk: logsOk || !!prev?.logsOk,
      };
      actDataRef.current = newData;
      setActData(newData);
    } catch (e) {
      console.error('Activity refresh failed:', e);
    }
  }, [chainKey, getReadProvider, userAddr]);

  useEffect(() => { refreshActivity(); }, [refreshActivity]);

  useEffect(() => {
    const id = setInterval(refreshActivity, 30000);
    return () => clearInterval(id);
  }, [refreshActivity]);

  const myAddr = userAddr?.toLowerCase() || '';
  const d = actData || {};
  // Your position comes from the contract (d.myBatches), not the getLogs feed, so
  // it's accurate even when the burn list below can't load.
  const myBatches = d.myBatches || 0;
  const myShare = d.totalBatches > 0 ? ((myBatches / d.totalBatches) * 100) : 0;
  const rewardFloat = d.reward ? parseFloat(ethers.formatEther(d.reward)) : 0;
  const myReward = d.totalBatches > 0 ? (myBatches / d.totalBatches) * rewardFloat : 0;
  const totalEthFloat = d.totalEthFees ? parseFloat(ethers.formatEther(d.totalEthFees)) : 0;
  const myGasCost = d.myGasCost || 0n;
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
          <span style={{ fontSize: 15, fontWeight: 700 }}>Burn activity · cycle <span style={{ color: 'var(--cyan)' }}>{d.cycle || protocolStats.cycle}</span></span>
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
                  {d.feedLoading && !d.logsOk
                    ? <><span className="burn-scan-spinner" /> Scanning the full cycle for burns. This can take up to ~20 seconds, and the cycle totals and your position above are already accurate.</>
                    : actData === null ? 'Loading burn activity…'
                    : d.totalBatches > 0 ? 'Per-address list unavailable on this RPC. Cycle totals and your position above are accurate.'
                    : 'No burns this cycle yet.'}
                </td></tr>
              ) : pageData.map(([addr, data]) => {
                const isYou = addr === myAddr;
                const isOpen = expanded === addr;
                const det = details[addr];
                const share = ((data.batches / d.totalBatches) * 100).toFixed(2);
                const estDxn = ((data.batches / d.totalBatches) * rewardFloat).toFixed(2);
                const gasCost = parseFloat(ethers.formatEther(data.gasCost)).toFixed(4);
                const protFee = ((data.batches / d.totalBatches) * totalEthFloat).toFixed(4);
                const xenBurned = fmt(BigInt(data.batches) * getBatchSize(chain), 0);
                return (
                  <Fragment key={addr}>
                  <tr className={`${isYou ? 'you-row ' : ''}burn-row${isOpen ? ' is-open' : ''}`} onClick={() => toggleRow(addr)} title="Click for this address's history">
                    <td style={{ textAlign: 'left' }}>
                      <button className="burn-expand-btn" aria-label="Toggle history" aria-expanded={isOpen}>
                        <ChevronDown size={14} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                      </button>
                      <a className="burn-addr" href={`${chain.explorer}/address/${addr}`} target="_blank" rel="noopener noreferrer" title={`View on ${chain.name} explorer`} onClick={(e) => e.stopPropagation()}>{shortAddr(addr)}</a>
                      {isYou && <span className="burn-you-badge">you</span>}
                    </td>
                    <td style={{ textAlign: 'left', fontWeight: 700 }}>{data.batches}</td>
                    <td style={{ textAlign: 'left' }}>{xenBurned}</td>
                    <td style={{ textAlign: 'right' }}>~{gasCost}</td>
                    <td style={{ textAlign: 'right', color: 'var(--amber)' }}>{protFee}</td>
                    <td style={{ textAlign: 'right' }}>{share}%</td>
                    <td style={{ textAlign: 'right', color: 'var(--green)', fontWeight: 700 }}>{estDxn}</td>
                  </tr>
                  {isOpen && (
                    <tr className="burn-detail-row">
                      <td colSpan={7}>
                        {!det || det.loading ? (
                          <div className="burn-detail-msg">Loading on-chain history…</div>
                        ) : det.error ? (
                          <div className="burn-detail-msg">Couldn't load details on this RPC.</div>
                        ) : (
                          <div className="burn-detail">
                            <div className="burn-detail-title">
                              Lifetime on-chain activity
                              <a className="burn-detail-link" href={`${chain.explorer}/address/${addr}`} target="_blank" rel="noopener noreferrer">
                                {shortAddr(addr)} <ExternalLink size={12} />
                              </a>
                            </div>
                            <div className="burn-detail-grid">
                              <div className="burn-detail-item"><span className="burn-detail-label">DXN rewards (claimable)</span><span className="burn-detail-val" style={{ color: 'var(--green)' }}>{fmt(det.accRewards)} DXN</span></div>
                              <div className="burn-detail-item"><span className="burn-detail-label">{chain.native} fees (claimable)</span><span className="burn-detail-val" style={{ color: 'var(--amber)' }}>{fmt(det.accFees, 5)} {chain.native}</span></div>
                              <div className="burn-detail-item"><span className="burn-detail-label">DXN staked</span><span className="burn-detail-val">{fmt(det.stake)} DXN</span></div>
                              <div className="burn-detail-item"><span className="burn-detail-label">Last active cycle</span><span className="burn-detail-val">{det.lastCycle > 0 ? `#${det.lastCycle}` : '—'}</span></div>
                              <div className="burn-detail-item"><span className="burn-detail-label">Batches (cycle #{det.lastCycle})</span><span className="burn-detail-val">{det.lastCycleBatches.toLocaleString()}</span></div>
                            </div>
                            {det.supported ? (
                              det.histLoading ? (
                                <div className="burn-detail-msg" style={{ padding: '14px 0 4px' }}>Reconstructing cycle history from {chain.name} explorer…</div>
                              ) : det.histError || !det.history ? (
                                <div className="burn-detail-msg" style={{ padding: '14px 0 4px' }}>Couldn't reach {chain.name}'s explorer for full cycle history. The snapshot above is on-chain and accurate.</div>
                              ) : !det.history.cycles?.length ? (
                                <div className="burn-detail-msg" style={{ padding: '14px 0 4px' }}>No burn transactions found for this address on {chain.name}.</div>
                              ) : (() => {
                                const cyc = det.history.cycles;
                                const pages = Math.max(1, Math.ceil(cyc.length / histSize));
                                const pg = Math.min(histPage, pages);
                                const rows = cyc.slice((pg - 1) * histSize, pg * histSize);
                                const t = det.history.totals;
                                return (
                                  <div className="burn-hist">
                                    <div className="burn-hist-head">Per-cycle burn history · {cyc.length} cycle{cyc.length !== 1 ? 's' : ''} active</div>
                                    <div className="burn-hist-wrap">
                                      <table className="burn-hist-table">
                                        <thead>
                                          <tr>
                                            <th style={{ textAlign: 'left' }}>Cycle</th>
                                            <th style={{ textAlign: 'left' }}>Date</th>
                                            <th style={{ textAlign: 'right' }}>Batches</th>
                                            <th style={{ textAlign: 'right' }}>XEN burned</th>
                                            <th style={{ textAlign: 'right' }}>Fee paid</th>
                                            <th style={{ textAlign: 'right' }}>Est. DXN</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {rows.map((e) => (
                                            <tr key={e.cycle}>
                                              <td style={{ textAlign: 'left', fontWeight: 700 }}>#{e.cycle}</td>
                                              <td style={{ textAlign: 'left', color: 'var(--text-muted)' }}>{cycleDate(e.ts)}</td>
                                              <td style={{ textAlign: 'right' }}>{e.batches.toLocaleString()}</td>
                                              <td style={{ textAlign: 'right' }}>{fmt(e.xen, 0)}</td>
                                              <td style={{ textAlign: 'right', color: 'var(--amber)' }}>{fmt(e.fee, 5)} {chain.native}</td>
                                              <td style={{ textAlign: 'right', color: 'var(--green)', fontWeight: 700 }}>{e.estDxn.toFixed(2)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                        <tfoot>
                                          <tr>
                                            <td style={{ textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>TOTAL</td>
                                            <td />
                                            <td style={{ textAlign: 'right', fontWeight: 700 }}>{t.batches.toLocaleString()}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(t.xen, 0)}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--amber)' }}>{fmt(t.fee, 5)} {chain.native}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--green)' }}>{t.estDxn.toFixed(2)}</td>
                                          </tr>
                                        </tfoot>
                                      </table>
                                    </div>
                                    <div className="burn-hist-controls">
                                      <div className="burn-hist-sizes">
                                        <span style={{ color: 'var(--text-muted)' }}>Rows</span>
                                        {HIST_PAGE_SIZES.map((s) => (
                                          <button key={s} className={`burn-hist-size${histSize === s ? ' active' : ''}`} onClick={() => { setHistSize(s); setHistPage(1); }}>{s}</button>
                                        ))}
                                      </div>
                                      {pages > 1 && (
                                        <div className="burn-hist-pager">
                                          <button className="burn-page-btn" onClick={() => setHistPage((p) => Math.max(1, p - 1))} disabled={pg <= 1}><ChevronLeft size={14} /></button>
                                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{pg} / {pages}</span>
                                          <button className="burn-page-btn" onClick={() => setHistPage((p) => Math.min(pages, p + 1))} disabled={pg >= pages}><ChevronRight size={14} /></button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })()
                            ) : (
                              <div className="burn-detail-note">Full per-cycle history isn't available on {chain.name}'s explorer. The lifetime snapshot above is on-chain and accurate. (Cycle-by-cycle history works on Ethereum, Polygon, Base &amp; Optimism.)</div>
                            )}
                            <div className="burn-detail-note">Accrued rewards &amp; fees are the on-chain claimable balance. They update when the address next interacts with the protocol. Est. DXN &amp; fees are reconstructed from explorer history (best-effort).</div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                  </Fragment>
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