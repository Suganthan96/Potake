// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IStakingView} from "./IStakingView.sol";

/// @title StakingOracle
/// @notice Holds the latest Portaldot V3 staking snapshot, published each era by a relayer.
/// @dev Storage design: only the LATEST snapshot is kept, in fixed slots that are overwritten
///      each era. History goes to events. This avoids growing storage deposits on Revive.
///      TRUST: the relayer is a trusted party. The oracle does not prove the data is correct.
contract StakingOracle is IStakingView {
    uint256 public constant MAX_VALIDATORS = 64;

    address public owner;
    address public relayer;

    bool private _published;
    Snapshot private _snapshot;
    bytes32[] private _validatorIds;
    mapping(bytes32 => ValidatorInfo) private _validators;
    mapping(bytes32 => bool) private _listed;

    event SnapshotPublished(uint32 indexed era, bytes32 validatorSetHash, uint256 totalStake, uint16 validatorCount);
    event ValidatorUpdated(
        uint32 indexed era, bytes32 indexed validator, uint128 totalStake, uint16 commissionBps, uint16 uptimeBps, bool active
    );
    event RelayerChanged(address indexed relayer);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error NotRelayer();
    error StaleEra();
    error LengthMismatch();
    error TooManyValidators();
    error DuplicateValidator();
    error BpsOutOfRange();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert NotRelayer();
        _;
    }

    constructor(address relayer_) {
        if (relayer_ == address(0)) revert ZeroAddress();
        owner = msg.sender;
        relayer = relayer_;
        emit OwnershipTransferred(address(0), msg.sender);
        emit RelayerChanged(relayer_);
    }

    // ---------------------------------------------------------------- admin

    function setRelayer(address relayer_) external onlyOwner {
        if (relayer_ == address(0)) revert ZeroAddress();
        relayer = relayer_;
        emit RelayerChanged(relayer_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // -------------------------------------------------------------- publish

    /// @notice Publish the snapshot for a new era. Replaces the previous snapshot.
    /// @param ids Validator account IDs (32-byte Substrate AccountId32), no duplicates.
    /// @param infos Per-validator data, same order as `ids`.
    function publish(uint32 era, uint256 totalStake, uint256 eraReward, bytes32[] calldata ids, ValidatorInfo[] calldata infos)
        external
        onlyRelayer
    {
        if (_published && era <= _snapshot.era) revert StaleEra();
        if (ids.length != infos.length) revert LengthMismatch();
        if (ids.length > MAX_VALIDATORS) revert TooManyValidators();

        // Clear the previous validator set.
        uint256 oldLen = _validatorIds.length;
        for (uint256 i = 0; i < oldLen; i++) {
            bytes32 oldId = _validatorIds[i];
            delete _validators[oldId];
            delete _listed[oldId];
        }
        delete _validatorIds;

        // Write the new set.
        for (uint256 i = 0; i < ids.length; i++) {
            bytes32 id = ids[i];
            ValidatorInfo calldata info = infos[i];
            if (_listed[id]) revert DuplicateValidator();
            if (info.commissionBps > 10_000 || info.uptimeBps > 10_000) revert BpsOutOfRange();

            _listed[id] = true;
            _validatorIds.push(id);
            _validators[id] = info;

            emit ValidatorUpdated(era, id, info.totalStake, info.commissionBps, info.uptimeBps, info.active);
        }

        bytes32 setHash = keccak256(abi.encode(ids));
        _snapshot = Snapshot({
            era: era,
            relayedAt: uint64(block.timestamp),
            validatorCount: uint16(ids.length),
            validatorSetHash: setHash,
            totalStake: totalStake,
            eraReward: eraReward
        });
        _published = true;

        emit SnapshotPublished(era, setHash, totalStake, uint16(ids.length));
    }

    // ------------------------------------------------------------ IStakingView

    function latestEra() external view returns (uint32) {
        return _snapshot.era;
    }

    function snapshot() external view returns (Snapshot memory) {
        return _snapshot;
    }

    function validatorIds() external view returns (bytes32[] memory) {
        return _validatorIds;
    }

    function validatorInfo(bytes32 validator) external view returns (ValidatorInfo memory) {
        return _validators[validator];
    }

    function isHealthy(bytes32 validator, uint16 minUptimeBps) external view returns (bool) {
        if (!_listed[validator]) return false;
        ValidatorInfo storage v = _validators[validator];
        return v.active && v.uptimeBps >= minUptimeBps;
    }

    function stakeShareBps(bytes32 validator) external view returns (uint16) {
        uint256 total = _snapshot.totalStake;
        if (total == 0 || !_listed[validator]) return 0;
        uint256 share = (uint256(_validators[validator].totalStake) * 10_000) / total;
        return share > 10_000 ? 10_000 : uint16(share);
    }
}
