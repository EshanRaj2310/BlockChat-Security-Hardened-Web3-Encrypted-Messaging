import React, { createContext, useContext, useState, useCallback, useRef } from "react";

const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const [_activeConversation, _setActiveConversation] = useState(null);
  const setActiveConversation = useCallback((conv) => {
    if (conv && conv.type === "dm" && conv.id) {
      _setActiveConversation({ ...conv, id: conv.id.toLowerCase() });
    } else if (conv && conv.type === "group" && conv.id) {
      _setActiveConversation({ ...conv, id: conv.id.toLowerCase() }); // Groups are also hex IDs
    } else {
      _setActiveConversation(conv);
    }
  }, []);
  const activeConversation = _activeConversation;
  const [messages, setMessages] = useState({}); // { conversationId: [messages] }
  const [typingUsers, setTypingUsers] = useState({}); // { conversationId: timestamp }
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [pinnedMessages, setPinnedMessages] = useState({}); // { conversationId: [messageIds] }
  const [blockedUsers, setBlockedUsers] = useState(new Set());
  const [reactions, setReactions] = useState({}); // { messageId: { emoji: count } }
  const [replyingTo, setReplyingTo] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const messagesRef = useRef({});

  /**
   * Add a message to a conversation.
   */
  const addMessage = useCallback((conversationId, message) => {
    const cid = conversationId.toLowerCase();
    const newMessage = {
      ...message,
      status: message.status || "sent",
      timestamp: message.timestamp || Date.now(),
    };
    setMessages((prev) => {
      const existing = prev[cid] || [];
      // Avoid duplicates
      if (existing.some((m) => m.messageId === newMessage.messageId)) {
        return prev;
      }
      const updated = [...existing, newMessage];
      messagesRef.current = { ...prev, [cid]: updated };
      return messagesRef.current;
    });
  }, []);

  /**
   * Update a message (edit, status change, etc.).
   */
  const updateMessage = useCallback((conversationId, messageId, updates) => {
    const cid = conversationId.toLowerCase();
    setMessages((prev) => {
      const existing = prev[cid] || [];
      const updated = existing.map((m) =>
        m.messageId === messageId ? { ...m, ...updates } : m
      );
      messagesRef.current = { ...prev, [cid]: updated };
      return messagesRef.current;
    });
  }, []);

  /**
   * Delete a message.
   */
  const deleteMessage = useCallback((conversationId, messageId) => {
    const cid = conversationId.toLowerCase();
    setMessages((prev) => {
      const existing = prev[cid] || [];
      const updated = existing.filter((m) => m.messageId !== messageId);
      messagesRef.current = { ...prev, [cid]: updated };
      return messagesRef.current;
    });
  }, []);

  /**
   * Mark message as read.
   */
  const markAsRead = useCallback((conversationId, messageId) => {
    const cid = conversationId.toLowerCase();
    setMessages((prev) => {
      const existing = prev[cid] || [];
      const updated = existing.map((m) =>
        m.messageId === messageId ? { ...m, status: "read" } : m
      );
      messagesRef.current = { ...prev, [cid]: updated };
      return messagesRef.current;
    });
  }, []);

  /**
   * Set typing indicator.
   */
  const setTyping = useCallback((conversationId, userAddress) => {
    const key = `${conversationId}-${userAddress}`;
    setTypingUsers((prev) => ({ ...prev, [key]: Date.now() }));
    // Auto-clear after 5 seconds
    setTimeout(() => {
      setTypingUsers((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }, 5000);
  }, []);

  /**
   * Check if someone is typing in a conversation.
   */
  const isTyping = useCallback(
    (conversationId, userAddress) => {
      const key = `${conversationId}-${userAddress}`;
      const ts = typingUsers[key];
      if (!ts) return false;
      return Date.now() - ts < 5000;
    },
    [typingUsers]
  );

  /**
   * Add/update contact.
   */
  const addContact = useCallback((contact) => {
    if (!contact || !contact.address) {
      console.warn("[ChatContext] Skipping addContact: malformed contact object", contact);
      return;
    }
    setContacts((prev) => {
      const existing = prev.findIndex((c) => c.address === contact.address);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...updated[existing], ...contact };
        return updated;
      }
      return [...prev, contact];
    });
  }, []);

  /**
   * Add/update group.
   */
  const addGroup = useCallback((group) => {
    setGroups((prev) => {
      const existing = prev.findIndex((g) => g.groupId === group.groupId);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...updated[existing], ...group };
        return updated;
      }
      return [...prev, group];
    });
  }, []);

  /**
   * Pin a message.
   */
  const pinMessage = useCallback((conversationId, messageId) => {
    setPinnedMessages((prev) => {
      const existing = prev[conversationId] || [];
      if (existing.includes(messageId)) return prev;
      return { ...prev, [conversationId]: [...existing, messageId] };
    });
  }, []);

  /**
   * Unpin a message.
   */
  const unpinMessage = useCallback((conversationId, messageId) => {
    setPinnedMessages((prev) => {
      const existing = prev[conversationId] || [];
      return {
        ...prev,
        [conversationId]: existing.filter((id) => id !== messageId),
      };
    });
  }, []);

  /**
   * Block/unblock a user.
   */
  const toggleBlockUser = useCallback((address) => {
    setBlockedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(address)) {
        next.delete(address);
      } else {
        next.add(address);
      }
      return next;
    });
  }, []);

  /**
   * Check if user is blocked.
   */
  const isBlocked = useCallback(
    (address) => blockedUsers.has(address),
    [blockedUsers]
  );

  /**
   * Add a reaction to a message.
   */
  const addReaction = useCallback((messageId, emoji, userAddress) => {
    setReactions((prev) => {
      const existing = prev[messageId] || {};
      const users = existing[emoji] || [];
      if (users.includes(userAddress)) {
        // Remove reaction
        const filtered = users.filter((u) => u !== userAddress);
        const next = { ...existing, [emoji]: filtered };
        if (filtered.length === 0) delete next[emoji];
        return { ...prev, [messageId]: next };
      }
      return { ...prev, [messageId]: { ...existing, [emoji]: [...users, userAddress] } };
    });
  }, []);

  /**
   * Set reply target.
   */
  const setReplyTo = useCallback((message) => {
    setReplyingTo(message);
  }, []);

  /**
   * Clear reply target.
   */
  const clearReplyTo = useCallback(() => {
    setReplyingTo(null);
  }, []);

  /**
   * Get messages for a conversation.
   */
  const getMessages = useCallback(
    (conversationId) => {
      return messages[conversationId.toLowerCase()] || [];
    },
    [messages]
  );

  /**
   * Get pinned messages for a conversation.
   */
  const getPinned = useCallback(
    (conversationId) => {
      const ids = pinnedMessages[conversationId] || [];
      const msgs = messages[conversationId] || [];
      return ids.map((id) => msgs.find((m) => m.messageId === id)).filter(Boolean);
    },
    [pinnedMessages, messages]
  );

  /**
   * Filter messages by search query.
   */
  const searchMessages = useCallback(
    (conversationId, query) => {
      if (!query) return [];
      const msgs = messages[conversationId] || [];
      const lower = query.toLowerCase();
      return msgs.filter((m) =>
        m.content?.toLowerCase().includes(lower)
      );
    },
    [messages]
  );

  const value = {
    activeConversation,
    setActiveConversation,
    messages,
    addMessage,
    updateMessage,
    deleteMessage,
    markAsRead,
    typingUsers,
    setTyping,
    isTyping,
    contacts,
    setContacts,
    addContact,
    groups,
    setGroups,
    addGroup,
    onlineUsers,
    setOnlineUsers,
    pinnedMessages,
    pinMessage,
    unpinMessage,
    getPinned,
    blockedUsers,
    toggleBlockUser,
    isBlocked,
    reactions,
    addReaction,
    replyingTo,
    setReplyTo,
    clearReplyTo,
    searchQuery,
    setSearchQuery,
    getMessages,
    searchMessages,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
