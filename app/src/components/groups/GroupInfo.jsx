import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { truncateAddress } from "@/utils/formatting";
import {
  Users,
  Shield,
  UserPlus,
  UserMinus,
  X,
  Search,
  Loader2,
  KeyRound,
} from "lucide-react";

/**
 * GroupInfo — panel showing group details, members, admin controls.
 */
export function GroupInfo({
  group,
  isOpen,
  onClose,
  onAddMember,
  onRemoveMember,
}) {
  const { address } = useAuth();
  const [showAddMember, setShowAddMember] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isRemoving, setIsRemoving] = useState(null);

  if (!group) return null;

  const isAdmin = group.creatorAddress === address;
  const memberCount = group.members?.length || 0;

  const handleRemove = async (memberAddress) => {
    setIsRemoving(memberAddress);
    try {
      await onRemoveMember?.(group.groupId, memberAddress);
    } finally {
      setIsRemoving(null);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={group.name} size="md">
      <div className="flex flex-col gap-4">
        {/* Group header info */}
        <div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
          <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center">
            <Users className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">{group.name}</h3>
            <p className="text-sm text-muted-foreground">
              {memberCount} member{memberCount !== 1 ? "s" : ""}
            </p>
            {group.keyRotated && (
              <div className="flex items-center gap-1.5 mt-1 text-amber-500 text-xs">
                <KeyRound className="w-3 h-3" />
                <span>Key rotated after member change</span>
              </div>
            )}
          </div>
        </div>

        {/* Members list */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium">Members</h4>
            {isAdmin && (
              <button
                onClick={() => setShowAddMember(!showAddMember)}
                className="flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded text-xs hover:bg-primary/20 transition-colors"
              >
                <UserPlus className="w-3 h-3" />
                Add
              </button>
            )}
          </div>

          {showAddMember && (
            <div className="mb-3 p-3 border border-border rounded-lg">
              <p className="text-xs text-muted-foreground mb-2">
                Enter wallet address of member to add:
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="0x..."
                  className="flex-1 px-3 py-2 bg-muted rounded-lg text-sm border border-transparent focus:border-primary outline-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      onAddMember?.(group.groupId, e.target.value);
                      e.target.value = "";
                      setShowAddMember(false);
                    }
                  }}
                />
              </div>
            </div>
          )}

          <div className="max-h-[300px] overflow-y-auto border border-border rounded-lg divide-y divide-border">
            {group.members?.map((member) => (
              <div
                key={member.address}
                className="flex items-center gap-3 px-3 py-2.5"
              >
                <Avatar
                  address={member.address}
                  username={member.username}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {member.username || truncateAddress(member.address)}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {member.address}
                  </p>
                </div>
                {member.address === group.creatorAddress && (
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 text-amber-500 text-[10px] rounded-full font-medium">
                    <Shield className="w-3 h-3" />
                    Admin
                  </span>
                )}
                {isAdmin && member.address !== group.creatorAddress && (
                  <button
                    onClick={() => handleRemove(member.address)}
                    disabled={isRemoving === member.address}
                    className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors"
                  >
                    {isRemoving === member.address ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <UserMinus className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Group ID */}
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Group ID</p>
          <p className="text-xs font-mono mt-0.5">{group.groupId}</p>
        </div>
      </div>
    </Modal>
  );
}
