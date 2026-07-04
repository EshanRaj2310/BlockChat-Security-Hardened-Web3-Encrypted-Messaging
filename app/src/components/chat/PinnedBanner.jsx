import { useState } from "react";
import { Pin, X, ChevronDown, ChevronUp } from "lucide-react";

/**
 * PinnedBanner — displays pinned messages at the top of chat.
 */
export function PinnedBanner({ pinnedMessages, onUnpin }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!pinnedMessages || pinnedMessages.length === 0) return null;

  const displayMessages = isExpanded
    ? pinnedMessages
    : pinnedMessages.slice(0, 1);

  return (
    <div className="border-b border-border bg-amber-500/5">
      {displayMessages.map((msg) => (
        <div
          key={msg.messageId}
          className="flex items-start gap-2 px-4 py-2.5"
        >
          <Pin className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-amber-600 font-medium mb-0.5">
              Pinned Message
            </p>
            <p className="text-sm text-foreground truncate">
              {msg.content}
            </p>
          </div>
          <button
            onClick={() => onUnpin?.(msg.messageId)}
            className="p-1 hover:bg-amber-500/10 rounded transition-colors shrink-0"
          >
            <X className="w-3 h-3 text-amber-500" />
          </button>
        </div>
      ))}
      {pinnedMessages.length > 1 && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-center gap-1 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-3 h-3" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" />
              {pinnedMessages.length - 1} more pinned
            </>
          )}
        </button>
      )}
    </div>
  );
}
