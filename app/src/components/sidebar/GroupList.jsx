import { useState } from "react";
import { useChat } from "@/context/ChatContext";
import { Avatar } from "@/components/ui/Avatar";
import { truncateAddress, formatRelativeTime } from "@/utils/formatting";
import { SearchBar } from "./SearchBar";
import { ContactSkeleton } from "@/components/ui/Skeleton";
import {
  Users,
  UserPlus,
  Settings,
  MessageCircle,
} from "lucide-react";

/**
 * GroupList — sidebar list of group chats.
 */
export function GroupList({ isLoading = false, onCreateGroup }) {
  const { groups, activeConversation, setActiveConversation, messages } =
    useChat();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredGroups = groups.filter((g) => {
    if (!searchQuery) return true;
    return g.name?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const getLastMessage = (groupId) => {
    const msgs = messages[groupId] || [];
    return msgs.length > 0 ? msgs[msgs.length - 1] : null;
  };

  const getUnreadCount = (groupId) => {
    const msgs = messages[groupId] || [];
    return msgs.filter((m) => m.status !== "read").length;
  };

  const handleSelect = (group) => {
    setActiveConversation({ type: "group", id: group.groupId });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Groups
          </h2>
          <span className="text-xs text-muted-foreground">
            {groups.length} groups
          </span>
        </div>
        <SearchBar
          placeholder="Search groups..."
          onSearch={setSearchQuery}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-3 space-y-2">
            <ContactSkeleton />
            <ContactSkeleton />
            <ContactSkeleton />
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Users className="w-10 h-10 mb-3 opacity-40" />
            <p className="text-sm mb-4">
              {searchQuery ? "No groups found" : "No groups yet"}
            </p>
            <button
              onClick={onCreateGroup}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Create Group
            </button>
          </div>
        ) : (
          <>
            {filteredGroups.map((group) => {
              const isActive =
                activeConversation?.type === "group" &&
                activeConversation?.id === group.groupId;
              const lastMsg = getLastMessage(group.groupId);
              const unread = getUnreadCount(group.groupId);
              const memberCount = group.members?.length || 0;

              return (
                <div
                  key={group.groupId}
                  onClick={() => handleSelect(group)}
                  className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                    isActive
                      ? "bg-primary/10 border-r-2 border-primary"
                      : "hover:bg-muted/50 border-r-2 border-transparent"
                  }`}
                >
                  <div className="shrink-0 w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm truncate">
                        {group.name}
                      </span>
                      {lastMsg && (
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          {formatRelativeTime(lastMsg.timestamp)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-xs text-muted-foreground truncate max-w-[140px]">
                        {lastMsg?.content || "No messages yet"}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-muted-foreground">
                          {memberCount}
                        </span>
                        {unread > 0 && (
                          <span className="bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                            {unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
