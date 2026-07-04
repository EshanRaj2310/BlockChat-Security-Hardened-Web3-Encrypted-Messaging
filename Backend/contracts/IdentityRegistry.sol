// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IdentityRegistry
 * @notice On-chain registry for user ECDH public keys, usernames, and profile metadata.
 * @dev Each address registers once; use updateKey to change afterwards.
 */
contract IdentityRegistry {
    struct Identity {
        bytes   publicKey;
        string  username;
        string  profileCid;
        bool    exists;
    }

    mapping(address => Identity) private _identities;

    event KeyRegistered(address indexed user, string username);
    event KeyUpdated(address indexed user);

    error AlreadyRegistered();
    error NotRegistered();
    error EmptyPublicKey();

    function registerKey(string calldata username, bytes calldata publicKey, string calldata profileCid) external {
        if (_identities[msg.sender].exists) revert AlreadyRegistered();
        if (publicKey.length == 0) revert EmptyPublicKey();
        _identities[msg.sender] = Identity({ publicKey: publicKey, username: username, profileCid: profileCid, exists: true });
        emit KeyRegistered(msg.sender, username);
    }

    function updateKey(bytes calldata newPublicKey, string calldata profileCid) external {
        if (!_identities[msg.sender].exists) revert NotRegistered();
        if (newPublicKey.length == 0) revert EmptyPublicKey();
        _identities[msg.sender].publicKey  = newPublicKey;
        _identities[msg.sender].profileCid = profileCid;
        emit KeyUpdated(msg.sender);
    }

    function getKey(address user) external view returns (bytes memory publicKey, string memory username, string memory profileCid) {
        if (!_identities[user].exists) revert NotRegistered();
        Identity storage id = _identities[user];
        return (id.publicKey, id.username, id.profileCid);
    }

    function isRegistered(address user) external view returns (bool) {
        return _identities[user].exists;
    }
}
