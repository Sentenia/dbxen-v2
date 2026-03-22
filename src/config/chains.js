export const CHAINS = {
  ethereum: {
    name: 'Ethereum', chainId: '0x1', color: '#627EEA', native: 'ETH',
    explorer: 'https://etherscan.io', rpc: 'https://rpc.ankr.com/eth',
    xenSym: 'XEN', dxnSym: 'DXN', minFee: 0n,
    oldDbxenV1: '0xF5c80c305803280B587F8cabBcCdC4d9BF522AbD',
    contracts: {
      XEN: '0x06450dEe7FD2Fb8E39061434BAbCFC05599a6Fb8',
      DBXEN_V2: '0x61614137edE60C65458F76a51D6431052EBE03D0',
      DXN_V2: '0x1b08d317963cc65932f3f79f00987b2e23df52ab',
      OLD_DXN: '0x80f0C1c49891dcFDD40b6e0F960F84E6042bcB6F',
      MIGRATION: '0x93bc54186656DC17C300fd5F6C464c0F75965a71',
    },
  },
  optimism: {
    name: 'Optimism', chainId: '0xa', color: '#FF0420', native: 'ETH',
    explorer: 'https://optimistic.etherscan.io', rpc: 'https://mainnet.optimism.io',
    xenSym: 'opXEN', dxnSym: 'opDXN', minFee: 100000000000000n,
    oldDbxenV1: '0x2A9C55b6Dc56da178f9f9a566F1161237b73Ba66',
    contracts: {
      XEN: '0xeB585163DEbB1E637c6D617de3bEF99347cd75c8',
      DBXEN_V2: '0x95202A555171458dA4a48be3b4C290eF832e38b2',
      DXN_V2: '0x90386DA49028ef1eF18F47f0a740cAAB50782576',
      OLD_DXN: '0xc418B123885d732ED042b16e12e259741863F723',
      MIGRATION: '0x6B7653f208888f978936c603FF52c98e216F481F',
    },
    addChain: { chainId: '0xa', chainName: 'OP Mainnet', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://mainnet.optimism.io'], blockExplorerUrls: ['https://optimistic.etherscan.io'] },
  },
  base: {
    name: 'Base', chainId: '0x2105', color: '#0052FF', native: 'ETH',
    explorer: 'https://basescan.org', rpc: 'https://mainnet.base.org',
    xenSym: 'cbXEN', dxnSym: 'cbDXN', minFee: 100000000000000n,
    oldDbxenV1: '0x30782c020FE90614f08a863B41CbB07A2D2D94fF',
    contracts: {
      XEN: '0xffcbF84650cE02DaFE96926B37a0ac5E34932fa5',
      DBXEN_V2: '0xc29543685Df582Da1cbF914e92F60c1110269cD6',
      DXN_V2: '0x3D4b9FFEE87FF2AFbf7f5731a8a47BA5a6D444Ef',
      OLD_DXN: '0x9430A7e6283Fb704Fd1D9302868Bc39d16FE82Ba',
      MIGRATION: '0x6054A1dBC14bd1b1653727f3E4690DB4174d8F0c',
    },
    addChain: { chainId: '0x2105', chainName: 'Base', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://mainnet.base.org'], blockExplorerUrls: ['https://basescan.org'] },
  },
  pulsechain: {
    name: 'PulseChain', chainId: '0x171', color: '#00FF00', native: 'PLS',
    explorer: 'https://scan.pulsechain.com', rpc: 'https://rpc.pulsechain.com',
    xenSym: 'pXEN', dxnSym: 'pDXN', minFee: 1000000000000000000000n,
    oldDbxenV1: '0x6d38Ab9f5b5Edfb22e57a44c3c747f9584de1f1a',
    batchSize: 250000000n,
    contracts: {
      XEN: '0x8a7FDcA264e87b6da72D000f22186B4403081A2a',
      DBXEN_V2: '0x6054A1dBC14bd1b1653727f3E4690DB4174d8F0c',
      DXN_V2: '0xfe7714618a8cceD29788aa6D490BBF7c5522aA77',
      OLD_DXN: '0x6fE0ae3D5c993a3073333134db70613B0cb88a31',
      MIGRATION: '0x3b093387654674873ddf51E4A8c509714a21932a',
    },
    legacy: {
      DBXEN_V2: '0x61614137edE60C65458F76a51D6431052EBE03D0',
      DXN_V2: '0x1B08d317963CC65932F3f79F00987B2E23df52Ab',
      MIGRATION: '0x302c1c777FC144492E29148b4F2a95466e06d970',
    },
    dualMigration: true,
    addChain: { chainId: '0x171', chainName: 'PulseChain', nativeCurrency: { name: 'Pulse', symbol: 'PLS', decimals: 18 }, rpcUrls: ['https://rpc.pulsechain.com'], blockExplorerUrls: ['https://scan.pulsechain.com'] },
  },
  avalanche: {
    name: 'Avalanche', chainId: '0xa86a', color: '#E84142', native: 'AVAX',
    explorer: 'https://snowtrace.io', rpc: 'https://rpc.ankr.com/avalanche',
    xenSym: 'aXEN', dxnSym: 'aDXN', minFee: 1000000000000000n,
    oldDbxenV1: '0xF5c80c305803280B587F8cabBcCdC4d9BF522AbD',
    contracts: {
      XEN: '0xC0C5AA69Dbe4d6DDdfBc89c0957686ec60F24389',
      DBXEN_V2: '0x61614137edE60C65458F76a51D6431052EBE03D0',
      DXN_V2: '0x1B08d317963CC65932F3f79F00987B2E23df52Ab',
      OLD_DXN: '0x80f0C1c49891dcFDD40b6e0F960F84E6042bcB6F',
      MIGRATION: '0x302c1c777FC144492E29148b4F2a95466e06d970',
    },
    addChain: { chainId: '0xa86a', chainName: 'Avalanche C-Chain', nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 }, rpcUrls: ['https://rpc.ankr.com/avalanche'], blockExplorerUrls: ['https://snowtrace.io'] },
  },
  polygon: {
    name: 'Polygon', chainId: '0x89', color: '#8247E5', native: 'POL',
    explorer: 'https://polygonscan.com', rpc: 'https://polygon-rpc.com',
    xenSym: 'mXEN', dxnSym: 'mDXN', minFee: 100000000000000n,
    oldDbxenV1: '0x4f3ce26d9749c0f36012c9abb41bf9938476c462',
    contracts: {
      XEN: '0x2AB0e9e4eE70FFf1fB9D67031E44F6410170d00e',
      DBXEN_V2: '0x61614137edE60C65458F76a51D6431052EBE03D0',
      DXN_V2: '0x1B08d317963CC65932F3f79F00987B2E23df52Ab',
      OLD_DXN: '0x47DD60FA40A050c0677dE19921Eb4cc512947729',
      MIGRATION: '0x11efcFFa9AD422C52e8b668708DEC6F5ce645324',
    },
    addChain: { chainId: '0x89', chainName: 'Polygon', nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 }, rpcUrls: ['https://polygon-rpc.com'], blockExplorerUrls: ['https://polygonscan.com'] },
  },
};

export function detectChainKey(hexId) {
  const match = Object.entries(CHAINS).find(([, c]) => c.chainId.toLowerCase() === hexId.toLowerCase());
  return match ? match[0] : null;
}

export function getBatchSize(chain) {
  return (chain.batchSize || 2500000n) * (10n ** 18n);
}

export function getBatchDisplay(chain) {
  return Number(chain.batchSize || 2500000n);
}
