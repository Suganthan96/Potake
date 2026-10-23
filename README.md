# Potake

Staking bridge and policy agent for **Portaldot V3**. Built for the Portaldot Hacker House 2026 (Node Operations & Tooling track).

> **Status: implementation complete.** All phases A–D are built and unit-tested (28 tests pass). Testnet deployment pending node availability.

## Problem

On Portaldot V3, Solidity contracts cannot read staking data (validators, eras, rewards). A chain check found precompiles only for Assets and Vesting — none for staking or pools. Builders cannot make staking-aware apps, and stakers have no verifiable record of why their nominations changed.

## What Potake is

| Part | Status |
|---|---|
| `IStakingView`: read interface consumers depend on | written |
| `StakingOracle`: latest per-era snapshot, history in events | **written, unit-tested** |
| `PolicyRegistry`: user rules + append-only agent action log | **written, unit-tested** |
| `GatedVault`: demo consumer that checks oracle before deposits | **written, unit-tested** |
| Relayer: reads staking state each era, publishes to oracle | **built** (`potake relay`) |
| Policy agent: evaluates 3 rules, submits `nominate`, logs action | **built** (`potake agent`) |
| CLI: `potake status`, `potake relay`, `potake agent` | **built** |
| Deploy script: `revive.instantiateWithCode` with EVM bytecode | **built** (`npm run deploy:revive`) |

## Deployed contracts (Portaldot V3 testnet)

| Contract | Address | Deploy tx |
|---|---|---|
| StakingOracle | TBD | TBD |
| PolicyRegistry | TBD | TBD |
| GatedVault | TBD | TBD |

## Architecture

```
Substrate staking pallet
    ↓  erasStakers / session.validators
  Relayer (off-chain Node.js)
    ↓  revive.ethTransact → oracle.publish(era, validators, stakes)
  StakingOracle (EVM contract)
    ↓  IStakingView interface
  PolicyRegistry    GatedVault (demo)
    ↓  agent reads policy + oracle
  Policy Agent (off-chain Node.js)
    ↓  staking.nominate(targets)   registry.logAction(...)
  Substrate staking pallet       PolicyRegistry
```

## How the system runs

| Phase | When | What happens |
|---|---|---|
| **Setup** | once | Deploy contracts; set a policy (managed account, max share per validator, min uptime, max validators) |
| **Sync** | every era (~6 h) | Relayer reads validators, stakes, and publishes snapshot to oracle |
| **Evaluate** | every era | Agent reads policy + current nominations, checks 3 rules |
| **Act** | only on violation | Agent picks a compliant set, submits `staking.nominate` |
| **Audit** | after action | Agent logs era, rule broken, policy version, extrinsic hash, before/after sets in registry |

## Quick start

```bash
npm install
cp .env.example .env        # fill in DEPLOYER_PRIVATE_KEY and SUBSTRATE_WS

npm test                    # 28 unit tests (no network required)

# Deploy to Portaldot V3 testnet (needs tPOT on deployer's sr25519 account):
ACCOUNT_PASSWORD=<pw> npm run deploy:revive -- <keystore.json>
# → writes deployments.json; copy addresses to .env

# Start the relayer (polls every 30s, publishes each new era):
npm run relay

# Run the policy agent (evaluate, nominate if violated, log action):
npm run agent [keystore.json] [--dry-run]

# Check chain + oracle status:
npm run status
```

## Policy rules

| Rule | Constant | Meaning |
|---|---|---|
| `RULE_MAX_SHARE = 1` | 1 | No single nominated validator holds more than `maxShareBps` of total stake |
| `RULE_MIN_UPTIME = 2` | 2 | Every nominated validator must have `uptimeBps ≥ minUptimeBps` |
| `RULE_MAX_VALIDATORS = 3` | 3 | Total nominated validators must not exceed `maxValidators` |

## Key design decisions

- **Latest-slot storage.** Oracle overwrites one fixed snapshot per era and emits events for history — Revive storage deposits scale with storage slots, so append-only would cost too much.
- **Stable interface.** Consumers call `IStakingView`. If a native staking precompile appears, a new implementation swaps in behind it.
- **EVM bytecode deployment.** Portaldot V3 uses PolkaVM (not standard EVM). Deployment goes through `revive.instantiateWithCode` Substrate extrinsic (not `eth_sendRawTransaction`). Using EVM bytecode with `allowEVMBytecode: true` requires ~238 tPOT storage deposit vs ~1,645 tPOT for PolkaVM bytecode.
- **Dynamic gas estimation.** Revive's `eth_estimateGas` returns Substrate weight units (~3.37×10¹² for a simple transfer). All contract calls use `provider.estimateGas()` and pass the result directly as `gasLimit`.

## Limits

- The relayer and agent are **trusted**. The registry records what they did; it cannot force compliance.
- The registry does not prove the EVM owner controls the Substrate staking account.
- The testnet has very few validators; policies show guardrails and audit trail, not stake optimisation.
- Uptime is currently hardcoded to 100%; ImOnline-based uptime is a Phase F improvement.

## Third-party software

Hardhat (MIT), ethers.js v6 (MIT), `@polkadot/api` v16 (Apache-2.0), dotenv (BSD-2-Clause), `@parity/resolc` v1.4.0 (Apache-2.0).

## License

MIT
