# SevenRise (SVR) — DYOR Minter Deployment Preparation

Status: PREPARATION ONLY. No Mainnet transaction has been submitted and no Jetton master address exists yet.

## Canonical token configuration

- Project: SevenRise
- Jetton name: SevenRise
- Symbol: SVR
- Network: TON Mainnet
- Decimals: 9
- Initial mint amount: 100,000,000 SVR
- Intended receiving/admin wallet: `UQAuXqWR5T-qdb2eXueyXEq-S1sBpuCLe6ukpqzKm9eLCQiJ`
- Logo: https://sevenrise.github.io/sevenriseV3/ton/svr-logo.svg
- Website: https://sevenrise.github.io/sevenriseV3/
- Telegram: https://t.me/SevenRiseSVRBot
- GitHub: https://github.com/sevenrise/sevenriseV3

## Official deployment route

Use DYOR Minter: https://dyor.io/minter

1. Open DYOR Minter and connect Tonkeeper.
2. Before entering token data, verify that the connected wallet is exactly the intended wallet above. Do not proceed if the address differs.
3. Upload the SevenRise logo (DYOR Minter currently requests a JPG/PNG image; use a 256x256 image under its size limit).
4. Enter the name, symbol, decimals, and initial mint amount exactly as listed above.
5. Add the official website, Telegram, and GitHub links above.
6. Review every field and the wallet transaction preview. Deploy only on TON Mainnet after funding the wallet with enough TON for the displayed fee and reserve.
7. Approve the transaction only in Tonkeeper. Never share a seed phrase or private key.
8. After confirmation, save the Jetton master address and transaction hash. Verify the token page on DYOR.io and inspect the contract on a TON explorer.
9. Decide whether to revoke mint/admin rights only after verifying the final supply and metadata. Revoking rights is a consequential, generally irreversible action; do not do it until the owner is certain no further minting or edits are needed.

## Trading readiness

Creating the Jetton does not itself create a market price or enable trading. A TON/token liquidity pool must be created on a DEX such as STON.fi or DeDust and funded with both assets. Liquidity is separate from deployment fees and remains exposed to market and impermanent-loss risk.

## Safety and release checklist

- [ ] Wallet connected in DYOR Minter matches the intended address.
- [ ] Wallet funded; exact fee checked in Tonkeeper.
- [ ] Mainnet network confirmed.
- [ ] Token parameters and official links reviewed.
- [ ] User personally approves the Mainnet transaction.
- [ ] Jetton master address and transaction hash recorded.
- [ ] DYOR.io token page verified.
- [ ] Any mint/admin rights decision made deliberately.
- [ ] Liquidity pool created and funded before announcing trading or a market price.

Never publish a price before there is real trading/liquidity data. Never claim the token is deployed or listed until the on-chain transaction and token page are verified.
