# SevenRise (SVR) — STON.fi launch preparation

**Status: PRE-LAUNCH.** This document prepares the launch path; it does not mean SVR has been deployed or listed.

## Token configuration
- Name: SevenRise
- Symbol: SVR
- Network: TON Mainnet (target)
- Planned supply: 100,000,000 SVR
- Decimals: 9
- Intended initial recipient: `UQAuXqWR5T-qdb2eXueyXEq-S1sBpuCLe6ukpqzKm9eLCQiJ`
- Metadata: https://sevenrise.github.io/sevenriseV3/ton/jetton-metadata.json
- Logo: https://sevenrise.github.io/sevenriseV3/ton/svr-logo.svg

## Required before a public STON.fi pool
1. Build and test the Jetton contract (the repository CI currently builds/tests the official Acton Jetton template).
2. Deploy the reviewed Jetton to TON Mainnet using the owner's wallet; the owner must review and sign the transaction in Tonkeeper.
3. Record and verify the resulting Jetton master address and confirm the minted supply and metadata.
4. Transfer the intended SVR allocation and TON liquidity funds to the liquidity-provider wallet.
5. Open https://app.ston.fi/pools, connect the wallet, choose TON and the exact SVR Jetton master address, enter both initial liquidity amounts, review the opening price and fees, then confirm in Tonkeeper.
6. Verify the pool and test a small swap. Publish the canonical pool link only after on-chain confirmation.
7. Submit the token logo/metadata to Tonkeeper's token-assets repository for wallet recognition. STON.fi does not itself verify tokens.

## Safety and status
- No Mainnet Jetton master address has been assigned yet.
- No Mainnet deployment or liquidity transaction has been submitted.
- Do not publish a pool URL or claim a market price until the pool exists on-chain.
- Never share a seed phrase or private key. All wallet transactions must be signed by the owner in their wallet.
- Pool creation requires both assets for initial liquidity and extra TON for network fees. The first deposit ratio determines the initial pool price.

## Official STON.fi guidance
- Listing guide: https://help.ston.fi/hc/en-us/articles/28370535096860-End-to-end-guide-list-a-token-on-STON-fi
- Create a pool: https://help.ston.fi/hc/en-us/articles/28370516226204-How-do-I-create-a-new-liquidity-pool-on-STON-fi
- Pool launch best practices: https://help.ston.fi/hc/en-us/articles/28370518278812-Best-practices-for-launching-a-new-pool
