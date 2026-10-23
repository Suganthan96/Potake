// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IStakingView
/// @notice Read interface for Portaldot V3 staking data, as seen from the EVM side.
/// @dev Consumers depend only on this interface. Today it is backed by a relayer-fed
///      oracle (StakingOracle). If a native staking precompile ever appears, an
///      implementation can swap in behind the same interface and consumers do not change.
interface IStakingView {
    struct Snapshot {
        uint32 era;
        uint64 relayedAt; // block timestamp when the relayer published it
        uint16 validatorCount;
        bytes32 validatorSetHash; // keccak256(abi.encode(validatorIds))
        uint256 totalStake; // network-wide stake, chain units (14 decimals)
        uint256 eraReward;
    }

    struct ValidatorInfo {
        uint128 totalStake;
        uint16 commissionBps;
        uint16 uptimeBps; // derived off-chain from ImOnline events
        bool active;
    }

    /// @notice Era of the latest published snapshot (0 before the first publish).
    function latestEra() external view returns (uint32);

    function snapshot() external view returns (Snapshot memory);

    function validatorIds() external view returns (bytes32[] memory);

    /// @notice Info for a validator in the latest snapshot (zeroed if not listed).
    function validatorInfo(bytes32 validator) external view returns (ValidatorInfo memory);

    /// @notice True if the validator is listed, active, and has uptime >= minUptimeBps.
    function isHealthy(bytes32 validator, uint16 minUptimeBps) external view returns (bool);

    /// @notice Validator's share of total network stake in basis points (0 if unknown).
    function stakeShareBps(bytes32 validator) external view returns (uint16);
}
