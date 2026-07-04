// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title AuditLog
 * @notice Immutable on-chain audit trail — stores only keccak256 hashes, never plaintext.
 */
contract AuditLog {
    struct LogEntry { address sender; uint256 timestamp; bool exists; }

    mapping(bytes32 => LogEntry) private _logs;

    event MessageLogged(address indexed sender, bytes32 contentHash, uint256 timestamp, uint256 groupId);

    error HashAlreadyLogged();

    function logMessage(bytes32 contentHash, uint256 groupId) external {
        if (_logs[contentHash].exists) revert HashAlreadyLogged();
        _logs[contentHash] = LogEntry({ sender: msg.sender, timestamp: block.timestamp, exists: true });
        emit MessageLogged(msg.sender, contentHash, block.timestamp, groupId);
    }

    function verify(bytes32 contentHash) external view returns (bool exists, uint256 timestamp, address sender) {
        LogEntry storage entry = _logs[contentHash];
        return (entry.exists, entry.timestamp, entry.sender);
    }
}
