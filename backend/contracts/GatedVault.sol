// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IStakingView} from "./IStakingView.sol";

/// @title GatedVault
/// @notice DEMO consumer contract: accepts deposits earmarked for a validator only if the
///         validator is healthy according to an IStakingView. It exists to show that a
///         contract can use staking data. It does not stake anything.
contract GatedVault {
    IStakingView public immutable staking;
    uint16 public immutable minUptimeBps;

    mapping(address => mapping(bytes32 => uint256)) public balanceOf; // depositor => validator => amount

    event Deposited(address indexed depositor, bytes32 indexed validator, uint256 amount);
    event Withdrawn(address indexed depositor, bytes32 indexed validator, uint256 amount);

    error ValidatorUnhealthy();
    error ZeroAmount();
    error InsufficientBalance();
    error TransferFailed();

    constructor(IStakingView staking_, uint16 minUptimeBps_) {
        staking = staking_;
        minUptimeBps = minUptimeBps_;
    }

    function deposit(bytes32 validator) external payable {
        if (msg.value == 0) revert ZeroAmount();
        if (!staking.isHealthy(validator, minUptimeBps)) revert ValidatorUnhealthy();
        balanceOf[msg.sender][validator] += msg.value;
        emit Deposited(msg.sender, validator, msg.value);
    }

    function withdraw(bytes32 validator, uint256 amount) external {
        uint256 bal = balanceOf[msg.sender][validator];
        if (amount == 0) revert ZeroAmount();
        if (bal < amount) revert InsufficientBalance();
        balanceOf[msg.sender][validator] = bal - amount; // effects before interaction
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, validator, amount);
    }
}
