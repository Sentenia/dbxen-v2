export const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function allowance(address,address) view returns (uint256)',
];

export const DBXEN_ABI = [
  'function burnBatch(uint256) payable',
  'function stake(uint256)',
  'function unstake(uint256)',
  'function claimRewards()',
  'function claimFees()',
  'function getCurrentCycle() view returns (uint256)',
  'function currentCycleReward() view returns (uint256)',
  'function currentCycle() view returns (uint256)',
  'function lastStartedCycle() view returns (uint256)',
  'function currentStartedCycle() view returns (uint256)',
  'function previousStartedCycle() view returns (uint256)',
  'function accRewards(address) view returns (uint256)',
  'function accAccruedFees(address) view returns (uint256)',
  'function accWithdrawableStake(address) view returns (uint256)',
  'function accFirstStake(address) view returns (uint256)',
  'function accSecondStake(address) view returns (uint256)',
  'function accStakeCycle(address,uint256) view returns (uint256)',
  'function accCycleBatchesBurned(address) view returns (uint256)',
  'function lastActiveCycle(address) view returns (uint256)',
  'function lastFeeUpdateCycle(address) view returns (uint256)',
  'function pendingStake() view returns (uint256)',
  'function summedCycleStakes(uint256) view returns (uint256)',
  'function rewardPerCycle(uint256) view returns (uint256)',
  'function cycleTotalBatchesBurned(uint256) view returns (uint256)',
  'function cycleFeesPerStakeSummed(uint256) view returns (uint256)',
  'function cycleAccruedFees(uint256) view returns (uint256)',
  'function totalNumberOfBatchesBurned() view returns (uint256)',
  'function i_initialTimestamp() view returns (uint256)',
  'function i_periodDuration() view returns (uint256)',
];

export const MIGRATION_ABI = [
  'function swap(uint256)',
  'function totalSwapped() view returns (uint256)',
  'function deadline() view returns (uint256)',
  'function active() view returns (bool)',
];

export const DUAL_MIGRATION_ABI = [
  'function swapV1(uint256)',
  'function swapV2(uint256)',
  'function totalSwappedV1() view returns (uint256)',
  'function totalSwappedV2() view returns (uint256)',
  'function deadline() view returns (uint256)',
  'function active() view returns (bool)',
];

export const OLD_DBXEN_ABI = [
  'function totalNumberOfBatchesBurned() view returns (uint256)',
];
