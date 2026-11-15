#!/usr/bin/env python3
"""Validate the public SevenRise TON deployment configuration.

This is a local/CI preflight only. It never connects to a wallet, signs,
broadcasts, or deploys a transaction.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
config = json.loads((ROOT / "deployment-config.json").read_text())
metadata = json.loads((ROOT / "jetton-metadata.json").read_text())

expected = {
    "project": "SevenRise",
    "name": "SevenRise",
    "symbol": "SVR",
    "network": "ton-mainnet",
    "decimals": 9,
    "initial_supply": "100000000",
    "initial_supply_base_units": "100000000000000000",
    "recipient_wallet": "UQAuXqWR5T-qdb2eXueyXEq-S1sBpuCLe6ukpqzKm9eLCQiJ",
}
for key, value in expected.items():
    if config.get(key) != value:
        raise SystemExit(f"FAIL: {key} expected {value!r}, got {config.get(key)!r}")

if metadata.get("name") != config["name"]:
    raise SystemExit("FAIL: metadata name does not match deployment config")
if metadata.get("symbol") != config["symbol"]:
    raise SystemExit("FAIL: metadata symbol does not match deployment config")
if str(metadata.get("decimals")) != str(config["decimals"]):
    raise SystemExit("FAIL: metadata decimals do not match deployment config")
if not metadata.get("image", "").startswith("https://"):
    raise SystemExit("FAIL: metadata image must use HTTPS")

wallet = config["recipient_wallet"]
if len(wallet) != 48 or not wallet.startswith("UQ"):
    raise SystemExit("FAIL: recipient wallet is not in the expected user-friendly TON format")

base_units = int(config["initial_supply"]) * (10 ** config["decimals"])
if str(base_units) != config["initial_supply_base_units"]:
    raise SystemExit("FAIL: initial supply base-unit calculation is incorrect")

print("PASS: SevenRise deployment configuration is internally consistent.")
print(f"Token: {config['name']} ({config['symbol']})")
print(f"Network target: {config['network']}")
print(f"Initial supply: {config['initial_supply']} {config['symbol']}")
print(f"Base units: {config['initial_supply_base_units']}")
print(f"Recipient: {wallet}")
print("NOTE: This does not verify wallet ownership/balance or deploy a token.")
print("NOTE: Final transaction details must be checked and approved in Tonkeeper.")
