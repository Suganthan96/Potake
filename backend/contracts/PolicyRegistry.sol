// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PolicyRegistry
/// @notice Stores staking rules per EVM owner and an append-only log of agent actions.
/// @dev LIMITS (state these in the README):
///      - This is an AUDIT TRAIL, not enforcement. The registry cannot make the agent
///        follow a policy.
///      - It does not prove the EVM owner controls the Substrate `stakingAccount`.
///      - The agent is a trusted party.
contract PolicyRegistry {
    uint8 public constant RULE_MAX_SHARE = 1;
    uint8 public constant RULE_MIN_UPTIME = 2;
    uint8 public constant RULE_MAX_VALIDATORS = 3;

    struct Policy {
        bytes32 stakingAccount; // Substrate AccountId32 the agent manages
        uint16 maxShareBps; // max share of the managed stake on any one validator
        uint16 minUptimeBps; // min uptime for a nominated validator
        uint8 maxValidators; // max validators nominated (0 = no limit)
        uint32 version;
        bool active;
    }

    struct Action {
        uint32 era;
        uint32 policyVersion;
        uint8 ruleBroken;
        bytes32 extrinsicHash; // Substrate `nominate` extrinsic hash
        bytes32 fromSetHash; // hash of nominated set before
        bytes32 toSetHash; // hash of nominated set after
        uint64 loggedAt;
    }

    address public owner;
    address public agent;

    mapping(address => Policy) public policies;
    mapping(bytes32 => Action[]) private _actions; // keyed by stakingAccount

    event PolicySet(
        address indexed policyOwner,
        bytes32 indexed stakingAccount,
        uint32 version,
        uint16 maxShareBps,
        uint16 minUptimeBps,
        uint8 maxValidators
    );
    event PolicyDeactivated(address indexed policyOwner, bytes32 indexed stakingAccount, uint32 version);
    event ActionLogged(
        bytes32 indexed stakingAccount,
        address indexed policyOwner,
        uint32 era,
        uint32 policyVersion,
        uint8 ruleBroken,
        bytes32 extrinsicHash,
        bytes32 fromSetHash,
        bytes32 toSetHash
    );
    event AgentChanged(address indexed agent);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error NotAgent();
    error ZeroAddress();
    error BpsOutOfRange();
    error ZeroAccount();
    error NoActivePolicy();
    error PolicyVersionMismatch();
    error InvalidRule();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent();
        _;
    }

    constructor(address agent_) {
        if (agent_ == address(0)) revert ZeroAddress();
        owner = msg.sender;
        agent = agent_;
        emit OwnershipTransferred(address(0), msg.sender);
        emit AgentChanged(agent_);
    }

    // ---------------------------------------------------------------- admin

    function setAgent(address agent_) external onlyOwner {
        if (agent_ == address(0)) revert ZeroAddress();
        agent = agent_;
        emit AgentChanged(agent_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ------------------------------------------------------------- policies

    /// @notice Create or replace the caller's policy. Bumps the version.
    function setPolicy(bytes32 stakingAccount, uint16 maxShareBps, uint16 minUptimeBps, uint8 maxValidators) external {
        if (stakingAccount == bytes32(0)) revert ZeroAccount();
        if (maxShareBps > 10_000 || minUptimeBps > 10_000) revert BpsOutOfRange();

        Policy storage p = policies[msg.sender];
        uint32 version = p.version + 1;
        policies[msg.sender] = Policy({
            stakingAccount: stakingAccount,
            maxShareBps: maxShareBps,
            minUptimeBps: minUptimeBps,
            maxValidators: maxValidators,
            version: version,
            active: true
        });

        emit PolicySet(msg.sender, stakingAccount, version, maxShareBps, minUptimeBps, maxValidators);
    }

    function deactivatePolicy() external {
        Policy storage p = policies[msg.sender];
        if (!p.active) revert NoActivePolicy();
        p.active = false;
        emit PolicyDeactivated(msg.sender, p.stakingAccount, p.version);
    }

    // ------------------------------------------------------------ action log

    /// @notice Agent records a corrective action it took for `policyOwner`'s account.
    function logAction(
        address policyOwner,
        uint32 era,
        uint32 policyVersion,
        uint8 ruleBroken,
        bytes32 extrinsicHash,
        bytes32 fromSetHash,
        bytes32 toSetHash
    ) external onlyAgent {
        Policy storage p = policies[policyOwner];
        if (!p.active) revert NoActivePolicy();
        if (p.version != policyVersion) revert PolicyVersionMismatch();
        if (ruleBroken < RULE_MAX_SHARE || ruleBroken > RULE_MAX_VALIDATORS) revert InvalidRule();

        _actions[p.stakingAccount].push(
            Action({
                era: era,
                policyVersion: policyVersion,
                ruleBroken: ruleBroken,
                extrinsicHash: extrinsicHash,
                fromSetHash: fromSetHash,
                toSetHash: toSetHash,
                loggedAt: uint64(block.timestamp)
            })
        );

        emit ActionLogged(p.stakingAccount, policyOwner, era, policyVersion, ruleBroken, extrinsicHash, fromSetHash, toSetHash);
    }

    function actionCount(bytes32 stakingAccount) external view returns (uint256) {
        return _actions[stakingAccount].length;
    }

    function getAction(bytes32 stakingAccount, uint256 index) external view returns (Action memory) {
        return _actions[stakingAccount][index];
    }
}
