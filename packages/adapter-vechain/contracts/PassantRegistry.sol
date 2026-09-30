// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/// @title Passant anchoring registry (crypto spec section 7).
/// @notice Emits the Merkle root of an anchoring batch as an event and
///         stores nothing. Events are cheaper than storage and are all that
///         verification needs; the sender address identifies the operator.
///         Anchoring the same root twice is harmless and does not revert.
contract PassantRegistry {
    event Anchored(bytes32 indexed root, address indexed sender, uint256 timestamp);

    function anchor(bytes32 root) external {
        emit Anchored(root, msg.sender, block.timestamp);
    }
}
