# DBXen V2

**Fixed fork of the exploited DBXen protocol on Ethereum.**

Burn XEN. Earn DXN. Stake for fees. Fully immutable — no admin keys.

## What happened

On March 12, 2026, the original DBXen staking contract was exploited for 65.28 ETH (~$150K). The attacker used two compounding bugs: an ERC2771 sender-spoofing vulnerability and a fresh-address fee backdating bug.

## What's fixed

- **ERC2771 removed entirely** — no `_msgSender()`, no trusted forwarder, all functions use `msg.sender` directly
- **Fresh-address backdating patched** — new addresses only earn fees from the cycle they first interact, not retroactively from cycle 0
- **Lock mechanism** — owner powers permanently renounced after configuration. Protocol is fully immutable.

## Live contracts (Ethereum Mainnet)

| Contract | Address |
|---|---|
| DBXenV2 | [`0x61614137edE60C65458F76a51D6431052EBE03D0`](https://etherscan.io/address/0x61614137edE60C65458F76a51D6431052EBE03D0) |
| DXNv2 Token | [`0x1b08d317963cc65932f3f79f00987b2e23df52ab`](https://etherscan.io/address/0x1b08d317963cc65932f3f79f00987b2e23df52ab) |
| DXN Migration | [`0x93bc54186656DC17C300fd5F6C464c0F75965a71`](https://etherscan.io/address/0x93bc54186656DC17C300fd5F6C464c0F75965a71) |

All contracts verified on Etherscan. Owner is `address(0)` — nobody controls the protocol.

## Migration

Holders of original DXN can swap 1:1 for DXNv2 through the migration bridge. Old DXN is sent to the burn address (`0xdead`). The swap is irreversible.

## App

**[dbxen-v2.vercel.app](https://dbxen-v2.vercel.app)**

- Burn XEN to earn DXNv2 rewards
- Stake DXNv2 to earn ETH protocol fees
- Migrate old DXN → DXNv2
- Live cycle activity dashboard

## Community

- [Telegram](https://t.me/DBXenV2)
- [X / Twitter](https://x.com/DBXen_crypto)
- [Litepaper](https://dbxen.gitbook.io/dbxen-litepaper)

## Audit

Three rounds of auditing with zero critical/high issues remaining. Source code is fully verified on Etherscan for independent review.
