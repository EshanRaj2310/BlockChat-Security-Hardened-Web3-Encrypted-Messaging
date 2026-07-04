import { X } from "lucide-react";

/**
 * ReplyPreview — shows quoted message above input.
 */
export function ReplyPreview({ message, onClear }) {
  if (!message) return null;

  const previewText =
    message.content?.substring(0, 60) + (message.content?.length > 60 ? "..." : "");

  return (
    <div className="flex items-start gap-2 px-4 py-2.5 bg-muted/50 border-t border-border animate-in slide-in-from-bottom-2 duration-200">
      <div className="flex-1 min-w-0 border-l-2 border-primary pl-3">
        <p className="text-xs text-primary font-medium">
          {message.senderName || "Replying to message"}
        </p>
        <p className="text-xs text-muted-foreground truncate">{previewText}</p>
      </div>
      <button
        onClick={onClear}
        className="p-1 hover:bg-muted rounded transition-colors shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
