# Potake

Potake is an automated staking policy agent for Polkadot. You set rules once — minimum validator uptime, maximum stake concentration, maximum nominations — and the agent enforces them every era, re-nominating automatically if any rule is broken. Every action is written on-chain so anyone can verify what the agent did and why, without trusting the operator.

Built on **Portaldot V3** (pallet-revive / PolkaVM) · Portaldot Hacker House 2026 · Node Operations & Tooling track

---

## The Problem

Polkadot staking is entirely manual. When you nominate validators, you pick a set by hand. If a validator goes offline, gets slashed, or becomes over-subscribed, nothing happens automatically — you have to monitor every era (~6 hours) and re-nominate yourself. According to the [Polkadot Wiki on Nomination](https://wiki.polkadot.network/docs/learn-nominator), nominators are expected to actively monitor their validators and update nominations when performance degrades. In practice, most stakers set nominations once and forget, which leads to missed rewards, slash exposure, and stake concentrating on a handful of popular validators — weakening network decentralisation ([Web3 Foundation research on NPoS](https://research.web3.foundation/Polkadot/protocols/NPoS)).

The second problem is on the builder side. On **Portaldot V3**, Solidity contracts running in PolkaVM cannot read staking data at all. There are no EVM precompiles for validators, eras, or rewards — a chain inspection confirmed only Assets and Vesting precompiles exist. This means builders cannot create staking-aware DeFi apps on Polkadot's EVM layer, and stakers have no verifiable on-chain record of why their nominations changed.

---

## The Solution

Potake solves both problems. It bridges staking data from Substrate into EVM contracts via a relayer-fed `StakingOracle`, and it automates nomination management via a `PolicyRegistry` that stores user-defined rules on-chain. A policy agent reads the oracle and the policy every era, evaluates the managed account's current nominations against the rules, and re-nominates if any rule is broken. The extrinsic hash, the before/after nomination sets, and the rule that triggered the action are all logged in an immutable on-chain record — `registry.actionCount(stakingKey)` is publicly queryable proof that the agent acted autonomously.

---

## How It Works — End to End

| Phase | What happens |
|-------|-------------|
| **1. Deploy** | `StakingOracle`, `PolicyRegistry`, `GatedVault` deployed to Portaldot V3 via `revive.instantiateWithCode` |
| **2. Set policy** | User opens Policy page → sets minUptime, maxShare, maxValidators → signs EVM tx → `PolicyRegistry.setPolicy()` stores rules on-chain |
| **3. Bond funds** | User opens Vault page → bonds tPOT on Substrate so the account can nominate |
| **4. Relayer** | Every era: reads `erasStakers` + `session.validators` from Substrate → calls `oracle.publish(era, validators, stakes)` |
| **5. Agent evaluates** | Reads oracle snapshot + policy rules + current nominations → checks 3 rules |
| **6. Agent acts** | On any violation: auto-bonds if needed → submits `staking.nominate(compliantSet)` → calls `registry.logAction(...)` |
| **7. Audit** | `registry.actionCount(key)` and `registry.actions(key, i)` give full immutable history: era, rule broken, extrinsic hash, before/after nomination sets |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Browser (Next.js 14)                         │
│                                                                        │
│   Landing page  ──►  Dashboard                                         │
│                        ├── Oracle page  (live validator data,          │
│                        │                 agent action counter)         │
│                        ├── Policy page  (set staking rules on-chain)   │
│                        └── Vault page   (bond / unbond / withdraw)     │
│                                                                        │
│   WalletButton (RainbowKit)  ──  wagmi v2  ──  ethers v6               │
│   WorldCanvas (Three.js 3D)  visible on every dashboard page           │
└────────────────────────────┬─────────────────────────────────────────┘
                             │ EVM transactions + eth_call
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  Portaldot V3 — EVM layer (pallet-revive / PolkaVM)   │
│                                                                        │
│  ┌─────────────────────┐   ┌──────────────────────────────────────┐  │
│  │   StakingOracle.sol  │   │          PolicyRegistry.sol           │  │
│  │                      │   │                                       │  │
│  │  snapshot()          │   │  setPolicy(...)                       │  │
│  │  validatorIds()      │   │  policies(owner)  → rules             │  │
│  │  validatorInfo(id)   │   │  logAction(...)   → append-only log   │  │
│  │  isHealthy(id, bps)  │   │  actionCount(key) → on-chain proof    │  │
│  │  stakeShareBps(id)   │   │  actions(key, i)  → full audit trail  │  │
│  └──────────┬───────────┘   └──────────────────────────────────────┘  │
│             │ IStakingView                                              │
│  ┌──────────▼───────────┐                                              │
│  │     GatedVault.sol   │  ← demo: deposit only if validator healthy   │
│  └──────────────────────┘                                              │
└──────────┬──────────────────────────────────┬───────────────────────-┘
           │ eth_call / eth_sendTransaction    │ eth_call / logAction
           ▼                                   ▼
┌──────────────────────┐       ┌──────────────────────────────────────┐
│  Relayer (Node.js)    │       │         Agent (Node.js)               │
│                       │       │                                       │
│  Every era:           │       │  Every era:                           │
│  1. query Substrate   │       │  1. reads oracle snapshot             │
│  2. publish to oracle │       │  2. reads policy rules                │
│                       │       │  3. reads current nominations         │
│                       │       │  4. evaluates 3 rules                 │
│                       │       │  5. if violated:                      │
│                       │       │     a. bond (if not bonded)           │
│                       │       │     b. staking.nominate(compliantSet) │
│                       │       │     c. registry.logAction(...)        │
└──────────┬────────────┘       └──────────────────┬───────────────────┘
           │                                        │
           │ query erasStakers, session.validators  │ extrinsic: staking.nominate
           ▼                                        ▼
┌──────────────────────────────────────────────────────────────────────┐
│               Portaldot V3 — Substrate layer (pallet-staking)         │
│                                                                        │
│  erasStakers  ·  session.validators  ·  staking.nominators             │
│  staking.bond  ·  staking.nominate                                     │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Sequence Diagram

```mermaid
sequenceDiagram
    participant U as User (Browser)
    participant OR as StakingOracle (EVM)
    participant RG as PolicyRegistry (EVM)
    participant GV as GatedVault (EVM)
    participant Rel as Relayer (Node.js)
    participant Agt as Agent (Node.js)
    participant Sub as Substrate (pallet-staking)

    Note over Rel,Sub: Every era (~6h on mainnet)
    Rel->>Sub: query erasStakers + session.validators
    Sub-->>Rel: validator list + per-validator stake
    Rel->>OR: oracle.publish(era, validators[], stakes[])
    OR-->>Rel: SnapshotPublished event emitted

    Note over U,RG: One-time user setup
    U->>RG: setPolicy(minUptimeBps, maxShareBps, maxValidators, stakingAccount)
    RG-->>U: PolicySet event — rules stored on-chain

    Note over U,Sub: User bonds funds (Vault page)
    U->>Sub: staking.bond(amount, 'Staked')
    Sub-->>U: bond confirmed

    Note over U,GV: Optional — GatedVault demo
    U->>GV: deposit(validatorId)
    GV->>OR: isHealthy(validatorId, minUptimeBps)
    OR-->>GV: true / false
    alt Validator healthy
        GV-->>U: deposit accepted
    else Validator unhealthy
        GV-->>U: revert ValidatorUnhealthy
    end

    Note over Agt,Sub: Every era — agent loop
    Agt->>OR: snapshot(), validatorIds(), validatorInfo(id)
    OR-->>Agt: era, validator list with stake + uptime
    Agt->>RG: policies(ownerEVM)
    RG-->>Agt: policy rules
    Agt->>Sub: staking.nominators(ss58)
    Sub-->>Agt: current nominations (may be empty)

    alt Rules violated OR nominations empty
        opt Account not bonded
            Agt->>Sub: staking.bond(max(minNominatorBond, existentialDeposit), 'Staked')
            Sub-->>Agt: bond finalized
        end
        Agt->>Sub: staking.nominate(compliantValidatorSet)
        Sub-->>Agt: extrinsicHash
        Agt->>RG: logAction(ownerEVM, era, policyVersion, ruleBroken, extHash, fromSetHash, toSetHash)
        RG-->>Agt: ActionLogged event emitted
    else All rules satisfied
        Agt->>Agt: no action needed
    end

    Note over U,RG: Audit — anytime, by anyone
    U->>RG: actionCount(stakingAccountBytes32)
    RG-->>U: N — on-chain proof of autonomous agent activity
    U->>RG: actions(stakingAccountBytes32, index)
    RG-->>U: Action { era, ruleBroken, extrinsicHash, fromSetHash, toSetHash, loggedAt }
```

---

## Smart Contracts

### `IStakingView` — Stable Read Interface

The consumer-facing interface. All contracts that need staking data depend only on this. If Portaldot V3 ever ships a native staking precompile, a new implementation swaps in behind this interface without changing any consumer.

```solidity
interface IStakingView {
    struct Snapshot {
        uint32  era;
        uint64  relayedAt;
        uint16  validatorCount;
        bytes32 validatorSetHash;
        uint256 totalStake;       // network-wide, 14 decimals
        uint256 eraReward;
    }
    struct ValidatorInfo {
        uint128 totalStake;
        uint16  commissionBps;
        uint16  uptimeBps;
        bool    active;
    }
    function snapshot()                                         external view returns (Snapshot memory);
    function validatorIds()                                     external view returns (bytes32[] memory);
    function validatorInfo(bytes32 validator)                   external view returns (ValidatorInfo memory);
    function isHealthy(bytes32 validator, uint16 minUptimeBps) external view returns (bool);
    function stakeShareBps(bytes32 validator)                   external view returns (uint16);
}
```

### `StakingOracle`

Holds the latest per-era validator snapshot published by the relayer. Only one snapshot is stored — overwritten each era — and history lives in events. This avoids unbounded storage deposit growth under Revive.

| Function | Caller | Purpose |
|----------|--------|---------|
| `publish(era, ids[], stakes[], commissions[], uptimes[], actives[])` | relayer | Overwrites snapshot; emits `SnapshotPublished` |
| `snapshot()` | anyone | Latest `Snapshot` struct |
| `validatorIds()` | anyone | All listed validator `AccountId32`s as `bytes32[]` |
| `isHealthy(id, bps)` | GatedVault, agent | True if validator is active and uptime ≥ threshold |
| `stakeShareBps(id)` | agent | Validator's share of total stake in basis points |

### `PolicyRegistry`

Stores each user's staking policy and an append-only log of every action the agent takes.

**Policy fields:** `stakingAccount` (Substrate AccountId32 as bytes32), `maxShareBps`, `minUptimeBps`, `maxValidators`, `version` (auto-increments), `active`

**Action log fields:** `era`, `policyVersion`, `ruleBroken`, `extrinsicHash` (Substrate nominate tx), `fromSetHash`, `toSetHash`, `loggedAt`

| Function | Caller | Purpose |
|----------|--------|---------|
| `setPolicy(stakingAccount, maxShareBps, minUptimeBps, maxValidators)` | user | Stores rules on-chain; increments version |
| `logAction(owner, era, version, rule, extHash, fromHash, toHash)` | agent | Appends immutable action record |
| `actionCount(stakingAccount)` | anyone | Number of agent actions — **on-chain proof** |
| `actions(stakingAccount, index)` | anyone | Full action detail by index |

### `GatedVault` — Demo Consumer

Shows any EVM contract can compose with `IStakingView`. Accepts a deposit earmarked for a validator only if `oracle.isHealthy(validatorId, minUptimeBps)` returns true — rejects with `ValidatorUnhealthy` otherwise. A lending protocol, liquid staking vault, or yield optimizer could use the same pattern.

---

## Frontend

Built with Next.js 14 App Router, wagmi v2, RainbowKit, ethers v6, Three.js.

### Policy Page

Where users define their staking rules on-chain. Set `minUptimeBps` (minimum validator uptime, e.g. `9500` = 95%), `maxShareBps` (max stake concentration on one validator, e.g. `5000` = 50%), and `maxValidators` (nomination cap). Submitting calls `registry.setPolicy(...)` — an EVM transaction stored permanently under the user's address. The agent reads this every era and acts strictly within its constraints. The user, not the agent, defines what "compliant" means.

### Vault Page

Where users manage the bonded funds backing their staking policy. Shows bonded balance, free balance, and current staking status. Actions: **Bond more** (lock additional funds), **Unbond** (start the unbonding period), **Withdraw** (claim after unbonding), **Rebond** (cancel an unbond). The agent's `staking.nominate` only works if funds are bonded — on first run the agent auto-bonds `max(minNominatorBond, existentialDeposit)` if the account has never bonded before.

### Oracle Page

Live view of the oracle snapshot: current era, total stake, each validator with uptime and commission. The **Agent Nominations** counter polls `registry.actionCount(stakingKey)` every 15 seconds — this is a publicly verifiable, on-chain count of how many times the agent acted autonomously, independent of anything the frontend claims.

### WorldCanvas

A Three.js 3D scene rendered on every dashboard page — a LatheGeometry pot, CylinderGeometry validator pillars that grow with stake, and an agent sphere. Visual representation of the staking world the agent manages.

---

## Deployed Contracts (Portaldot V3 Testnet)

| Contract | Address |
|----------|---------|
| **StakingOracle** | `0x0bfB6f131A99D5aaA3071618FFBD5bb3ea87C619` |
| **PolicyRegistry** | `0x68283AAa8899A4aA299141ca6f04dF8e5802509f` |

> **Chain ID:** `420420777` · **EVM RPC:** `https://test-evm-rpc-v3.portaldot.dev` · **Substrate WS:** `wss://test-node-v3.portaldot.dev`

**Live activity on testnet:**
- Oracle: ERA 55, 2 validators, ~2.02 × 10¹⁸ planck total stake
- Policy active for `0x588F6b3169F60176c1143f8BaB47bCf3DeEbECdc` (v5: minUptime=9500, maxShare=5000, maxValidators=16)
- Agent bonded 10,000,000,000,000 planck and nominated 2 validators
- `actionCount` = 1 — verifiable on-chain, block `197667`

---

## Policy Rules

| Constant | Value | Meaning |
|----------|-------|---------|
| *(Rule 0)* | — | Zero nominations always triggers a violation |
| `RULE_MAX_SHARE` | `1` | No single nominated validator holds more than `maxShareBps` of total stake |
| `RULE_MIN_UPTIME` | `2` | Every nominated validator must have `uptimeBps ≥ minUptimeBps` |
| `RULE_MAX_VALIDATORS` | `3` | Total nominations must not exceed `maxValidators` |

Basis points: `10000 bps = 100%`. Example: `9500` = 95% uptime required.

---

## Key Design Decisions

**No staking precompile.** Portaldot V3 has no EVM precompile for staking data. The relayer bridges this by reading `erasStakers` on Substrate and writing it into `StakingOracle` via EVM transaction. Consumers only see `IStakingView` — if a native precompile ships later, only the implementation swaps.

**Latest-slot oracle storage.** The oracle overwrites one fixed snapshot per era; history lives in events. Append-only would grow storage slots every era, and Revive charges a deposit per slot.

**EVM bytecode deployment.** Contracts are deployed via `revive.instantiateWithCode` Substrate extrinsic. EVM bytecode with `allowEVMBytecode: true` costs ~238 tPOT storage deposit vs ~1,645 tPOT for PolkaVM bytecode — a 7× saving.

**Dynamic gas estimation.** Revive's `eth_estimateGas` returns Substrate weight units, not EVM gas. All contract calls run `provider.estimateGas()` and pass the result directly as `gasLimit`. Gas limits are never hard-coded.

**SS58 / EVM address split.** The policy is owned by an EVM address. The bonded stake lives on a separate Substrate SS58 account. The agent resolves both from config and from `policy.stakingAccount` stored in the registry.

**Auto-bond on first nomination.** If the staking account has no bond, the agent queries `minNominatorBond` and `existentialDeposit` from the chain and bonds `max(minBond, ed)` before nominating — a fresh funded account needs zero manual setup.

---

## Quick Start

```bash
cd backend && npm install
cp .env.example .env
# Fill: RELAYER_PRIVATE_KEY, ORACLE_ADDRESS, REGISTRY_ADDRESS,
#       MANAGED_ACCOUNTS, STAKING_ACCOUNT_SS58

npm test                                          # 28 unit tests

node src/index.mjs relay                          # start relayer
node src/index.mjs agent <keystore.json>          # run agent

cd ../frontend && npm install && npm run dev      # http://localhost:3000
```

---

## Project Structure

```
Potake/
├── backend/
│   ├── contracts/
│   │   ├── IStakingView.sol         read interface
│   │   ├── StakingOracle.sol        per-era validator snapshot
│   │   ├── PolicyRegistry.sol       user rules + action log
│   │   └── GatedVault.sol           demo IStakingView consumer
│   └── src/
│       ├── index.mjs                CLI entry (relay / agent / status)
│       ├── config.mjs               env vars
│       ├── chain/
│       │   ├── substrate.mjs        @polkadot/api connection
│       │   └── evm.mjs              ethers provider + contract factories
│       ├── relayer/                 Substrate → oracle publish loop
│       └── agent/
│           ├── index.mjs            orchestrator
│           ├── evaluate.mjs         rule evaluation + suggestion set
│           └── nominate.mjs         bond + nominate + logAction
└── frontend/
    ├── app/
    │   ├── page.tsx                 landing page
    │   └── (dashboard)/
    │       ├── layout.tsx           shared shell + 3D WorldCanvas
    │       ├── DashboardContext.tsx shared state (address, policy, snapshot)
    │       ├── oracle/page.tsx      live oracle + agent counter
    │       ├── policy/page.tsx      set staking policy
    │       └── vault/page.tsx       bond / unbond / withdraw
    └── components/
        ├── WorldCanvas.tsx          Three.js 3D scene
        ├── WalletButton.tsx         RainbowKit custom button
        ├── Providers.tsx            wagmi + RainbowKit providers
        └── TxLink.tsx               clickable tx hash chip
```

---

## Limits & Trust Model

The agent is a trusted off-chain service. The registry records what it did — it cannot force the agent to follow the policy. The registry does not prove the EVM address controls the Substrate staking account; that link is asserted by the user. The testnet has very few validators, so rules demonstrate guardrails and produce an audit trail but cannot optimise stake at scale. Uptime is currently hardcoded at 100% in oracle data; ImOnline-based uptime is a planned improvement.

---

## Third-party Software

Hardhat (MIT) · ethers.js v6 (MIT) · `@polkadot/api` v16 (Apache-2.0) · `@parity/resolc` v1.4.0 (Apache-2.0) · `@rainbow-me/rainbowkit` v2 (MIT) · wagmi v2 (MIT) · viem v2 (MIT) · Next.js 14 (MIT) · Three.js (MIT) · `@tanstack/react-query` v5 (MIT) · dotenv (BSD-2-Clause)

## License

MIT
