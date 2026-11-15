# SevenRise (SVR) — TON Jetton deployment

## Approved deployment configuration

- Network: TON Mainnet (deployment must first be tested on TON Testnet)
- Token name: SevenRise
- Symbol: SVR
- Decimals: 9
- Initial supply: 100,000,000 SVR
- Initial supply in base units: 100000000000000000
- Jetton admin / initial recipient: UQAuXqWR5T-qdb2eXueyXEq-S1sBpuCLe6ukpqzKm9eLCQiJ

## Metadata

The metadata file is published at:

https://sevenrise.github.io/sevenriseV3/ton/jetton-metadata.json

## Important deployment requirements

1. Use a standard TON Jetton implementation (TEP-74 transfers and TEP-64 metadata).
2. Build and run the contract test suite before deployment.
3. Deploy to Testnet first and verify the master contract, metadata, admin address, and initial holder balance.
4. Deploy to Mainnet only after Testnet verification.
5. The owner wallet must connect through TON Connect and personally approve the deployment and mint transaction.
6. Never share a seed phrase or private key. No transaction is authorized by this repository change.

## Mainnet deployment is NOT yet completed

No Jetton master address exists until the deployment transaction is signed and confirmed on TON Mainnet. A market price also does not exist until a real DEX pool is created and funded with liquidity. Do not display a manually entered reference price as a live market quote.

## Initial supply calculation

With 9 decimals:

100,000,000 × 1,000,000,000 = 100000000000000000 base units.
