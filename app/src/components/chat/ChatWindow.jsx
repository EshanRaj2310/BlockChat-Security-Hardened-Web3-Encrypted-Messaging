import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/context/ChatContext";
import { useSocket } from "@/hooks/useSocket";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { TypingIndicator } from "./TypingIndicator";
import { PinnedBanner } from "./PinnedBanner";
import { ImageViewer } from "@/components/media/ImageViewer";
import { VideoPlayer } from "@/components/media/VideoPlayer";
import { FileAttachment } from "@/components/media/FileAttachment";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { toast } from "sonner";
import {
  truncateAddress,
  formatDateShort,
} from "@/utils/formatting";
import {
  buildEncryptedBlob,
  uploadToIPFS,
  downloadFromIPFS,
  parseEncryptedBlob,
  createObjectURLFromBuffer,
  getMessageTypeFromMime,
} from "@/utils/ipfs";
import { validateFile } from "@/security";
import { sanitizeText } from "@/security";
import {
  Phone,
  Video,
  MoreVertical,
  ArrowLeft,
  Search,
  Pin,
  Loader2,
  Ghost,
} from "lucide-react";

/**
 * ChatWindow — main chat panel with messages, input, header.
 *
 * SECURITY CHANGES:
 * - File validation uses security/fileValidation (magic number + size + type)
 * - Encrypted blob includes messageNonce for per-message key derivation
 * - Fetch requests include Authorization header (fix N2)
 * - No direct crypto imports — uses useAuth() hook
 */
export function ChatWindow({
  conversation,
  onBack,
  onCall,
  isMobile = false,
}) {
  const {
    address,
    token,
    getToken,
    isAnonymous,
    encryptMessage,
    encryptFile,
    decryptMessage,
    decryptFile,
    generateEphemeralIdentity,
    unwrapKey,
    encryptGroupMsg,
  } = useAuth();
  const {
    messages,
    addMessage,
    updateMessage,
    deleteMessage,
    markAsRead,
    pinMessage,
    unpinMessage,
    getPinned,
    contacts,
    groups,
    setTyping,
    addContact,
    replyingTo,
    setReplyTo,
    clearReplyTo,
  } = useChat();
  const { emit, emitImmediate } = useSocket();

  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [contactInfoOpen, setContactInfoOpen] = useState(false);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const messagesEndRef = useRef(null);
  const containerRef = useRef(null);

  const convId = conversation?.id;
  const isGroup = conversation?.type === "group";
  const convMessages = useMemo(() => {
    if (!convId) return [];
    const msgs = messages[convId] || [];
    // Deterministic sort: Server TS -> Client TS -> ID tie-breaker
    return [...msgs].sort((a, b) => {
      const tsA = a.serverTimestamp || a.clientTimestamp || a.timestamp || 0;
      const tsB = b.serverTimestamp || b.clientTimestamp || b.timestamp || 0;
      if (tsA !== tsB) return tsA - tsB;
      return (a.messageId || "").localeCompare(b.messageId || "");
    });
  }, [messages, convId]);
  const pinned = convId ? getPinned(convId) : [];

  // Get contact/group info
  const contact = (isGroup || !convId)
    ? null
    : contacts.find((c) => c.address === convId) || { address: convId };
  const group = (isGroup && convId)
    ? groups.find((g) => g.groupId === convId) || { groupId: convId, name: "Unknown Group" }
    : null;

  const displayName = isGroup
    ? (group?.name || "Unknown Group")
    : (contact?.username || truncateAddress(contact?.address) || "Unknown User");

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [convMessages.length]);

  // Send a text message
  const handleSend = useCallback(
    async (text, options = {}) => {
      if (!convId) return;
      console.log("[ChatWindow] handleSend triggered:", text.slice(0, 20));
      console.log("[ChatWindow] handleSend triggered:", text.slice(0, 20));

      try {
        // Encrypt message
        let encrypted;
        if (isGroup) {
          let groupKey = group?.key;
          if (!groupKey) {
            const res = await fetch(`http://localhost:5000/api/groups/${convId}`, {
              headers: { Authorization: `Bearer ${getToken()}` },
            });
            if (res.status === 401) {
              throw new Error("Session expired. Please log in again.");
            }
            if (!res.ok) throw new Error("Group not found");
            const groupData = await res.json();
            if (!groupData.wrappedKey) throw new Error("No access to group key");
            groupKey = await unwrapKey(groupData.wrappedKey);
          }
          encrypted = await encryptGroupMsg(groupKey, text);
        } else {
          // KEY CACHING: check contacts first before hitting API
          const cachedContact = contacts.find((c) => c.address === convId);
          let recipientPubKey = cachedContact?.publicKey;

          if (!recipientPubKey) {
            const res = await fetch(`http://localhost:5000/api/users/${convId}`, {
              headers: { Authorization: `Bearer ${getToken()}` },
            });
            if (res.status === 401) {
              throw new Error("Session expired. Please log in again.");
            }
            if (!res.ok) throw new Error("User not found");
            const userData = await res.json();
            recipientPubKey = userData.publicKey;
          }
          
          if (!recipientPubKey) throw new Error("Recipient has no public key");
          encrypted = await encryptMessage(recipientPubKey, text);
        }

        // Build and upload encrypted blob
        const blob = buildEncryptedBlob({
          iv: encrypted.iv,
          ciphertext: encrypted.ciphertext,
          ephemeralPub: encrypted.ephemeralPubBase64,
          type: "text",
          messageNonce: encrypted.messageNonce,
        });
        setIsUploading(true);
        setUploadProgress(0);
        const cid = await uploadToIPFS(blob, getToken(), (p) => setUploadProgress(p));
        setIsUploading(false);

        const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const localTimestamp = Date.now();

        // 1. Optimistic local update
        addMessage(convId, {
          messageId,
          from: address,
          to: convId,
          content: text,
          type: "text",
          clientTimestamp: localTimestamp,
          timestamp: localTimestamp, // backward compatibility
          status: "pending",
          selfDestruct: options.selfDestruct || undefined,
          replyTo: replyingTo
            ? {
                messageId: replyingTo.messageId,
                content: sanitizeText(replyingTo.content, 200),
              }
            : undefined,
        });

        // 2. Build payload and emit
        const event = isGroup ? "send_group_msg" : "send_message";
        const payload = isGroup 
          ? { groupId: convId, messageId, cid, type: "text", iv: encrypted.iv, messageNonce: encrypted.messageNonce, timestamp: localTimestamp }
          : { to: convId, messageId, cid, type: "text", iv: encrypted.iv, ephemeralPub: encrypted.ephemeralPubBase64, messageNonce: encrypted.messageNonce, selfDestruct: options.selfDestruct || undefined, timestamp: localTimestamp };

        emit(event, payload, (ack) => {
          if (ack?.success) {
            // 3. Update with server's canonical timestamp and status
            updateMessage(convId, messageId, { 
              status: "sent", // explicit: server ACK means sent
              serverTimestamp: ack.timestamp,
              serverSynced: true
            });
          } else if (ack?.duplicated) {
            // Already processed by server — ensure UI shows as sent
            updateMessage(convId, messageId, { status: "sent", serverSynced: true });
          } else {
            updateMessage(convId, messageId, { status: "failed" });
          }
        });
      } catch (err) {
        console.error("Failed to send message:", err);
        setIsUploading(false);
        throw err;
      }
    },
    [
      convId,
      isGroup,
      isAnonymous,
      address,
      encryptMessage,
      generateEphemeralIdentity,
      emit,
      addMessage,
      replyingTo,
      getToken,
      unwrapKey,
      encryptGroupMsg,
    ]
  );

  // Send a file — FIX F1: use security/fileValidation
  const handleSendFile = useCallback(
    async (file) => {
      if (!convId) return;

      // Full file validation: size + MIME + magic number
      const validation = await validateFile(file);
      if (!validation.valid) {
        toast.error(validation.error);
        return;
      }

      try {
        // Read file
        const buffer = await file.arrayBuffer();

        // Encrypt file
        let encrypted;
        if (isGroup) {
          let groupKey = group?.key;
          if (!groupKey) {
            const res = await fetch(`http://localhost:5000/api/groups/${convId}`, {
              headers: { Authorization: `Bearer ${getToken()}` },
            });
            if (!res.ok) throw new Error("Group not found");
            const groupData = await res.json();
            if (!groupData.wrappedKey) throw new Error("No access to group key");
            groupKey = await unwrapKey(groupData.wrappedKey);
          }
          encrypted = await encryptGroupMsg(groupKey, new Uint8Array(buffer));
        } else {
          const res = await fetch(`http://localhost:5000/api/users/${convId}`, {
            headers: { Authorization: `Bearer ${getToken()}` },
          });
          if (!res.ok) throw new Error("User not found");
          const userData = await res.json();
          if (!userData.publicKey) throw new Error("Recipient has no public key");
          encrypted = await encryptFile(userData.publicKey, new Uint8Array(buffer));
        }

        // Build and upload encrypted blob
        const blob = buildEncryptedBlob({
          iv: encrypted.iv,
          ciphertext: encrypted.ciphertext,
          ephemeralPub: encrypted.ephemeralPubBase64,
          type: getMessageTypeFromMime(file.type),
          filename: file.name,
          mime: file.type,
          messageNonce: encrypted.messageNonce,
        });
        setIsUploading(true);
        setUploadProgress(0);
        const cid = await uploadToIPFS(blob, getToken(), (p) => setUploadProgress(p));
        setIsUploading(false);

        const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const timestamp = Date.now();

        // Add to state with file info (optimistic)
        const isImage = file.type.startsWith("image/");
        const objectUrl = isImage ? URL.createObjectURL(file) : null;

        addMessage(convId, {
          messageId,
          from: address,
          to: convId,
          content: file.name,
          type: getMessageTypeFromMime(file.type),
          clientTimestamp: timestamp,
          timestamp,
          status: "pending",
          fileUrl: objectUrl,
          fileSize: file.size,
          fileName: file.name,
          mime: file.type,
        });

        // Emit with ACK
        const event = isGroup ? "send_group_msg" : "send_message";
        const payload = isGroup
          ? { groupId: convId, messageId, cid, type: getMessageTypeFromMime(file.type), iv: encrypted.iv, messageNonce: encrypted.messageNonce, timestamp }
          : { to: convId, messageId, cid, type: getMessageTypeFromMime(file.type), iv: encrypted.iv, ephemeralPub: encrypted.ephemeralPubBase64, messageNonce: encrypted.messageNonce, timestamp };

        emit(event, payload, (ack) => {
          if (ack?.success) {
            updateMessage(convId, messageId, { 
              status: "sent",
              serverTimestamp: ack.timestamp,
              serverSynced: true
            });
          } else if (ack?.duplicated) {
            updateMessage(convId, messageId, { status: "sent", serverSynced: true });
          } else {
            updateMessage(convId, messageId, { status: "failed" });
          }
        });
      } catch (err) {
        toast.error("Failed to upload attachment");
        console.error("Failed to send file:", err);
        setIsUploading(false);
        throw err; // Propagate error
      }
    },
    [convId, isGroup, address, encryptMessage, emit, addMessage, getToken]
  );

  // Typing indicator — use emitImmediate (non-sensitive, no jitter needed)
  const handleTyping = useCallback(() => {
    emitImmediate("typing", { to: convId });
  }, [emitImmediate, convId]);

  // Message actions
  const handleReply = useCallback(
    (message) => {
      setReplyTo(message);
    },
    [setReplyTo]
  );

  const handleEdit = useCallback(
    (messageId, newContent) => {
      updateMessage(convId, messageId, { content: sanitizeText(newContent), edited: true });
    },
    [convId, updateMessage]
  );

  const handleDelete = useCallback(
    (messageId, forEveryone) => {
      deleteMessage(convId, messageId);
    },
    [convId, deleteMessage]
  );

  const handlePin = useCallback(
    (messageId) => {
      pinMessage(convId, messageId);
    },
    [convId, pinMessage]
  );

  const handleUnpin = useCallback(
    (messageId) => {
      unpinMessage(convId, messageId);
    },
    [convId, unpinMessage]
  );

  const handleReact = useCallback(
    (messageId, emoji) => {
      // Emit reaction via socket
      // emit("reaction", { messageId, emoji, to: convId });
    },
    [convId]
  );

  // Search filter
  const filteredMessages = searchQuery
    ? convMessages.filter((m) =>
        m.content?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : convMessages;

  // Group messages by date
  const groupedMessages = filteredMessages.reduce((acc, msg) => {
    const date = new Date(msg.timestamp).toDateString();
    if (!acc[date]) acc[date] = [];
    acc[date].push(msg);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
        {isMobile && (
          <button
            onClick={onBack}
            className="p-2 -ml-2 hover:bg-muted rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}

        <div className="relative">
          {isGroup ? (
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-sm font-semibold text-primary">
                {(group?.name || "G").charAt(0).toUpperCase()}
              </span>
            </div>
          ) : (
            <Avatar
              address={contact?.address}
              username={contact?.username}
              src={contact?.avatar}
              size="md"
            />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm truncate">{displayName}</h3>
          <p className="text-xs text-muted-foreground">
            {isGroup
              ? `${group?.members?.length || 0} members`
              : "Encrypted"}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onCall?.(convId, false)}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            title="Voice call"
          >
            <Phone className="w-5 h-5" />
          </button>
          <button
            onClick={() => onCall?.(convId, true)}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            title="Video call"
          >
            <Video className="w-5 h-5" />
          </button>
          <button
            onClick={() => setSearchOpen(!searchOpen)}
            className={`p-2 rounded-lg transition-colors ${
              searchOpen ? "bg-primary/10 text-primary" : "hover:bg-muted"
            }`}
            title="Search"
          >
            <Search className="w-5 h-5" />
          </button>
          <button
            onClick={() => setContactInfoOpen(true)}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div className="px-4 py-2 border-b border-border flex items-center gap-2 animate-in slide-in-from-top-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search in conversation..."
            className="flex-1 bg-transparent text-sm outline-none"
            autoFocus
          />
          <button
            onClick={() => {
              setSearchOpen(false);
              setSearchQuery("");
            }}
            className="p-1 hover:bg-muted rounded"
          >
            <span className="text-xs text-muted-foreground">ESC</span>
          </button>
        </div>
      )}

      {/* Pinned messages */}
      <PinnedBanner pinnedMessages={pinned} onUnpin={handleUnpin} />

      {/* Messages */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-2 py-4 space-y-1"
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            {searchQuery ? (
              <>
                <Search className="w-10 h-10 mb-3 opacity-40" />
                <p className="text-sm">No messages match your search</p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <span className="text-2xl">🔒</span>
                </div>
                <p className="text-sm font-medium mb-1">
                  {isGroup ? group?.name : displayName}
                </p>
                <p className="text-xs">
                  Messages are end-to-end encrypted
                </p>
              </>
            )}
          </div>
        ) : (
          Object.entries(groupedMessages).map(([date, msgs]) => (
            <div key={date}>
              {/* Date separator */}
              <div className="flex items-center justify-center my-4">
                <span className="px-3 py-1 bg-muted rounded-full text-[11px] text-muted-foreground">
                  {formatDateShort(date)}
                </span>
              </div>
              {msgs.map((msg) => (
                <div key={msg.messageId} className="mb-1">
                  {msg.type === "image" && msg.fileUrl ? (
                    <div
                      className={`flex px-4 py-1 ${
                        msg.from === address ? "justify-end" : "justify-start"
                      }`}
                    >
                      <ImageViewer src={msg.fileUrl} />
                    </div>
                  ) : msg.type === "video" && msg.fileUrl ? (
                    <div
                      className={`flex px-4 py-1 ${
                        msg.from === address ? "justify-end" : "justify-start"
                      }`}
                    >
                      <VideoPlayer src={msg.fileUrl} mime={msg.mime} />
                    </div>
                  ) : msg.type === "file" || msg.type === "audio" ? (
                    <div
                      className={`flex px-4 py-1 ${
                        msg.from === address ? "justify-end" : "justify-start"
                      }`}
                    >
                      <FileAttachment
                        name={msg.fileName || msg.content}
                        size={msg.fileSize || 0}
                        mime={msg.mime || "application/octet-stream"}
                        url={msg.fileUrl}
                      />
                    </div>
                  ) : (
                    <MessageBubble
                      message={msg}
                      isOwn={msg.from === address}
                      onReply={handleReply}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onPin={handlePin}
                      onReact={handleReact}
                      contact={contact}
                    />
                  )}
                </div>
              ))}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Upload progress */}
      {isUploading && (
        <div className="px-4 py-2 bg-muted border-t border-border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />
            Uploading... {uploadProgress}%
            <div className="flex-1 h-1 bg-muted-foreground/20 rounded-full">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Message input */}
      <MessageInput
        onSend={handleSend}
        onSendFile={handleSendFile}
        onTyping={handleTyping}
        replyingTo={replyingTo}
        onClearReply={clearReplyTo}
        isUploading={isUploading}
      />
    </div>
  );
}
