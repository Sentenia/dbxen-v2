import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import { NXD_CONTRACTS, NXD_ABIS } from '../config/nxd.js';
import { useWallet } from './WalletContext';
import toast from 'react-hot-toast';

const NXDContext = createContext(null);
export const useNXD = () => useContext(NXDContext);

const ETH_RPC = 'https://rpc.ankr.com/eth';
const ETH_RPC_BACKUP = 'https://cloudflare-eth.com';

export function NXDProvider({ children }) {
  const { userAddr, connected, chainKey, contractsRef } = useWallet();

  // Protocol stats
  const [protocolStats, setProtocolStats] = useState({
    nxdSupply: 0n, nxdBurned: 0n, tokenNXDBurned: 0n, protocolNXDBurned: 0n, dxnStaked: 0n, dxnBurned: 0n,
    ethToVault: 0n, ethDevFee: 0n, currentRate: 0n,
    startTime: 0, endTime: 0, totalDXNDeposited: 0n,
    maxSupply: 0n, pendingDXNToStake: 0n, nxdInLP: 0n, dxnV2TotalSupply: 0n,
  });

  // Staking vault stats
  const [vaultStats, setVaultStats] = useState({
    totalStaked: 0n, userStake: 0n, pendingRewards: 0n,
    withdrawRequestAmount: 0n, withdrawRequestTimestamp: 0,
    nxdPenaltyBurned: 0n,
  });

  // Migration stats
  const [migrationStats, setMigrationStats] = useState({
    totalSwapped: 0n, deadline: 0, active: false,
  });

  // User balances
  const [nxdBal, setNxdBal] = useState(0n);
  const [oldNxdBal, setOldNxdBal] = useState(0n);
  const [dxnBal, setDxnBal] = useState(0n);

  // User referral
  const [userReferral, setUserReferral] = useState({
    code: 0n, referredRewards: 0n, referrerRewards: 0n,
    totalMinted: 0n, totalBonus: 0n,
  });

  const fallbackRef = useRef(null);

  const getReadProvider = useCallback(() => {
    // Use wallet provider if connected and on Ethereum
    if (connected && chainKey === 'ethereum') {
      const wp = contractsRef.current.provider;
      if (wp) return wp;
    }
    // Fallback to public RPC
    if (fallbackRef.current) return fallbackRef.current;
    try {
      const p = new ethers.JsonRpcProvider(ETH_RPC);
      fallbackRef.current = p;
      return p;
    } catch {
      const p = new ethers.JsonRpcProvider(ETH_RPC_BACKUP);
      fallbackRef.current = p;
      return p;
    }
  }, [connected, chainKey, contractsRef]);

  const getSigner = useCallback(() => {
    if (!connected || chainKey !== 'ethereum') return null;
    return contractsRef.current.signer || null;
  }, [connected, chainKey, contractsRef]);

  // ═══ REFRESH PROTOCOL STATS ═══
  const refreshProtocolStats = useCallback(async () => {
    try {
      const provider = getReadProvider();
      const protocol = new ethers.Contract(NXD_CONTRACTS.NXDProtocol, NXD_ABIS.NXDProtocol, provider);
      const token = new ethers.Contract(NXD_CONTRACTS.NXDv2Token, NXD_ABIS.NXDv2Token, provider);

      const [
        supply, tokenBurned, protocolBurned, dxnStaked, dxnBurned,
        ethToVault, ethDevFee, rate,
        start, end, totalDeposited, maxSup, pendingDxn, pairAddr,
      ] = await Promise.all([
        token.totalSupply(), token.totalNXDBurned(), protocol.totalNXDBurned(), protocol.totalDXNStaked(), protocol.totalDXNBurned(),
        protocol.totalETHToStakingVault(), protocol.totalETHDevFee(), protocol.currentRate(),
        protocol.startTime(), protocol.endTime(), protocol.totalDXNDepositedLMP(),
        token.maxSupply(), protocol.pendingDXNToStake(), token.uniswapV2Pair(),
      ]);

      let nxdInLP = 0n;
      if (pairAddr && pairAddr !== ethers.ZeroAddress) {
        try { nxdInLP = await token.balanceOf(pairAddr); } catch {}
      }

      let dxnV2TotalSupply = 0n;
      try {
        const dxnToken = new ethers.Contract(NXD_CONTRACTS.DXNv2, [
          'function totalSupply() view returns (uint256)',
        ], provider);
        dxnV2TotalSupply = await dxnToken.totalSupply();
      } catch {}

      setProtocolStats({
        nxdSupply: supply, nxdBurned: tokenBurned + protocolBurned, tokenNXDBurned: tokenBurned, protocolNXDBurned: protocolBurned, dxnStaked, dxnBurned,
        ethToVault, ethDevFee, currentRate: rate,
        startTime: Number(start), endTime: Number(end),
        totalDXNDeposited: totalDeposited, maxSupply: maxSup, pendingDXNToStake: pendingDxn, nxdInLP, dxnV2TotalSupply,
      });
    } catch (e) {
      console.error('[NXD refreshProtocolStats]', e);
    }
  }, [getReadProvider]);

  // ═══ REFRESH VAULT STATS ═══
  const refreshVaultStats = useCallback(async () => {
    try {
      const provider = getReadProvider();
      const vault = new ethers.Contract(NXD_CONTRACTS.NXDStakingVault, NXD_ABIS.NXDStakingVault, provider);

      const [totalStaked, nxdPenaltyBurned] = await Promise.all([
        vault.totalStaked(), vault.nxdPenaltyBurned(),
      ]);
      let userStake = 0n, pendingRewards = 0n, withdrawRequestAmount = 0n, withdrawRequestTimestamp = 0;
      if (userAddr) {
        const [info, pending, wdReq] = await Promise.all([
          vault.userInfo(0, userAddr),
          vault.pendingETH(0, userAddr),
          vault.withdrawalRequests(0, userAddr),
        ]);
        userStake = info.amount;
        pendingRewards = pending;
        withdrawRequestAmount = wdReq.amount;
        withdrawRequestTimestamp = Number(wdReq.canWithdrawAfterTimestamp);
      }
      setVaultStats({ totalStaked, userStake, pendingRewards, withdrawRequestAmount, withdrawRequestTimestamp, nxdPenaltyBurned });
    } catch (e) {
      console.error('[NXD refreshVaultStats]', e);
    }
  }, [getReadProvider, userAddr]);

  // ═══ REFRESH MIGRATION STATS ═══
  const refreshMigrationStats = useCallback(async () => {
    try {
      const provider = getReadProvider();
      const mig = new ethers.Contract(NXD_CONTRACTS.NXDMigrationV2, NXD_ABIS.NXDMigrationV2, provider);

      const [totalSwapped, deadline, active] = await Promise.all([
        mig.totalSwapped(), mig.deadline(), mig.active(),
      ]);
      setMigrationStats({ totalSwapped, deadline: Number(deadline), active });
    } catch (e) {
      console.error('[NXD refreshMigrationStats]', e);
    }
  }, [getReadProvider]);

  // ═══ REFRESH USER BALANCES ═══
  const refreshBalances = useCallback(async () => {
    if (!userAddr) return;
    try {
      const provider = getReadProvider();
      const token = new ethers.Contract(NXD_CONTRACTS.NXDv2Token, NXD_ABIS.NXDv2Token, provider);
      const oldNxd = new ethers.Contract(NXD_CONTRACTS.OldNXD, NXD_ABIS.OldNXD, provider);
      const dxn = new ethers.Contract(NXD_CONTRACTS.DXNv2, [
        'function balanceOf(address) view returns (uint256)',
      ], provider);
      const protocol = new ethers.Contract(NXD_CONTRACTS.NXDProtocol, NXD_ABIS.NXDProtocol, provider);

      const [nBal, oBal, dBal, code, refRewards, rerRewards, minted, bonus] = await Promise.all([
        token.balanceOf(userAddr), oldNxd.balanceOf(userAddr), dxn.balanceOf(userAddr),
        protocol.userToReferralCode(userAddr), protocol.referredRewards(userAddr),
        protocol.referrerRewards(userAddr), protocol.userTotalMintedNoBonus(userAddr),
        protocol.userTotalBonus(userAddr),
      ]);
      setNxdBal(nBal);
      setOldNxdBal(oBal);
      setDxnBal(dBal);
      setUserReferral({ code, referredRewards: refRewards, referrerRewards: rerRewards, totalMinted: minted, totalBonus: bonus });
    } catch (e) {
      console.error('[NXD refreshBalances]', e);
    }
  }, [getReadProvider, userAddr]);

  // ═══ REFRESH ALL ═══
  const refreshAll = useCallback(async () => {
    await Promise.all([refreshProtocolStats(), refreshVaultStats(), refreshMigrationStats(), refreshBalances()]);
  }, [refreshProtocolStats, refreshVaultStats, refreshMigrationStats, refreshBalances]);

  // ═══ WRITE FUNCTIONS ═══

  const deposit = useCallback(async (amount, referralCode = 0) => {
    const signer = getSigner();
    if (!signer) { toast.error('Connect wallet on Ethereum'); return; }
    const dxn = new ethers.Contract(NXD_CONTRACTS.DXNv2, [
      'function approve(address,uint256) returns (bool)',
      'function allowance(address,address) view returns (uint256)',
    ], signer);

    const allowance = await dxn.allowance(userAddr, NXD_CONTRACTS.NXDProtocol);
    if (allowance < amount) {
      toast('Approving DXNv2...');
      const tx = await dxn.approve(NXD_CONTRACTS.NXDProtocol, ethers.MaxUint256);
      await tx.wait();
    }

    const protocol = new ethers.Contract(NXD_CONTRACTS.NXDProtocol, NXD_ABIS.NXDProtocol, signer);
    const tx = await protocol.deposit(amount, referralCode, true);
    await tx.wait();
    toast.success('NXDv2 minted!');
    await refreshAll();
  }, [getSigner, userAddr, refreshAll]);

  const stakeNXD = useCallback(async (amount) => {
    const signer = getSigner();
    if (!signer) { toast.error('Connect wallet on Ethereum'); return; }
    const token = new ethers.Contract(NXD_CONTRACTS.NXDv2Token, NXD_ABIS.NXDv2Token, signer);

    const allowance = await token.allowance(userAddr, NXD_CONTRACTS.NXDStakingVault);
    if (allowance < amount) {
      toast('Approving NXDv2...');
      const tx = await token.approve(NXD_CONTRACTS.NXDStakingVault, ethers.MaxUint256);
      await tx.wait();
    }

    const vault = new ethers.Contract(NXD_CONTRACTS.NXDStakingVault, NXD_ABIS.NXDStakingVault, signer);
    const tx = await vault.deposit(0, amount);
    await tx.wait();
    toast.success('NXDv2 staked!');
    await refreshAll();
  }, [getSigner, userAddr, refreshAll]);

  const unstakeWithPenalty = useCallback(async (amount) => {
    const signer = getSigner();
    if (!signer) { toast.error('Connect wallet on Ethereum'); return; }
    const vault = new ethers.Contract(NXD_CONTRACTS.NXDStakingVault, NXD_ABIS.NXDStakingVault, signer);
    const tx = await vault.withdraw(0, amount, true);
    await tx.wait();
    toast.success('NXDv2 unstaked (25% penalty applied)');
    await refreshAll();
  }, [getSigner, refreshAll]);

  const requestWithdraw = useCallback(async (amount) => {
    const signer = getSigner();
    if (!signer) { toast.error('Connect wallet on Ethereum'); return; }
    const vault = new ethers.Contract(NXD_CONTRACTS.NXDStakingVault, NXD_ABIS.NXDStakingVault, signer);
    const tx = await vault.withdraw(0, amount, false);
    await tx.wait();
    toast.success('Withdrawal requested — 24h cooldown started');
    await refreshAll();
  }, [getSigner, refreshAll]);

  const completeWithdraw = useCallback(async () => {
    const signer = getSigner();
    if (!signer) { toast.error('Connect wallet on Ethereum'); return; }
    const vault = new ethers.Contract(NXD_CONTRACTS.NXDStakingVault, NXD_ABIS.NXDStakingVault, signer);
    const tx = await vault.withdrawCooldown(0);
    await tx.wait();
    toast.success('Withdrawal complete!');
    await refreshAll();
  }, [getSigner, refreshAll]);

  const claimETHRewards = useCallback(async () => {
    const signer = getSigner();
    if (!signer) { toast.error('Connect wallet on Ethereum'); return; }
    const vault = new ethers.Contract(NXD_CONTRACTS.NXDStakingVault, NXD_ABIS.NXDStakingVault, signer);
    const tx = await vault.deposit(0, 0);
    await tx.wait();
    toast.success('ETH rewards claimed!');
    await refreshAll();
  }, [getSigner, refreshAll]);

  const migrateOldNXD = useCallback(async (amount) => {
    const signer = getSigner();
    if (!signer) { toast.error('Connect wallet on Ethereum'); return; }
    const oldNxd = new ethers.Contract(NXD_CONTRACTS.OldNXD, NXD_ABIS.OldNXD, signer);

    const allowance = await oldNxd.allowance(userAddr, NXD_CONTRACTS.NXDMigrationV2);
    if (allowance < amount) {
      toast('Approving old NXD...');
      const tx = await oldNxd.approve(NXD_CONTRACTS.NXDMigrationV2, ethers.MaxUint256);
      await tx.wait();
    }

    const mig = new ethers.Contract(NXD_CONTRACTS.NXDMigrationV2, NXD_ABIS.NXDMigrationV2, signer);
    const tx = await mig.swap(amount);
    await tx.wait();
    toast.success('NXD migrated to NXDv2!');
    await refreshAll();
  }, [getSigner, userAddr, refreshAll]);

  const setReferralCode = useCallback(async (code) => {
    const signer = getSigner();
    if (!signer) { toast.error('Connect wallet on Ethereum'); return; }
    const protocol = new ethers.Contract(NXD_CONTRACTS.NXDProtocol, NXD_ABIS.NXDProtocol, signer);
    const tx = await protocol.setReferralCode(code);
    await tx.wait();
    toast.success('Referral code set!');
    await refreshAll();
  }, [getSigner, refreshAll]);

  const withdrawReferralRewards = useCallback(async () => {
    const signer = getSigner();
    if (!signer) { toast.error('Connect wallet on Ethereum'); return; }
    const protocol = new ethers.Contract(NXD_CONTRACTS.NXDProtocol, NXD_ABIS.NXDProtocol, signer);
    const tx = await protocol.withdrawReferralRewards();
    await tx.wait();
    toast.success('Referral rewards claimed!');
    await refreshAll();
  }, [getSigner, refreshAll]);

  // ═══ AUTO REFRESH ═══
  useEffect(() => {
    refreshAll();
    const id = setInterval(refreshAll, 30000);
    return () => clearInterval(id);
  }, [refreshAll]);

  return (
    <NXDContext.Provider value={{
      protocolStats, vaultStats, migrationStats,
      nxdBal, oldNxdBal, dxnBal, userReferral,
      deposit, stakeNXD, unstakeWithPenalty, requestWithdraw, completeWithdraw, claimETHRewards,
      migrateOldNXD, setReferralCode, withdrawReferralRewards, refreshAll,
    }}>
      {children}
    </NXDContext.Provider>
  );
}
