// Shared config for the community donate chest — used by TipJar (donate UI) and
// the donor scoreboard (reads donation history back off-chain via explorer APIs).
export const JAR_ADDRESS = '0x0A946dB17243332C9754C6c59B31A67201F337c6'; // DXN community wallet

// Per-chain stablecoins — addresses + decimals VERIFIED on-chain (BNB's are 18-dec).
// Chains not listed (EthereumPoW, PulseChain) are native-only.
export const STABLES = {
  ethereum:  { USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },  USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 } },
  polygon:   { USDC: { address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6 },  USDT: { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 } },
  bsc:       { USDC: { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 }, USDT: { address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 } },
  avalanche: { USDC: { address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', decimals: 6 },  USDT: { address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', decimals: 6 } },
  base:      { USDC: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },  USDT: { address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6 } },
  optimism:  { USDC: { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6 },  USDT: { address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6 } },
};
// transfer() declared without a return value so it also works for USDT-style tokens.
export const STABLE_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address,uint256)',
];
