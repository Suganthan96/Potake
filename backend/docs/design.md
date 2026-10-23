# Potake — Staking Bridge & Policy Agent for Portaldot V3

> **Track:** Node Operations & Tooling (automated staking) — Portaldot Hacker House 2026
> **Status:** Contracts written and unit-tested locally (18 tests). Relayer, agent and CLI in progress. Testnet deployment: [fill in address / tx hash / explorer link, or "not yet"]. Name "Potake": no conflict found in two searches, not confirmed.
> **Type:** Developer tool / infrastructure (not a consumer app)
> **Builder:** Sylesh R

**Source tags used below**
- `[Docs]` — official PortaldotV3 Testnet Guide (github.com/ItsCogumellum/portaldot-v3-testnet-guide) or the Hacker House page
- `[3P]` — claim from a third-party repo README (PortalIndex), not independently verified
- `[Live]` — result of a read-only chain check on Oct 22 (runtime 3002, reported to me, not run by me)
- `[?]` — unverified assumption; must be checked on-chain before building on it

---

## 1. One-line summary

Potake gives Portaldot V3 smart contracts a readable view of staking (era, validators, uptime, rewards), and runs an agent that keeps a staking account within user-defined rules and logs every action on-chain. The log is an audit trail, not enforcement.

## 2. Problem

1. Portaldot V3 runs EVM (Revive) and WASM (Contracts) contracts next to a Substrate staking system `[Docs: Hacker House page]`.
2. A Solidity contract cannot read or act on staking. `[Live]` The only precompile pallets found are Assets, AssetsPermit and Vesting; none for staking or pools. A precompile built into Revive itself would not show as a pallet, so this is not fully ruled out `[?]`. The official guide does not mention staking or precompiles at all.
3. Builders therefore cannot make staking-aware products on V3 (liquid staking, auto-staking vaults, DAO treasury staking).
4. Stakers must manage nominations by hand and get no verifiable record of why a stake moved.
5. There is no on-chain proof that an automated staker followed rules set by its owner.
6. Builder demand for this is **not yet validated**. The question of whether a native staking precompile is planned is open with the Portaldot team.

## 3. Solution

| Component | What it does |
|---|---|
| **Relayer** (TypeScript, polkadot-js) | Each era, reads staking state from the Substrate side and writes a compact snapshot to an EVM contract |
| **`IStakingView.sol`** | Stable read interface consumers depend on. If a native staking precompile appears, an implementation swaps in behind it and consumers do not change |
| **`StakingOracle.sol`** | Keeps the latest snapshot in fixed slots, overwritten each era (avoids growing Revive storage deposits). History goes to events |
| **`PolicyRegistry.sol`** | Stores user-defined staking rules (max share per validator, min uptime, max validators) and an append-only log of agent actions |
| **Policy agent** | Each era, checks managed accounts against their policy; if a rule is broken, submits a real `nominate` extrinsic and logs era, rule and tx hash. Holds only the nominator role of a nomination pool |
| **Demo consumer: `GatedVault.sol`** | Accepts deposits for a validator only if the oracle reports it healthy; proves another contract can use the data |
| **CLI** | `potake status`, `potake relay`, `potake agent` |
| **Dashboard (optional)** | Read-only: snapshots, compliance, and the action log with explorer links |

### Demo flow (3 minutes)
1. Set a policy: no more than 60% on any one validator.
2. Show an account with 100% on one validator, flagged as a broken rule.
3. Run the agent. It sends `nominate`, and the stake becomes 50/50 across the two testnet validators.
4. Show the action log with both tx hashes in the explorer, then the vault reading the oracle.

### Status (update before submitting)
- **Done:** four contracts, 18 local unit tests passing, deploy script, architecture diagram, README
- **Deployed:** [address / tx hash / explorer link for each contract, or "not yet"]
- **In progress:** relayer, agent, CLI [update]
- **Outstanding:** real `nominate` logged on-chain, demo video, optional dashboard, uptime rule from ImOnline events, pitch deck

### Roadmap
Uptime and reward rules, multiple managed accounts, read-only dashboard, a second consumer example, and a swap-in path for a native staking precompile.

### Why it is infrastructure, not an app
Other contracts and node operators consume it. The oracle and interface are the reusable part, and the CLI is how operators run it.

## 4. Architecture

```
                 Portaldot V3 testnet
   +-----------------------------------------------+
   |  Substrate side                EVM side (Revive) |
   |  staking / session /           StakingOracle.sol |
   |  imOnline / offences           PolicyRegistry.sol|
   |  nominationPools [?]           GatedVault.sol    |
   +--------^-------------------------^---------------+
            | WS: wss://test-node-v3   | EVM RPC: test-evm-rpc-v3
            | read state, send         | read/write contracts
            | nominate extrinsic       |
   +--------+-------------------------+---------------+
   |              Relayer + Agent (off-chain)          |
   |  1. detect era change                             |
   |  2. read validators, stake, uptime, rewards       |
   |  3. write snapshot -> StakingOracle               |
   |  4. evaluate policy (PolicyRegistry)              |
   |  5. if violated: staking.nominate(...)            |
   |  6. log action (era, rule, extrinsic hash)        |
   +---------------------------------------------------+
                         |
                  Dashboard (read-only)
```

## 5. Portaldot technology used

### 5.1 Endpoints and network `[Docs: Hacker House page]`
| Item | Value |
|---|---|
| Substrate WS | `wss://test-node-v3.portaldot.dev` |
| EVM RPC | `https://test-evm-rpc-v3.portaldot.dev` |
| Chain ID (EVM) | `420420777` |
| Node Explorer | `https://node-console.portaldot.dev/` |
| Token decimals | `14` (official guide lists `tPOTv3`; the guide's older endpoints are retired, use the ones above) |

### 5.2 Features used
| Portaldot feature | Use in Potake | Source |
|---|---|---|
| **Staking pallet** (bond / nominate, era and validator storage) | Agent reads validator set, stake, nominations; submits `nominate` | Node Explorer Network page shows staking info `[Docs]`; extrinsic and storage names `[?]` verify with metadata |
| **Session / era events** (`StakersElected`, `EraPaid`, `Rewarded`) | Triggers per-era snapshot; reward data | `[?]` reported in a prior chain check, confirm yourself |
| **ImOnline pallet** (`AllGood`, `SomeOffline`) | Uptime signal for policies | `[?]` |
| **Offences pallet** | Slash/offence signal (none reported so far) | `[Live]` 0 offence reports and 0 pending slashes on Oct 22 |
| **Revive pallet (EVM)** | Runs Solidity contracts | `[Docs]` |
| **EVM RPC + MetaMask/Hardhat/Remix** | Deploy and interact (Hardhat config uses solidity `0.8.24`, chain ID `420420777`) | `[Docs]` |
| **`reviveApi.accountId` / `address`** | Map EVM H160 <-> native SS58 (needed to fund the deployer's mapped account for gas) | `[Docs]`; also noted in `[3P]` PortalIndex |
| **`reviveApi.call` (dry-run)** and **`Revive.call` extrinsic** (`dest`, `value`, `weightLimit`, `storageDepositLimit`, `data`) | Optional: call contracts through the Substrate side (gas_limit and storage_deposit_limit from a dry-run) | `[Docs]` |
| **Node Explorer** (Accounts, Network, Developer pages) | Account creation, staking view, manual extrinsics, evidence links | `[Docs]` |
| **Assets pallet** | Not required. Optional later: a receipt token | `[Docs]` |

### 5.3 Explicitly NOT used
- WASM / ink! contracts (an ink! registry is a stretch goal, not promised)
- Cross-chain features
- Staking precompile (`[Live]` none found as a pallet; if one exists or is planned, the oracle's role shrinks, so ask the Portaldot team)
- Proxy-based custody (see Risks)

## 6. Contract design (superseded by the code in potake/contracts; kept for context)

### 6.1 `StakingOracle.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract StakingOracle {
    struct EraSnapshot {
        uint32  era;
        uint64  relayedAt;          // block timestamp when relayed
        uint16  validatorCount;
        bytes32 validatorSetHash;   // hash of the ordered validator list
        uint256 totalStake;         // 14-decimal units
        uint256 eraReward;
    }
    struct ValidatorInfo {
        uint256 totalStake;
        uint256 ownStake;
        uint16  commissionBps;
        uint16  uptimeBps;          // derived from ImOnline events over a window
        bool    active;
    }

    address public relayer;
    mapping(uint32 => EraSnapshot) public snapshots;
    mapping(uint32 => mapping(bytes32 => ValidatorInfo)) public validators; // key = AccountId32

    event SnapshotPublished(uint32 indexed era, bytes32 validatorSetHash, uint256 totalStake);
    event ValidatorUpdated(uint32 indexed era, bytes32 indexed validator, uint256 totalStake, uint16 uptimeBps);

    function publish(EraSnapshot calldata s, bytes32[] calldata ids, ValidatorInfo[] calldata infos) external;
    function latestEra() external view returns (uint32);
    function shareBps(uint32 era, bytes32 validator) external view returns (uint16);
}
```
Note: write only what policies need; large validator sets cost gas. Measure on testnet before choosing storage vs events-only.

### 6.2 `PolicyRegistry.sol`
```solidity
contract PolicyRegistry {
    struct Policy {
        bytes32 stakingAccount;   // AccountId32 managed by the agent
        uint16  maxShareBps;      // max stake share on any one validator
        uint16  minUptimeBps;     // min uptime for a nominated validator
        uint8   maxValidators;
        uint32  version;
        bool    active;
    }
    struct Action {
        uint32  era;
        uint32  policyVersion;
        uint8   ruleBroken;       // 1=maxShare, 2=minUptime, ...
        bytes32 extrinsicHash;    // Substrate nominate extrinsic
        bytes32 fromSetHash;
        bytes32 toSetHash;
    }

    mapping(address => Policy) public policies;       // owner (EVM) -> policy
    mapping(bytes32 => Action[]) public actionLog;    // stakingAccount -> actions

    event PolicySet(address indexed owner, bytes32 indexed stakingAccount, uint32 version);
    event ActionLogged(bytes32 indexed stakingAccount, uint32 era, uint8 ruleBroken, bytes32 extrinsicHash);

    function setPolicy(Policy calldata p) external;
    function logAction(bytes32 stakingAccount, Action calldata a) external; // onlyAgent
}
```
**Honest limitation:** the contract cannot prove the EVM owner controls the SS58 `stakingAccount` and cannot force the agent to comply. For the MVP, the agent only manages accounts the builder controls, and the registry is an audit trail, not enforcement. State this in the README.

### 6.3 `GatedVault.sol` (demo consumer)
Reads `StakingOracle.shareBps` / `uptimeBps` and reverts a `deposit` or `rebalance` call if the target validator fails a threshold. Its only purpose is to show a contract using oracle data.

## 7. Agent logic

```
on each finalized head:
  era = staking.activeEra
  if era > lastRelayedEra:
      snapshot = readStaking(era)          # validators, stakes, commission, rewards
      uptime   = deriveUptime(window)      # from ImOnline events (SomeOffline / AllGood)
      oracle.publish(snapshot, ...)
      for account in managedAccounts:
          nominated = staking.nominators(account).targets
          violations = evaluate(policy(account), snapshot, nominated)
          if violations:
              newTargets = pickCompliant(snapshot, policy)
              txHash = staking.nominate(newTargets)   # signed by agent key
              registry.logAction(account, era, rule, txHash, fromHash, toHash)
```
Rules (MVP): `maxShareBps`, `minUptimeBps`. Stretch: `maxValidators`, commission cap.

## 8. What is real vs simulated

| Piece | On testnet | Note |
|---|---|---|
| Era snapshots to oracle | Real | Every era (era length to be confirmed; a prior check reported 6 h) `[?]` |
| Contract deployments, policy set, action log | Real, with tx hashes | Evidence for check-in |
| `bond` / `nominate` by the agent | Real, on an account you control | Unbonding is long (reported ~168 days `[?]`); bond the minimum |
| Offence / slash handling | Simulated or local network | No offences reported on the V3 testnet `[?]`; label clearly |

## 9. Evidence checklist (maps to submission rules)

**Check-in (Oct 24, 12:00 UTC = 17:30 IST)**
- [ ] Public GitHub repo with complete README
- [ ] Architecture diagram
- [ ] Contract address and tx hash for the oracle and registry
- [ ] Explorer link(s)
- [ ] Demo video up to 3 min, or live demo, showing one core function
- [ ] Progress notes and outstanding items

**Final (Nov 6, 04:00 UTC = 09:30 IST)**
- [ ] README with deployment instructions, runnable code
- [ ] Demo video (real product, Portaldot usage shown, up to 3 min)
- [ ] Pitch deck: problem, why Portaldot is essential, proof, future support
- [ ] At least 3 commits in the window; no big dump in the last 24 h
- [ ] Third-party dependencies disclosed (polkadot-js, ethers/Hardhat, any OpenZeppelin)

## 10. Timeline

| Date | Goal |
|---|---|
| Oct 20 | Preflight on-chain checks, repo + README skeleton, first commit |
| Oct 21 | Deploy oracle + registry; save addresses and tx hashes |
| Oct 22 | Relayer + agent; one real `nominate` logged on-chain |
| Oct 23 | Demo video; simulated offence scenario (labelled) |
| Oct 24 | Check-in submission with buffer |
| Oct 25 – Nov 5 | Uptime/reward data, more rules, GatedVault, dashboard, pitch deck |
| Nov 6 | Final submission (by 09:30 IST) |

## 11. Scoring fit

| Criterion | Weight | How Potake addresses it |
|---|---|---|
| Technical feasibility | 30% | Verifiable on-chain interactions on both Substrate and EVM sides; commit history |
| Innovation | 30% | Fills a V3 gap (contract-readable staking data) if confirmed; policy + audit log on top |
| Ecosystem contribution | 20% | Open-source infrastructure other dApps can read |
| Business potential | 20% | Needs a concrete first consumer (liquid staking / vault / DAO treasury); weakest score, prepare an answer |

## 12. Competitive check

| Project | What it does | Overlap | Potake difference |
|---|---|---|---|
| **NodePulse** (DoraHacks build, Node Ops) | "Health monitoring for Portaldot nodes with verifiable on-chain uptime attestations" (card text only, page not opened) | Uptime data published on-chain | Monitors and attests; does not touch stake. Could be an input to a policy |
| **PortalGuard** (DoraHacks build, Node Ops) | "Real-time 3D validator telemetry and automated slashing watchdog"; says "256-shard network" (card text only) | Protecting delegators from slashing | Warns; does not nominate or act. Chain has 2 validators and 0 offences, so check what it actually shows |
| **PortalIndex** (`youthisguy/portalIndex`) `[3P]` | Metadata-driven indexer with REST/GraphQL; plans per-era staking snapshots and a Solidity checkpoint | Per-era staking data; on-chain anchor | Potake exposes data to contracts and acts on it; PortalIndex serves off-chain APIs |
| PRT, ComplyDot `[3P]` | Runtime-upgrade testing; RWA compliance | Adjacent only | Not direct competitors (unconfirmed whether submitted) |

Whether these are submitted Hacker House entries is unverified. Check the DoraHacks Builds tab.

## 13. Risks and honest limits

1. **Overlap risk:** PortalIndex's planned staking snapshots and anchoring partly overlap. Differentiate clearly in the README and pitch.
2. **Tiny validator set:** the testnet has very few validators (reports: 1–2) `[?]`, so policies are guardrails and audit trail, not optimization.
3. **Trusted relayer and agent:** the registry records actions; it does not enforce them. Do not call the system trustless.
4. **No proxy custody by default:** `[Live]` a `ProxyType::Staking` exists on V3, but nobody has checked whether its filter admits `set_payee`, which would let a stolen agent key redirect rewards `[?]`. Safer pattern: a nomination pool where the agent holds only the nominator role (`[Live]` 10 tPOT to create, 1 tPOT to join, 0 pools today); fallback is an account you control.
5. **Locked funds:** unbonding is long `[?]`; bond only the minimum.
6. **Precompile claim is single-source:** if a staking precompile exists or is planned, re-scope.
7. **Storage names and pallet versions** (runtime spec 3002 `[Live]`) can differ from polkadot-js defaults; read the runtime metadata first.
8. **Address ownership:** EVM owner vs SS58 staking account cannot be proven on-chain in the MVP.
9. **Gas/storage cost** of publishing validator data every era; measure, and fall back to events plus hashes.

## 14. Open verification items (do these first)

1. Run `preflight.mjs` and record: validator count, pool state, minimum bonds, era length, bonding duration, proxy pallet and `ProxyType` variants, `DelegatedStaking` calls.
2. Confirm staking extrinsics (`bond`, `nominate`) work for your account.
3. Confirm tPOT balance for the mapped SS58 of your EVM deployer.
4. Check DoraHacks Builds for PortalIndex and similar entries (12 builds seen Oct 22; closest: NodePulse, PortalGuard; open their pages).
5. Ask in Discord: staking precompile planned? Would builders use contract-readable staking data?
## 15. Third-party software (disclose in README)
polkadot-js (`@polkadot/api`, Apache-2.0), ethers.js or viem, Hardhat or Remix, OpenZeppelin (if used). Add versions and licenses when pinned.

## 16. Project type and deliverable

**Potake is a developer tool / infrastructure, not a consumer app.** It matches the Node Operations & Tooling track ("automated staking").

| Layer | Type | Priority |
|---|---|---|
| Contracts (`StakingOracle`, `PolicyRegistry`) | Infrastructure other dApps read | 1 |
| Relayer + agent (CLI) | Tool operators run | 2 |
| `GatedVault` | Example consumer, proves the oracle is usable | 3 (optional) |
| Dashboard | Thin read-only page for the demo video | 4 (last) |

Out of scope: wallet-connected staking app (would drift into the Ecosystem DApps track and cost time).

**What others install and run:** clone the repo, `npm install`, fill `.env`, then use the CLI:
```
potake status          # latest relayed era, managed accounts, compliance
potake relay           # watch eras and publish snapshots to the oracle
potake agent           # evaluate policies and nominate when violated
```
Open-source value is scored under Ecosystem Contribution, so document how a Solidity dev reads the oracle in the README.

## 17. Repo scaffold

```
potake/
├── README.md
├── LICENSE                      # MIT
├── .env.example
├── .gitignore                   # must include .env
├── package.json
├── hardhat.config.ts            # solidity 0.8.24, chainId 420420777
├── contracts/
│   ├── StakingOracle.sol
│   ├── PolicyRegistry.sol
│   └── GatedVault.sol           # optional demo consumer
├── scripts/
│   ├── deploy.ts                # deploys oracle + registry, prints addresses
│   └── preflight.mjs            # read-only chain checks (no transactions)
├── src/
│   ├── index.ts                 # CLI entry: status | relay | agent
│   ├── config.ts                # loads .env
│   ├── chain/
│   │   ├── substrate.ts         # polkadot-js connection (wss://test-node-v3.portaldot.dev)
│   │   └── evm.ts               # ethers/viem connection (EVM RPC)
│   ├── relayer/
│   │   ├── era-watcher.ts       # detect era change
│   │   ├── snapshot.ts          # read validators, stake, commission, rewards
│   │   └── uptime.ts            # derive uptime from ImOnline events
│   └── agent/
│       ├── policy.ts            # policy types, read from registry
│       ├── evaluate.ts          # compare nominations vs policy
│       ├── nominate.ts          # submit staking.nominate extrinsic
│       └── log-action.ts        # write action to PolicyRegistry
├── test/
│   ├── oracle.test.ts
│   ├── registry.test.ts
│   └── evaluate.test.ts         # unit tests with fixture snapshots
├── dashboard/
│   ├── index.html
│   └── app.js                   # reads oracle/registry, links to explorer
└── docs/
    ├── architecture.md          # diagram + data flow (required for check-in)
    ├── policy-spec.md           # rule definitions
    ├── verification.md          # what is real vs simulated, tx hashes
    └── demo-script.md           # 3-minute video script
```

### `.env.example`
```
SUBSTRATE_WS=wss://test-node-v3.portaldot.dev
EVM_RPC=https://test-evm-rpc-v3.portaldot.dev
CHAIN_ID=420420777
DEPLOYER_PRIVATE_KEY=          # EVM key, test account only
RELAYER_PRIVATE_KEY=           # EVM key allowed to publish snapshots
AGENT_SEED=                    # Substrate seed/URI for the staking account, test account only
ORACLE_ADDRESS=
REGISTRY_ADDRESS=
MANAGED_ACCOUNTS=              # comma-separated SS58 addresses the agent may manage
```
Never commit keys. Use fresh test accounts only.

### README skeleton
```
# Potake
One-line summary

## Problem
## Solution
## Architecture (diagram)
## Portaldot features used (with sources)
## Deployed contracts (address, tx hash, explorer link)   <- required for check-in
## Quick start
  1. npm install
  2. cp .env.example .env and fill values
  3. node scripts/preflight.mjs <SS58>
  4. npx hardhat run scripts/deploy.ts --network portaldotV3
  5. potake relay / potake agent
## Reading the oracle from Solidity (example)
## What is real vs simulated
## Limits (trusted relayer/agent, tiny testnet validator set, locked funds)
## Third-party software and licenses
## Roadmap
## License
```

### First commits (starts the timeline inside Oct 14 – Nov 6)
1. `chore: repo skeleton, license, README outline, .env.example`
2. `docs: architecture diagram and policy spec draft`
3. `feat(contracts): StakingOracle and PolicyRegistry`
Then commit steadily; do not push the core modules in one dump near the deadline.

### Build order
1. Run `preflight.mjs`, record results in `docs/verification.md`
2. Contracts + deploy script; save addresses and tx hashes in the README
3. Relayer (`era-watcher`, `snapshot`) publishing a real era
4. Agent (`evaluate`, `nominate`, `log-action`) with one real `nominate`
5. Demo video + check-in submission (Oct 24, 17:30 IST)
6. Uptime data, extra rules, `GatedVault`, dashboard, pitch deck

## 18. References
- Hacker House page: https://dorahacks.io (Portaldot Hacker House 2026)
- Official testnet guide: https://github.com/ItsCogumellum/portaldot-v3-testnet-guide
- PortalIndex: https://github.com/youthisguy/portalIndex
