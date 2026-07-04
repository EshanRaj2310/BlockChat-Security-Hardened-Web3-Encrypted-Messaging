// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title GroupManager
 * @notice Manages encrypted group chats: creation, membership, wrapped AES keys.
 */
contract GroupManager {
    struct Group {
        string    name;
        address   admin;
        address[] members;
        mapping(address => bytes) wrappedKeys;
        mapping(address => bool)  isMember;
        bool      exists;
    }

    uint256 public nextGroupId = 1;
    mapping(uint256 => Group) private _groups;

    event GroupCreated(uint256 indexed groupId, address indexed creator, string name);
    event MemberAdded(uint256 indexed groupId, address member);
    event MemberRemoved(uint256 indexed groupId, address member);
    event GroupKeyRotationRequired(uint256 indexed groupId);

    error OnlyAdmin();
    error GroupNotFound();
    error AlreadyMember();
    error NotAMember();
    error LengthMismatch();
    error EmptyMembers();

    modifier onlyAdmin(uint256 groupId) {
        if (!_groups[groupId].exists) revert GroupNotFound();
        if (_groups[groupId].admin != msg.sender) revert OnlyAdmin();
        _;
    }

    function createGroup(string calldata name, address[] calldata members, bytes[] calldata wrappedKeys) external {
        if (members.length == 0) revert EmptyMembers();
        if (members.length != wrappedKeys.length) revert LengthMismatch();
        uint256 groupId = nextGroupId++;
        Group storage g = _groups[groupId];
        g.name = name; g.admin = msg.sender; g.exists = true;
        for (uint256 i = 0; i < members.length; i++) {
            g.members.push(members[i]);
            g.isMember[members[i]] = true;
            g.wrappedKeys[members[i]] = wrappedKeys[i];
        }
        emit GroupCreated(groupId, msg.sender, name);
    }

    function addMember(uint256 groupId, address member, bytes calldata wrappedKey) external onlyAdmin(groupId) {
        Group storage g = _groups[groupId];
        if (g.isMember[member]) revert AlreadyMember();
        g.members.push(member);
        g.isMember[member] = true;
        g.wrappedKeys[member] = wrappedKey;
        emit MemberAdded(groupId, member);
    }

    function removeMember(uint256 groupId, address member) external onlyAdmin(groupId) {
        Group storage g = _groups[groupId];
        if (!g.isMember[member]) revert NotAMember();
        g.isMember[member] = false;
        delete g.wrappedKeys[member];
        uint256 len = g.members.length;
        for (uint256 i = 0; i < len; i++) {
            if (g.members[i] == member) { g.members[i] = g.members[len - 1]; g.members.pop(); break; }
        }
        emit MemberRemoved(groupId, member);
        emit GroupKeyRotationRequired(groupId);
    }

    function getWrappedKey(uint256 groupId, address member) external view returns (bytes memory) {
        if (!_groups[groupId].exists) revert GroupNotFound();
        if (!_groups[groupId].isMember[member]) revert NotAMember();
        return _groups[groupId].wrappedKeys[member];
    }

    function getGroupInfo(uint256 groupId) external view returns (string memory name, address[] memory members, address admin) {
        if (!_groups[groupId].exists) revert GroupNotFound();
        Group storage g = _groups[groupId];
        return (g.name, g.members, g.admin);
    }

    function updateGroupKey(uint256 groupId, address[] calldata members, bytes[] calldata newWrappedKeys) external onlyAdmin(groupId) {
        if (members.length != newWrappedKeys.length) revert LengthMismatch();
        Group storage g = _groups[groupId];
        for (uint256 i = 0; i < members.length; i++) {
            if (!g.isMember[members[i]]) revert NotAMember();
            g.wrappedKeys[members[i]] = newWrappedKeys[i];
        }
    }
}
