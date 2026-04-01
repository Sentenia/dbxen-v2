# DBXen V2 UI

React/Vite frontend for DBXen V2 + NXD V2 protocols.
Deploys to dbxen-v2.vercel.app via Vercel from GitHub repo Sentenia/dbxen-v2.

## Stack
- React 18, Vite, ethers.js v6
- Recharts for charts
- react-hot-toast for notifications
- Lucide icons

## Structure
- src/config/chains.js — DBXen V2 multichain config (8 chains)
- src/config/nxd.js — NXD V2 contract addresses + ABIs (Ethereum only)
- src/hooks/WalletContext.jsx — wallet connection, chain switching, DBXen contract instances
- src/hooks/NXDContext.jsx — NXD protocol reads + writes, 30s auto-refresh
- src/components/ — DBXen UI components
- src/components/nxd/ — NXD UI components
- src/App.jsx — protocol mode toggle (dbxen | nxd), tab routing

## Key facts
- NXD is Ethereum mainnet only
- DBXen works on 8 chains
- NXDStakingVault uses deposit(pid,amount) / withdraw(pid,amount,bool) / withdrawCooldown(pid) — NOT stake/unstake
- Claim ETH rewards = deposit(0, 0)
- Pool ID is always 0

## Rules
- npm run build must pass before committing
- One task per commit
- Don't break existing DBXen functionality
