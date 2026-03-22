import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import { CHAINS, detectChainKey, getBatchSize, getBatchDisplay } from '../config/chains';
import { ERC20_ABI, DBXEN_ABI, MIGRATION_ABI, DUAL_MIGRATION_ABI, OLD_DBXEN_ABI } from '../config/abis';
import { fmt } from '../utils/helpers';
import toast from 'react-hot-toast';

const WalletContext = createContext(null);
export const useWallet = () => useContext(WalletContext);

const SCALING = 10n ** 40n;

export function WalletProvider({ children }) {
  const [chainKey, setChainKey] = useState('ethereum');
  const [userAddr, setUserAddr] = useState(null);
  const [ethBal, setEthBal] = useState('0.00');
  const [connected, setConnected] = useState(false);

  // Balances
  const [xenBal, setXenBal] = useState(0n);
  const [dxnBal, setDxnBal] = useState(0n);
  const [oldDxnBal, setOldDxnBal] = useState(0n);
  const [oldV2DxnBal, setOldV2DxnBal] = useState(0n);

  // Protocol stats
  const [protocolStats, setProtocolStats] = useState({
    cycle: 0, reward: 0n, xenBurnedV1: 0n, xenBurnedV2: 0n, totalStaked: 0n, apy: null,
    nextCycleTs: 0,
  });

  // User stats
  const [userStats, setUserStats] = useState({
    unclaimedDxn: 0n, unclaimedFees: 0n, totalStake: 0n, withdrawable: 0n,
    pendingStake: 0n, pendingUnlockTs: 0,
  });

  // Bridge stats
  const [bridgeStats, setBridgeStats] = useState({
    totalMigrated: 0n, poolRemaining: 0n, deadline: 0n, totalPool: 0n,
  });

  // Legacy stats (PulseChain)
  const [legacyStats, setLegacyStats] = useState({
    unclaimedDxn: 0n, unclaimedFees: 0n, totalStake: 0n, withdrawable: 0n,
    pendingStake: 0n, pendingUnlockTs: 0, deadline: 0n, oldDxnBal: 0n,
  });

  // Contract refs (signer-based, for write txns)
  const contractsRef = useRef({});
  // Fallback read-only provider cache
  const fallbackProviderRef = useRef(null);
  // Chain-switch abort: incremented on every chain change, checked after awaits
  const chainEpochRef = useRef(0);
  // Always-current chainKey (updated eagerly, before React re-render)
  const chainKeyRef = useRef(chainKey);

  const chain = CHAINS[chainKey];
  const addr = chain.contracts;

  // ═══ TWO-TIER PROVIDER ═══
  // Simple: use wallet provider if connected, else create/cache a fallback JsonRpcProvider.
  // Fallback tries primary RPC, if that fails tries backup RPC.
  const getReadProvider = useCallback(() => {
    // If wallet is connected, use its provider (always talks to MetaMask's current chain)
    const walletProvider = contractsRef.current.provider;
    if (walletProvider) return { provider: walletProvider, isFallback: false };

    // No wallet — use fallback JsonRpcProvider for current chain
    const key = chainKeyRef.current;
    if (fallbackProviderRef.current && fallbackProviderRef.current._forChain === key) {
      return { provider: fallbackProviderRef.current, isFallback: true };
    }
    const c = CHAINS[key];
    const p = new ethers.JsonRpcProvider(c.rpc);
    p._forChain = key;
    fallbackProviderRef.current = p;
    return { provider: p, isFallback: true };
  }, [chainKey]);

  // Try backup RPC if primary fails (called from refresh functions on catch)
  const getFallbackWithBackup = useCallback((key) => {
    const c = CHAINS[key];
    if (!c.rpcBackup) return null;
    const p = new ethers.JsonRpcProvider(c.rpcBackup);
    p._forChain = key;
    fallbackProviderRef.current = p;
    return p;
  }, []);

  // Helper: check if chain changed during an async operation
  const isStale = (epoch) => epoch !== chainEpochRef.current;

  // ═══ FULL RECONNECT ═══
  // Creates fresh BrowserProvider + signer + all contracts for the given chain key.
  // Called by both connectWallet and handleChainChanged.
  const fullReconnect = useCallback(async (key, address) => {
    const c = CHAINS[key];
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();

    const bal = await provider.getBalance(address);
    setEthBal(parseFloat(ethers.formatEther(bal)).toFixed(4));

    const xenC = new ethers.Contract(c.contracts.XEN, ERC20_ABI, signer);
    const dxnV2C = new ethers.Contract(c.contracts.DXN_V2, ERC20_ABI, signer);
    const oldDxnC = new ethers.Contract(c.contracts.OLD_DXN, ERC20_ABI, signer);
    const dbxenC = new ethers.Contract(c.contracts.DBXEN_V2, DBXEN_ABI, signer);

    let migC, oldV2DxnC, legacyDbxenC, legacyDxnC;
    if (c.dualMigration) {
      migC = new ethers.Contract(c.contracts.MIGRATION, DUAL_MIGRATION_ABI, signer);
      oldV2DxnC = new ethers.Contract(c.legacy.DXN_V2, ERC20_ABI, signer);
      legacyDbxenC = new ethers.Contract(c.legacy.DBXEN_V2, DBXEN_ABI, signer);
      legacyDxnC = new ethers.Contract(c.legacy.DXN_V2, ERC20_ABI, signer);
    } else {
      migC = new ethers.Contract(c.contracts.MIGRATION, MIGRATION_ABI, signer);
    }

    contractsRef.current = {
      provider, signer, xen: xenC, dxnV2: dxnV2C, oldDxn: oldDxnC, dbxen: dbxenC,
      migration: migC, oldV2Dxn: oldV2DxnC, legacyDbxen: legacyDbxenC, legacyDxn: legacyDxnC,
    };
  }, []);

  // ═══ CONNECT ═══
  const connectWallet = useCallback(async () => {
    if (typeof window.ethereum === 'undefined') {
      if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
        window.location.href = 'https://metamask.app.link/dapp/dbxen-v2.vercel.app';
      } else {
        toast.error('No wallet detected. Please install MetaMask.');
      }
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const hexId = await window.ethereum.request({ method: 'eth_chainId' });
      const key = detectChainKey(hexId);
      if (!key) { toast.error('Unsupported network.'); return; }

      chainKeyRef.current = key;
      await fullReconnect(key, accounts[0]);
      // Clear fallback cache so getReadProvider uses the fresh wallet provider
      fallbackProviderRef.current = null;
      setUserAddr(accounts[0]);
      setConnected(true);
      setChainKey(key);
    } catch (e) {
      console.error('Connection failed:', e);
    }
  }, [fullReconnect]);

  // ═══ REFRESH BALANCES + USER STATS ═══
  const refreshBalances = useCallback(async () => {
    const { xen, dxnV2, oldDxn, dbxen, oldV2Dxn } = contractsRef.current;
    if (!dbxen || !userAddr) return;
    try {
      const [xBal, dBal, oBal] = await Promise.all([
        xen.balanceOf(userAddr), dxnV2.balanceOf(userAddr), oldDxn.balanceOf(userAddr),
      ]);
      setXenBal(xBal); setDxnBal(dBal); setOldDxnBal(oBal);

      if (oldV2Dxn) {
        const v2Bal = await oldV2Dxn.balanceOf(userAddr);
        setOldV2DxnBal(v2Bal);
      }

      // Compute user rewards/stakes (mirrors original logic exactly)
      let accRew = await dbxen.accRewards(userAddr);
      let accFees = await dbxen.accAccruedFees(userAddr);
      let accWithdraw = await dbxen.accWithdrawableStake(userAddr);
      const lastActive = await dbxen.lastActiveCycle(userAddr);
      const lastFeeUpdate = await dbxen.lastFeeUpdateCycle(userAddr);
      const cycleBatchesBurned = await dbxen.accCycleBatchesBurned(userAddr);
      const firstStakeCycle = await dbxen.accFirstStake(userAddr);
      const secondStakeCycle = await dbxen.accSecondStake(userAddr);
      const currentCycle = await dbxen.getCurrentCycle();
      const lastStarted = await dbxen.lastStartedCycle();

      if (currentCycle > lastActive && cycleBatchesBurned > 0n) {
        const rewardForCycle = await dbxen.rewardPerCycle(lastActive);
        const totalBurned = await dbxen.cycleTotalBatchesBurned(lastActive);
        if (totalBurned > 0n) accRew += (cycleBatchesBurned * rewardForCycle) / totalBurned;
      }

      const feeCheckpoint = await dbxen.cycleFeesPerStakeSummed(lastStarted + 1n);
      if (currentCycle > lastStarted && lastFeeUpdate > 0n && lastFeeUpdate !== lastStarted + 1n) {
        const userFeeCp = await dbxen.cycleFeesPerStakeSummed(lastFeeUpdate);
        const feesDelta = feeCheckpoint - userFeeCp;
        if (feesDelta > 0n && accRew > 0n) accFees += (accRew * feesDelta) / SCALING;
      }

      let pendingStakeAmount = 0n;
      let simFirst = firstStakeCycle, simSecond = secondStakeCycle;

      if (simFirst > 0n && currentCycle > simFirst) {
        const unlocked = await dbxen.accStakeCycle(userAddr, simFirst);
        accRew += unlocked; accWithdraw += unlocked;
        if (lastStarted + 1n > simFirst) {
          const cp = await dbxen.cycleFeesPerStakeSummed(simFirst);
          accFees += (unlocked * (feeCheckpoint - cp)) / SCALING;
        }
        if (simSecond > 0n) {
          if (currentCycle > simSecond) {
            const unlocked2 = await dbxen.accStakeCycle(userAddr, simSecond);
            accRew += unlocked2; accWithdraw += unlocked2;
            if (lastStarted + 1n > simSecond) {
              const cp2 = await dbxen.cycleFeesPerStakeSummed(simSecond);
              accFees += (unlocked2 * (feeCheckpoint - cp2)) / SCALING;
            }
          } else {
            pendingStakeAmount += await dbxen.accStakeCycle(userAddr, simSecond);
          }
        }
      } else if (simFirst > 0n && simFirst >= currentCycle) {
        pendingStakeAmount += await dbxen.accStakeCycle(userAddr, simFirst);
      }
      if (simSecond > 0n && currentCycle <= simSecond) {
        pendingStakeAmount += await dbxen.accStakeCycle(userAddr, simSecond);
      }

      let unlockTs = 0;
      if (pendingStakeAmount > 0n) {
        let unlockCycle = 0n;
        if (firstStakeCycle > 0n && firstStakeCycle >= currentCycle) unlockCycle = firstStakeCycle;
        if (secondStakeCycle > 0n && secondStakeCycle >= currentCycle) {
          if (unlockCycle === 0n || secondStakeCycle < unlockCycle) unlockCycle = secondStakeCycle;
        }
        if (unlockCycle > 0n) {
          const initTs = await dbxen.i_initialTimestamp();
          const period = await dbxen.i_periodDuration();
          unlockTs = Number(initTs + ((unlockCycle + 1n) * period));
        }
      }

      const unclaimedDxn = accRew - accWithdraw;
      setUserStats({
        unclaimedDxn: unclaimedDxn > 0n ? unclaimedDxn : 0n,
        unclaimedFees: accFees > 0n ? accFees : 0n,
        totalStake: accWithdraw + pendingStakeAmount,
        withdrawable: accWithdraw,
        pendingStake: pendingStakeAmount,
        pendingUnlockTs: unlockTs,
      });
    } catch (e) {
      console.error('Balance refresh failed:', e);
    }
  }, [userAddr]);

  // ═══ REFRESH PROTOCOL STATS ═══
  // Two-tier: wallet provider uses Promise.all, fallback uses sequential
  const refreshProtocolStats = useCallback(async () => {
    const epoch = chainEpochRef.current;
    const key = chainKeyRef.current;
    const c = CHAINS[key];
    let { provider: readProvider, isFallback } = getReadProvider();

    const tryWithProvider = async (provider, sequential) => {
      const dbxRead = new ethers.Contract(c.contracts.DBXEN_V2, DBXEN_ABI, provider);

      let cycle, reward, initTs, period, storedCycle, totalBatches, pendingStakeAmt;

      if (sequential) {
        cycle = await dbxRead.getCurrentCycle();
        if (isStale(epoch)) return;
        reward = await dbxRead.currentCycleReward();
        if (isStale(epoch)) return;
        initTs = await dbxRead.i_initialTimestamp();
        if (isStale(epoch)) return;
        period = await dbxRead.i_periodDuration();
        if (isStale(epoch)) return;
        storedCycle = await dbxRead.currentCycle();
        if (isStale(epoch)) return;
        totalBatches = await dbxRead.totalNumberOfBatchesBurned();
        if (isStale(epoch)) return;
        pendingStakeAmt = await dbxRead.pendingStake();
        if (isStale(epoch)) return;
      } else {
        [cycle, reward, initTs, period, storedCycle, totalBatches, pendingStakeAmt] = await Promise.all([
          dbxRead.getCurrentCycle(), dbxRead.currentCycleReward(), dbxRead.i_initialTimestamp(),
          dbxRead.i_periodDuration(), dbxRead.currentCycle(), dbxRead.totalNumberOfBatchesBurned(),
          dbxRead.pendingStake(),
        ]);
        if (isStale(epoch)) return;
      }

      let oldBatches = 0n;
      if (c.oldDbxenV1) {
        try {
          const oldC = new ethers.Contract(c.oldDbxenV1, OLD_DBXEN_ABI, provider);
          oldBatches = await oldC.totalNumberOfBatchesBurned();
          if (isStale(epoch)) return;
        } catch {}
      }

      const xenBurnedV1 = oldBatches * 2500000n * (10n ** 18n);
      const xenBurnedV2 = totalBatches * getBatchSize(c);
      const nextCycleTs = Number(initTs + ((cycle + 1n) * period));

      let totalStaked = 0n, apy = null;
      try {
        const summedStakes = await dbxRead.summedCycleStakes(storedCycle);
        if (isStale(epoch)) return;
        totalStaked = summedStakes - reward + pendingStakeAmt;
        const lastFees = await dbxRead.cycleAccruedFees(storedCycle > 0n ? storedCycle : cycle);
        if (isStale(epoch)) return;
        if (totalStaked > 0n && lastFees > 0n) {
          const dailyRate = parseFloat(ethers.formatEther(lastFees)) / parseFloat(ethers.formatEther(totalStaked));
          apy = (dailyRate * 365 * 100).toFixed(1);
        }
      } catch {
        totalStaked = pendingStakeAmt;
      }

      if (isStale(epoch)) return;
      setProtocolStats({
        cycle: Number(cycle), reward, xenBurnedV1, xenBurnedV2, totalStaked, apy, nextCycleTs,
      });
    };

    try {
      await tryWithProvider(readProvider, isFallback);
    } catch (e) {
      console.error('Protocol stats failed (primary):', e);
      // If fallback RPC failed, try backup
      if (isFallback) {
        const backup = getFallbackWithBackup(key);
        if (backup) {
          try { await tryWithProvider(backup, true); }
          catch (e2) { console.error('Protocol stats failed (backup):', e2); }
        }
      }
    }
  }, [chainKey, getReadProvider, getFallbackWithBackup]);

  // ═══ REFRESH BRIDGE STATS ═══
  const refreshBridgeStats = useCallback(async () => {
    const epoch = chainEpochRef.current;
    const key = chainKeyRef.current;
    const c = CHAINS[key];
    let { provider: readProvider, isFallback } = getReadProvider();

    const tryWithProvider = async (provider, sequential) => {
      const migAbi = c.dualMigration ? DUAL_MIGRATION_ABI : MIGRATION_ABI;
      const migRead = new ethers.Contract(c.contracts.MIGRATION, migAbi, provider);
      const dxnRead = new ethers.Contract(c.contracts.DXN_V2, ERC20_ABI, provider);

      let totalSwapped, poolBal, deadline;

      if (sequential) {
        if (c.dualMigration) {
          const v1 = await migRead.totalSwappedV1();
          if (isStale(epoch)) return;
          const v2 = await migRead.totalSwappedV2();
          if (isStale(epoch)) return;
          totalSwapped = v1 + v2;
        } else {
          totalSwapped = await migRead.totalSwapped();
          if (isStale(epoch)) return;
        }
        poolBal = await dxnRead.balanceOf(c.contracts.MIGRATION);
        if (isStale(epoch)) return;
        deadline = await migRead.deadline();
        if (isStale(epoch)) return;
      } else {
        if (c.dualMigration) {
          const [v1, v2] = await Promise.all([migRead.totalSwappedV1(), migRead.totalSwappedV2()]);
          totalSwapped = v1 + v2;
        } else {
          totalSwapped = await migRead.totalSwapped();
        }
        if (isStale(epoch)) return;
        [poolBal, deadline] = await Promise.all([
          dxnRead.balanceOf(c.contracts.MIGRATION), migRead.deadline(),
        ]);
        if (isStale(epoch)) return;
      }

      setBridgeStats({
        totalMigrated: totalSwapped, poolRemaining: poolBal,
        deadline, totalPool: totalSwapped + poolBal,
      });
    };

    try {
      await tryWithProvider(readProvider, isFallback);
    } catch (e) {
      console.error('Bridge stats failed (primary):', e);
      if (isFallback) {
        const backup = getFallbackWithBackup(key);
        if (backup) {
          try { await tryWithProvider(backup, true); }
          catch (e2) { console.error('Bridge stats failed (backup):', e2); }
        }
      }
    }
  }, [chainKey, getReadProvider, getFallbackWithBackup]);

  // ═══ REFRESH LEGACY (PULSECHAIN) ═══
  const refreshLegacy = useCallback(async () => {
    const c = CHAINS[chainKey];
    if (!c.dualMigration || !userAddr) return;
    const { legacyDbxen, oldV2Dxn, signer } = contractsRef.current;
    if (!legacyDbxen) return;
    try {
      const v2Bal = await oldV2Dxn.balanceOf(userAddr);

      let accRew = await legacyDbxen.accRewards(userAddr);
      let accWithdraw = await legacyDbxen.accWithdrawableStake(userAddr);
      let accFees = await legacyDbxen.accAccruedFees(userAddr);
      const lastActive = await legacyDbxen.lastActiveCycle(userAddr);
      const lastFeeUpdate = await legacyDbxen.lastFeeUpdateCycle(userAddr);
      const cycleBatchesBurned = await legacyDbxen.accCycleBatchesBurned(userAddr);
      const firstStake = await legacyDbxen.accFirstStake(userAddr);
      const secondStake = await legacyDbxen.accSecondStake(userAddr);
      const currentCycle = await legacyDbxen.getCurrentCycle();
      const lastStarted = await legacyDbxen.lastStartedCycle();

      if (currentCycle > lastActive && cycleBatchesBurned > 0n) {
        const rpc = await legacyDbxen.rewardPerCycle(lastActive);
        const tb = await legacyDbxen.cycleTotalBatchesBurned(lastActive);
        if (tb > 0n) accRew += (cycleBatchesBurned * rpc) / tb;
      }

      const feeCp = await legacyDbxen.cycleFeesPerStakeSummed(lastStarted + 1n);
      if (currentCycle > lastStarted && lastFeeUpdate > 0n && lastFeeUpdate !== lastStarted + 1n) {
        const uCp = await legacyDbxen.cycleFeesPerStakeSummed(lastFeeUpdate);
        const delta = feeCp - uCp;
        if (delta > 0n && accRew > 0n) accFees += (accRew * delta) / SCALING;
      }

      let pending = 0n;
      let sf = firstStake, ss = secondStake;
      if (sf > 0n && currentCycle > sf) {
        const u1 = await legacyDbxen.accStakeCycle(userAddr, sf);
        accRew += u1; accWithdraw += u1;
        if (lastStarted + 1n > sf) {
          const c1 = await legacyDbxen.cycleFeesPerStakeSummed(sf);
          accFees += (u1 * (feeCp - c1)) / SCALING;
        }
        if (ss > 0n) {
          if (currentCycle > ss) {
            const u2 = await legacyDbxen.accStakeCycle(userAddr, ss);
            accRew += u2; accWithdraw += u2;
            if (lastStarted + 1n > ss) {
              const c2 = await legacyDbxen.cycleFeesPerStakeSummed(ss);
              accFees += (u2 * (feeCp - c2)) / SCALING;
            }
          } else {
            pending += await legacyDbxen.accStakeCycle(userAddr, ss);
          }
        }
      } else if (sf > 0n && sf >= currentCycle) {
        pending += await legacyDbxen.accStakeCycle(userAddr, sf);
      }
      if (ss > 0n && currentCycle <= ss) {
        pending += await legacyDbxen.accStakeCycle(userAddr, ss);
      }

      let unlockTs = 0;
      if (pending > 0n) {
        let uc = 0n;
        if (firstStake > 0n && firstStake >= currentCycle) uc = firstStake;
        if (secondStake > 0n && secondStake >= currentCycle && (uc === 0n || secondStake < uc)) uc = secondStake;
        if (uc > 0n) {
          const iTs = await legacyDbxen.i_initialTimestamp();
          const per = await legacyDbxen.i_periodDuration();
          unlockTs = Number(iTs + ((uc + 1n) * per));
        }
      }

      let deadlineVal = 0n;
      try {
        const oldMig = new ethers.Contract(c.legacy.MIGRATION, MIGRATION_ABI, signer);
        deadlineVal = await oldMig.deadline();
      } catch {}

      const uDxn = accRew - accWithdraw;
      setLegacyStats({
        unclaimedDxn: uDxn > 0n ? uDxn : 0n,
        unclaimedFees: accFees > 0n ? accFees : 0n,
        totalStake: accWithdraw + pending,
        withdrawable: accWithdraw,
        pendingStake: pending,
        pendingUnlockTs: unlockTs,
        deadline: deadlineVal,
        oldDxnBal: v2Bal,
      });
    } catch (e) {
      console.error('Legacy refresh failed:', e);
    }
  }, [chainKey, userAddr]);

  // ═══ REFRESH ALL ═══
  const refreshAll = useCallback(async () => {
    await Promise.all([refreshBalances(), refreshProtocolStats(), refreshBridgeStats(), refreshLegacy()]);
  }, [refreshBalances, refreshProtocolStats, refreshBridgeStats, refreshLegacy]);

  // ═══ TRANSACTION HELPERS ═══
  const burnBatch = useCallback(async (batches) => {
    const { xen, dbxen, signer, provider } = contractsRef.current;
    if (!signer) return;
    const c = CHAINS[chainKey];
    const xenNeeded = BigInt(batches) * getBatchSize(c);
    if (xenBal < xenNeeded) { toast.error(`Not enough XEN.`); return; }

    const allowance = await xen.allowance(userAddr, c.contracts.DBXEN_V2);
    if (allowance < xenNeeded) {
      toast('Approving XEN...');
      const appTx = await xen.approve(c.contracts.DBXEN_V2, ethers.MaxUint256);
      await appTx.wait();
    }

    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || 1000000000n;
    const isL2 = c.chainId !== '0x1';
    const gasEst = BigInt(isL2 ? 600000 : 200000) + 39400n;
    const disc = BigInt(batches) * (100000n - 5n * BigInt(batches));
    let estFee = (gasEst * gasPrice * disc) / 100000n;
    if (estFee < (c.minFee || 0n)) estFee = c.minFee;
    const value = estFee * 2n > ethers.parseEther('0.0005') ? estFee * 2n : ethers.parseEther('0.0005');

    const tx = await dbxen.burnBatch(batches, { value, gasLimit: 500000 });
    await tx.wait();
    toast.success('XEN burned successfully!');
    await refreshAll();
  }, [chainKey, xenBal, userAddr, refreshAll]);

  const stakeTokens = useCallback(async (amount) => {
    const { dxnV2, dbxen } = contractsRef.current;
    const c = CHAINS[chainKey];
    const allowance = await dxnV2.allowance(userAddr, c.contracts.DBXEN_V2);
    if (allowance < amount) {
      toast('Approving DXN...');
      const tx = await dxnV2.approve(c.contracts.DBXEN_V2, ethers.MaxUint256);
      await tx.wait();
    }
    const tx = await dbxen.stake(amount);
    await tx.wait();
    toast.success('DXN staked!');
    await refreshAll();
  }, [chainKey, userAddr, refreshAll]);

  const unstakeTokens = useCallback(async (amount) => {
    const { dbxen } = contractsRef.current;
    const tx = await dbxen.unstake(amount);
    await tx.wait();
    toast.success('DXN unstaked!');
    await refreshAll();
  }, [refreshAll]);

  const claimDxn = useCallback(async () => {
    const { dbxen } = contractsRef.current;
    const tx = await dbxen.claimRewards();
    await tx.wait();
    toast.success('DXN rewards claimed!');
    await refreshAll();
  }, [refreshAll]);

  const claimFees = useCallback(async () => {
    const { dbxen } = contractsRef.current;
    const tx = await dbxen.claimFees();
    await tx.wait();
    toast.success('Fees claimed!');
    await refreshAll();
  }, [refreshAll]);

  const migrate = useCallback(async (amount, source = 'v1') => {
    const { migration, oldDxn, oldV2Dxn } = contractsRef.current;
    const c = CHAINS[chainKey];
    const isDual = c.dualMigration;
    const srcContract = (isDual && source === 'v2') ? oldV2Dxn : oldDxn;

    const allowance = await srcContract.allowance(userAddr, c.contracts.MIGRATION);
    if (allowance < amount) {
      toast('Approving...');
      const tx = await srcContract.approve(c.contracts.MIGRATION, ethers.MaxUint256);
      await tx.wait();
    }
    let tx;
    if (isDual) {
      tx = source === 'v2' ? await migration.swapV2(amount) : await migration.swapV1(amount);
    } else {
      tx = await migration.swap(amount);
    }
    await tx.wait();
    toast.success('DXN migrated!');
    await refreshAll();
  }, [chainKey, userAddr, refreshAll]);

  const legacyUnstake = useCallback(async (amount) => {
    const { legacyDbxen } = contractsRef.current;
    const tx = await legacyDbxen.unstake(amount);
    await tx.wait();
    toast.success('Legacy unstaked!');
    await refreshAll();
  }, [refreshAll]);

  const legacyClaimDxn = useCallback(async () => {
    const { legacyDbxen } = contractsRef.current;
    const tx = await legacyDbxen.claimRewards();
    await tx.wait();
    toast.success('Legacy DXN claimed!');
    await refreshAll();
  }, [refreshAll]);

  const legacyClaimFees = useCallback(async () => {
    const { legacyDbxen } = contractsRef.current;
    const tx = await legacyDbxen.claimFees();
    await tx.wait();
    toast.success('Legacy fees claimed!');
    await refreshAll();
  }, [refreshAll]);

  const addTokenToWallet = useCallback(async () => {
    if (!window.ethereum) return;
    const c = CHAINS[chainKey];
    try {
      await window.ethereum.request({
        method: 'wallet_watchAsset',
        params: { type: 'ERC20', options: { address: c.contracts.DXN_V2, symbol: c.dxnSym + 'v2', decimals: 18 } },
      });
      toast.success('Token added!');
    } catch { toast.error('Failed to add token'); }
  }, [chainKey]);

  const switchChain = useCallback(async (key) => {
    const c = CHAINS[key];
    if (!c?.contracts.DBXEN_V2) return;
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: c.chainId }] });
    } catch (err) {
      if (err.code === 4902 && c.addChain) {
        try { await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [c.addChain] }); } catch {}
      }
    }
  }, []);

  const getGasInfo = useCallback(async () => {
    try {
      const { provider } = getReadProvider();
      const feeData = await provider.getFeeData();
      return feeData.gasPrice || 0n;
    } catch {
      return 0n;
    }
  }, [getReadProvider]);

  // ═══ CHAIN CHANGE EFFECT ═══
  useEffect(() => {
    const isFirstRender = chainKeyRef.current === chainKey && chainEpochRef.current === 0;
    chainKeyRef.current = chainKey;
    chainEpochRef.current += 1;
    // Clear cached fallback provider so getReadProvider creates one for the new chain
    fallbackProviderRef.current = null;
    // Always refresh protocol + bridge stats on chain change (and on mount)
    refreshProtocolStats();
    refreshBridgeStats();
    // If wallet connected, also refresh user-specific data
    if (connected && !isFirstRender) {
      refreshBalances();
      refreshLegacy();
    }
  }, [chainKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ═══ AUTO-CONNECT + EVENT LISTENERS ═══
  useEffect(() => {
    if (typeof window.ethereum === 'undefined') return;
    (async () => {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) connectWallet();
      } catch {}
    })();

    const handleChainChanged = async (newId) => {
      const key = detectChainKey(newId);
      if (!key) { toast.error('Unsupported network.'); return; }
      // Wait for MetaMask to fully settle
      await new Promise(r => setTimeout(r, 150));
      // Full reconnect: new provider, new signer, new contracts
      chainKeyRef.current = key;
      fallbackProviderRef.current = null;
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
          await fullReconnect(key, accounts[0]);
          setUserAddr(accounts[0]);
          setConnected(true);
        } else {
          // No wallet connected — clear contracts so getReadProvider uses fallback
          contractsRef.current = {};
        }
      } catch (e) {
        console.error('Chain switch rebuild failed:', e);
        // Even on failure, clear stale contracts so fallback provider is used
        contractsRef.current = {};
      }
      // Setting chainKey triggers the useEffect that refreshes everything
      setChainKey(key);
    };
    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) location.reload();
      else { setUserAddr(accounts[0]); }
    };

    window.ethereum.on('chainChanged', handleChainChanged);
    window.ethereum.on('accountsChanged', handleAccountsChanged);
    return () => {
      window.ethereum.removeListener('chainChanged', handleChainChanged);
      window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
    };
  }, [connectWallet, fullReconnect]);

  // Refresh when userAddr changes
  useEffect(() => {
    if (connected && userAddr) refreshAll();
  }, [connected, userAddr, refreshAll]);

  // Mobile link fix
  useEffect(() => {
    if (!/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) return;
    const handler = (e) => {
      const link = e.target.closest('a[target="_blank"]');
      if (link?.href) { e.preventDefault(); window.location.href = link.href; }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  return (
    <WalletContext.Provider value={{
      chainKey, chain, addr, userAddr, ethBal, connected,
      xenBal, dxnBal, oldDxnBal, oldV2DxnBal,
      protocolStats, userStats, bridgeStats, legacyStats,
      connectWallet, switchChain, refreshAll, refreshBalances, refreshProtocolStats, refreshBridgeStats,
      burnBatch, stakeTokens, unstakeTokens, claimDxn, claimFees,
      migrate, legacyUnstake, legacyClaimDxn, legacyClaimFees,
      addTokenToWallet, getGasInfo, contractsRef, getReadProvider,
    }}>
      {children}
    </WalletContext.Provider>
  );
}
