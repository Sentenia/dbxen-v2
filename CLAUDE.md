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
- src/components/WaveBackground.jsx — procedural animated background (flag/fabric sim, rAF-driven)
- src/components/TipJar.jsx — community donate "chest" in the nav (native + USDC/USDT, multichain)
- src/components/EasterEggs.jsx + src/utils/eggs.js — hidden eggs + a window-event bus
- src/utils/price.js — DexScreener prices + on-chain DXNv2 price read

## Key facts
- NXD is Ethereum mainnet only
- DBXen works on 8 chains
- NXDStakingVault uses deposit(pid,amount) / withdraw(pid,amount,bool) / withdrawCooldown(pid) — NOT stake/unstake
- Claim ETH rewards = deposit(0, 0)
- Pool ID is always 0
- "DXN Staked" = protocol accounting (summedCycleStakes − currentCycleReward + pendingStake), NOT the contract's token balance — they legitimately differ (rewards mint lazily on claim). This mirrors DBXen's own TVL.
- DXNv2/WETH has NO DexScreener pool; price is read on-chain from its Uniswap V3 1% pool (0x582B074e1016e8774D91dBF5c88E9859a6c7E7d8) in price.js
- Community donate chest sends to the DXN community wallet 0x0A946dB17243332C9754C6c59B31A67201F337c6; the fill bar sums that wallet's balance across all chains
- The background's storm/billow, the cursor "presence", and the easter eggs (Konami code, typed words like gm/wagmi/lfg, chest coin spills, console message) are INTENTIONAL — don't "fix" them as bugs

## Rules
- npm run build must pass before committing
- One task per commit
- Don't break existing DBXen functionality
