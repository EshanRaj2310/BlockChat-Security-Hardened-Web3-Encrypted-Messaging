import { useState, useCallback } from "react";
import { isAddress, getAddress } from "ethers";

import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/context/ChatContext";
import { Avatar } from "@/components/ui/Avatar";
import { truncateAddress, formatRelativeTime } from "@/utils/formatting";
import { SearchBar } from "./SearchBar";
import { ContactSkeleton } from "@/components/ui/Skeleton";
import { Modal } from "@/components/ui/Modal";
import { isValidAddress } from "@/security";
import { toast } from "sonner";
import {
  MessageCircle,
  Ban,
  UserPlus,
  Ghost,
  MoreVertical,
  Check,
} from "lucide-react";

/**
 * ContactList — sidebar list of contacts/DMs.
 */
export function ContactList({ isLoading = false }) {
  const { user, isAnonymous } = useAuth();
  const {
    contacts,
    activeConversation,
    setActiveConversation,
    messages,
    isBlocked,
    toggleBlockUser,
    onlineUsers,
    addContact,
  } = useChat();
  const { getToken } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [contextMenu, setContextMenu] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newContactAddress, setNewContactAddress] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const filteredContacts = contacts.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c?.username?.toLowerCase().includes(q) ||
      c?.address?.toLowerCase().includes(q)
    );
  });

  const getLastMessage = useCallback(
    (address) => {
      const msgs = messages[address?.toLowerCase()] || [];
      return msgs.length > 0 ? msgs[msgs.length - 1] : null;
    },
    [messages]
  );

  const getUnreadCount = useCallback(
    (address) => {
      const msgs = messages[address?.toLowerCase()] || [];
      return msgs.filter((m) => m.from?.toLowerCase() === address?.toLowerCase() && m.status !== "read").length;
    },
    [messages]
  );

  const handleSelect = (contact) => {
    setActiveConversation({ type: "dm", id: contact.address });
  };

  const handleAddContact = async (e) => {
    e.preventDefault();
    
    let sanitizedAddress;
    try {
      if (!newContactAddress || typeof newContactAddress !== "string") {
        throw new Error("Address is required");
      }
      
      const trimmed = newContactAddress.trim();
      if (!isAddress(trimmed)) {
        throw new Error("Invalid Ethereum address");
      }
      sanitizedAddress = getAddress(trimmed);
    } catch (err) {
      toast.error(err.message || "Invalid address");
      return;
    }

    // Check if already in contacts (with safety guard)
    if (contacts.find(c => c.address?.toLowerCase() === sanitizedAddress.toLowerCase())) {
      toast.error("Contact already exists");
      return;
    }

    setIsAdding(true);
    try {
      const res = await fetch(`http://localhost:5000/api/users/${sanitizedAddress}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      
      if (res.ok) {
        const userData = await res.json();
        
        // CRITICAL FIX: Guard against malformed API responses
        if (!userData || !userData.address) {
          throw new Error("Invalid user data from server");
        }

        addContact(userData);
        toast.success(`Added ${userData.username || "contact"}`);
        setIsAddModalOpen(false);
        setNewContactAddress("");
        handleSelect(userData);
      } else {
        // User not registered, but we can still add them by address
        const dummyContact = { address: sanitizedAddress };
        addContact(dummyContact);
        toast.success("Added address to contacts");
        setIsAddModalOpen(false);
        setNewContactAddress("");
        handleSelect(dummyContact);
      }
    } catch (err) {
      console.error("[ContactList] Add error:", err);
      toast.error("Failed to add contact");
    } finally {
      setIsAdding(false);
    }
  };

  const handleContextMenu = (e, contact) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, contact });
  };

  const closeContextMenu = () => setContextMenu(null);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Messages
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {isAnonymous && <Ghost className="w-3.5 h-3.5 inline mr-1" />}
              {contacts.length} contacts
            </span>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="p-1.5 hover:bg-muted rounded-md text-primary transition-colors"
              title="Add Contact"
            >
              <UserPlus className="w-4 h-4" />
            </button>
          </div>
        </div>
        <SearchBar
          placeholder="Search contacts..."
          onSearch={setSearchQuery}
        />
      </div>

      <div className="flex-1 overflow-y-auto" onClick={closeContextMenu}>
        {isLoading ? (
          <div className="p-3 space-y-2">
            <ContactSkeleton />
            <ContactSkeleton />
            <ContactSkeleton />
            <ContactSkeleton />
            <ContactSkeleton />
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <MessageCircle className="w-10 h-10 mb-3 opacity-40" />
            <p className="text-sm">
              {searchQuery ? "No contacts found" : "No conversations yet"}
            </p>
          </div>
        ) : (
          filteredContacts.map((contact) => {
            const isActive =
              activeConversation?.type === "dm" &&
              activeConversation?.id === contact.address;
            const lastMsg = getLastMessage(contact.address);
            const unread = getUnreadCount(contact.address);
            const isOnline = onlineUsers.has(contact.address);
            const blocked = isBlocked(contact.address);

            return (
              <div
                key={contact.address}
                onClick={() => !blocked && handleSelect(contact)}
                onContextMenu={(e) => handleContextMenu(e, contact)}
                className={`relative flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors group ${
                  isActive
                    ? "bg-primary/10 border-r-2 border-primary"
                    : "hover:bg-muted/50 border-r-2 border-transparent"
                } ${blocked ? "opacity-40" : ""}`}
              >
                <div className="relative shrink-0">
                  <Avatar
                    address={contact.address}
                    username={contact.username}
                    src={contact.avatar}
                    size="md"
                  />
                  {isOnline && (
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-background rounded-full" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm truncate">
                      {contact.username || truncateAddress(contact.address)}
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
                    {unread > 0 && (
                      <span className="shrink-0 bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                        {unread}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-100"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            onClick={() => {
              handleSelect(contextMenu.contact);
              closeContextMenu();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            Open Chat
          </button>
          <button
            onClick={() => {
              toggleBlockUser(contextMenu.contact.address);
              closeContextMenu();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
          >
            {isBlocked(contextMenu.contact.address) ? (
              <>
                <Check className="w-4 h-4" />
                Unblock
              </>
            ) : (
              <>
                <Ban className="w-4 h-4" />
                Block User
              </>
            )}
          </button>
          <button
            onClick={() => {
              // Add contact flow
              closeContextMenu();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            View Profile
          </button>
        </div>
      )}

      {/* Add Contact Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => !isAdding && setIsAddModalOpen(false)}
        title="Add New Contact"
      >
        <form onSubmit={handleAddContact} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase mb-1.5 block">
              Ethereum Address
            </label>
            <input
              type="text"
              value={newContactAddress}
              onChange={(e) => setNewContactAddress(e.target.value)}
              placeholder="0x..."
              className="w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none border border-transparent focus:border-primary transition-all"
              autoFocus
              disabled={isAdding}
            />
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Enter the wallet address of the person you want to chat with.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 text-sm font-medium hover:bg-muted rounded-lg transition-colors"
              disabled={isAdding}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
              disabled={isAdding || !newContactAddress}
            >
              {isAdding ? (
                <>
                  <div className="w-3 h-3 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Adding...
                </>
              ) : (
                "Add Contact"
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
