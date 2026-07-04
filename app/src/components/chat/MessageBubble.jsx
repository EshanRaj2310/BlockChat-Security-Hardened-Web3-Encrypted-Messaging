import { useState, useCallback, useEffect, useRef } from "react";
import { sanitizeText } from "@/security";
import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/context/ChatContext";
import { Avatar } from "@/components/ui/Avatar";
import {
  truncateAddress,
  formatTime,
  isEditable,
  getSelfDestructCountdown,
} from "@/utils/formatting";
import {
  Check,
  CheckCheck,
  Reply,
  Pencil,
  Trash2,
  Pin,
  Smile,
  Timer,
  Ghost,
  MoreHorizontal,
  X,
  Save,
} from "lucide-react";

/**
 * MessageBubble — individual message with actions.
 */
export function MessageBubble({
  message,
  isOwn,
  onReply,
  onEdit,
  onDelete,
  onPin,
  onReact,
  contact,
}) {
  const { address } = useAuth();
  const { reactions, addReaction } = useChat();
  const [showMenu, setShowMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content || "");
  const [countdown, setCountdown] = useState(null);
  const [isDestroyed, setIsDestroyed] = useState(false);
  const menuRef = useRef(null);
  const timerRef = useRef(null);

  const canEdit = isOwn && isEditable(message.timestamp) && message.type === "text";
  const selfDestruct = message.selfDestruct;
  const messageReactions = reactions[message.messageId] || {};

  // Self-destruct timer
  useEffect(() => {
    if (!selfDestruct || !message.timestamp) return;
    const expiresAt = new Date(message.timestamp).getTime() + selfDestruct * 1000;
    
    const update = () => {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        setIsDestroyed(true);
        clearInterval(timerRef.current);
        onDelete?.(message.messageId, true);
      } else {
        setCountdown(getSelfDestructCountdown(expiresAt));
      }
    };
    update();
    timerRef.current = setInterval(update, 1000);
    return () => clearInterval(timerRef.current);
  }, [selfDestruct, message.timestamp, message.messageId, onDelete]);

  // Close menu on click outside
  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleEdit = () => {
    if (isEditing) {
      if (editContent.trim() && editContent !== message.content) {
        onEdit?.(message.messageId, editContent.trim());
      }
      setIsEditing(false);
    } else {
      setIsEditing(true);
      setEditContent(message.content || "");
    }
    setShowMenu(false);
  };

  const handleDelete = (forEveryone = false) => {
    onDelete?.(message.messageId, forEveryone);
    setShowMenu(false);
  };

  const handleReact = (emoji) => {
    addReaction(message.messageId, emoji, address);
    onReact?.(message.messageId, emoji);
    setShowEmojiPicker(false);
  };

  const statusIcon = () => {
    if (!isOwn) return null;
    switch (message.status) {
      case "sent":
        return <Check className="w-3 h-3 text-muted-foreground" />;
      case "delivered":
        return <CheckCheck className="w-3 h-3 text-muted-foreground" />;
      case "read":
        return <CheckCheck className="w-3 h-3 text-blue-500" />;
      default:
        return <Check className="w-3 h-3 text-muted-foreground" />;
    }
  };

  const commonEmojis = ["👍", "❤️", "😂", "😮", "😢", "🔥", "👏", "🎉"];

  if (isDestroyed) {
    return (
      <div className={`flex gap-2 px-4 py-1 ${isOwn ? "flex-row-reverse" : ""}`}>
        <div
          className={`max-w-[70%] px-3 py-2 rounded-xl text-xs text-muted-foreground italic bg-muted ${
            isOwn ? "rounded-br-sm" : "rounded-bl-sm"
          }`}
        >
          This message has self-destructed
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex gap-2 px-4 py-1 group ${isOwn ? "flex-row-reverse" : ""}`}
      onContextMenu={(e) => {
        e.preventDefault();
        setShowMenu(true);
      }}
    >
      {/* Avatar (only for others) */}
      {!isOwn && contact && (
        <Avatar
          address={contact.address}
          username={contact.username}
          src={contact.avatar}
          size="sm"
        />
      )}

      {/* Message content */}
      <div className="relative max-w-[70%]">
        {/* Sender name (only for others in groups) */}
        {!isOwn && message.senderName && (
          <p className="text-xs text-muted-foreground mb-0.5 ml-1">
            {sanitizeText(message.senderName, 64)}
          </p>
        )}

        <div
          className={`relative px-3 py-2 rounded-xl ${
            isOwn
              ? "bg-primary text-primary-foreground rounded-br-sm"
              : "bg-muted rounded-bl-sm"
          }`}
        >
          {/* Reply preview */}
          {message.replyTo && (
            <div
              className={`mb-1.5 pl-2 border-l-2 ${
                isOwn ? "border-primary-foreground/30" : "border-primary/30"
              }`}
            >
              <p
                className={`text-xs ${
                  isOwn ? "text-primary-foreground/60" : "text-muted-foreground"
                } truncate`}
              >
                {sanitizeText(message.replyTo.content, 200)}
              </p>
            </div>
          )}

          {/* Edited badge */}
          {message.edited && (
            <span
              className={`text-[10px] ${
                isOwn ? "text-primary-foreground/50" : "text-muted-foreground"
              } mr-1`}
            >
              edited
            </span>
          )}

          {/* Message content */}
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleEdit();
                  if (e.key === "Escape") {
                    setIsEditing(false);
                    setEditContent(message.content || "");
                  }
                }}
                className="flex-1 px-2 py-1 text-sm bg-background text-foreground rounded border border-primary/30 outline-none"
                autoFocus
              />
              <button onClick={handleEdit} className="p-1 hover:bg-primary/20 rounded">
                <Save className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setEditContent(message.content || "");
                }}
                className="p-1 hover:bg-primary/20 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <p className="text-sm whitespace-pre-wrap break-words">
              {sanitizeText(message.content)}
            </p>
          )}

          {/* Self-destruct countdown */}
          {selfDestruct && countdown && (
            <div
              className={`flex items-center gap-1 mt-1 text-[10px] ${
                isOwn ? "text-primary-foreground/60" : "text-muted-foreground"
              }`}
            >
              <Timer className="w-3 h-3" />
              {countdown}
            </div>
          )}

          {/* Time & status */}
          <div
            className={`flex items-center gap-1 mt-1 justify-end ${
              isOwn ? "text-primary-foreground/50" : "text-muted-foreground"
            }`}
          >
            <span className="text-[10px]">
              {formatTime(message.timestamp)}
            </span>
            {statusIcon()}
          </div>
        </div>

        {/* Reactions */}
        {Object.keys(messageReactions).length > 0 && (
          <div
            className={`flex flex-wrap gap-1 mt-1 ${isOwn ? "justify-end" : "justify-start"}`}
          >
            {Object.entries(messageReactions).map(([emoji, users]) =>
              users.length > 0 ? (
                <button
                  key={emoji}
                  onClick={() => handleReact(emoji)}
                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border ${
                    users.includes(address)
                      ? "bg-primary/10 border-primary/30"
                      : "bg-background border-border"
                  }`}
                >
                  {emoji} {users.length}
                </button>
              ) : null
            )}
          </div>
        )}
      </div>

      {/* Hover actions */}
      <div
        className={`opacity-0 group-hover:opacity-100 transition-opacity flex items-start pt-2 ${
          isOwn ? "flex-row-reverse" : ""
        }`}
      >
        <button
          onClick={() => onReply?.(message)}
          className="p-1 hover:bg-muted rounded transition-colors"
          title="Reply"
        >
          <Reply className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        <button
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className="p-1 hover:bg-muted rounded transition-colors relative"
          title="React"
        >
          <Smile className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Context Menu */}
      {showMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[140px] animate-in fade-in zoom-in-95"
          style={{
            top: "50%",
            left: isOwn ? "auto" : "50%",
            right: isOwn ? "50%" : "auto",
          }}
        >
          <button
            onClick={() => {
              onReply?.(message);
              setShowMenu(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
          >
            <Reply className="w-4 h-4" />
            Reply
          </button>
          <button
            onClick={() => {
              setShowEmojiPicker(!showEmojiPicker);
              setShowMenu(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
          >
            <Smile className="w-4 h-4" />
            React
          </button>
          <button
            onClick={() => {
              onPin?.(message.messageId);
              setShowMenu(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
          >
            <Pin className="w-4 h-4" />
            Pin
          </button>
          {canEdit && (
            <button
              onClick={handleEdit}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
            >
              <Pencil className="w-4 h-4" />
              Edit
            </button>
          )}
          {isOwn && (
            <>
              <button
                onClick={() => handleDelete(true)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete for Everyone
              </button>
              <button
                onClick={() => handleDelete(false)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete for Me
              </button>
            </>
          )}
        </div>
      )}

      {/* Emoji Picker Popup */}
      {showEmojiPicker && (
        <div className="absolute z-50 mt-1 p-2 bg-popover border border-border rounded-lg shadow-lg flex gap-1 animate-in fade-in">
          {commonEmojis.map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleReact(emoji)}
              className="p-1.5 hover:bg-muted rounded transition-colors text-lg"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
