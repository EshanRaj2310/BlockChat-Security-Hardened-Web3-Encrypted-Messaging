import { useState, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { EmojiPicker } from "@/components/ui/EmojiPicker";
import { ReplyPreview } from "./ReplyPreview";
import { VoiceRecorder } from "@/components/media/VoiceRecorder";
import {
  Paperclip,
  Send,
  Ghost,
  Timer,
  ChevronDown,
  X,
  Loader2,
  Image,
  Video,
  FileText,
} from "lucide-react";
import { SELF_DESTRUCT_OPTIONS } from "@/utils/formatting";

/**
 * MessageInput — text input with emoji, attachments, reply, self-destruct.
 */
export function MessageInput({
  onSend,
  onSendFile,
  onTyping,
  replyingTo,
  onClearReply,
  isUploading = false,
}) {
  const { isAnonymous } = useAuth();
  const [text, setText] = useState("");
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showSelfDestruct, setShowSelfDestruct] = useState(false);
  const [selfDestructTimer, setSelfDestructTimer] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const inputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed && !isRecording) return;
    try {
      await onSend?.(trimmed, {
        selfDestruct: selfDestructTimer,
      });
      setText("");
      setSelfDestructTimer(null);
      onClearReply?.();
      inputRef.current?.focus();
    } catch (err) {
      console.error("Failed to send message:", err);
      // Keep text in input so user can retry
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTyping = () => {
    onTyping?.();
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      // Typing stopped
    }, 3000);
  };

  const handleEmojiSelect = (emoji) => {
    setText((prev) => prev + emoji);
    inputRef.current?.focus();
  };

  const handleFileSelect = (type) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = type;
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (file) onSendFile?.(file);
    };
    input.click();
    setShowAttachMenu(false);
  };

  const handleVoiceSend = (blob, mime) => {
    const file = new File([blob], `voice-${Date.now()}.webm`, { type: mime });
    onSendFile?.(file);
    setIsRecording(false);
  };

  return (
    <div className="border-t border-border bg-background">
      {/* Reply preview */}
      {replyingTo && (
        <ReplyPreview message={replyingTo} onClear={onClearReply} />
      )}

      {/* Self-destruct bar */}
      {selfDestructTimer && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-amber-500/5 border-t border-border/50">
          <Timer className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-xs text-amber-600">
            Self-destruct in{" "}
            {SELF_DESTRUCT_OPTIONS.find((o) => o.value === selfDestructTimer)
              ?.label || `${selfDestructTimer}s`}
          </span>
          <button
            onClick={() => setSelfDestructTimer(null)}
            className="p-0.5 hover:bg-amber-500/10 rounded"
          >
            <X className="w-3 h-3 text-amber-500" />
          </button>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2 px-4 py-3">
        {/* Anonymous indicator */}
        {isAnonymous && (
          <div className="p-2.5 text-muted-foreground" title="Anonymous mode">
            <Ghost className="w-5 h-5" />
          </div>
        )}

        {/* Attachment */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowAttachMenu(!showAttachMenu)}
            className="p-2.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          {showAttachMenu && (
            <div className="absolute bottom-full left-0 mb-2 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[140px] z-50 animate-in fade-in zoom-in-95">
              <button
                onClick={() => handleFileSelect("image/*")}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
              >
                <Image className="w-4 h-4" />
                Photo
              </button>
              <button
                onClick={() => handleFileSelect("video/*")}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
              >
                <Video className="w-4 h-4" />
                Video
              </button>
              <button
                onClick={() => handleFileSelect("*/*")}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
              >
                <FileText className="w-4 h-4" />
                Document
              </button>
              <div className="border-t border-border my-1" />
              <button
                onClick={() => {
                  setShowSelfDestruct(!showSelfDestruct);
                  setShowAttachMenu(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors"
              >
                <Timer className="w-4 h-4" />
                Self-Destruct
              </button>
            </div>
          )}
        </div>

        {/* Text input */}
        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              handleTyping();
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              isAnonymous
                ? "Send anonymously..."
                : "Type a message..."
            }
            rows={1}
            className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm resize-none outline-none border border-transparent focus:border-primary focus:ring-1 focus:ring-primary transition-all max-h-[120px] min-h-[40px]"
            style={{ height: "auto" }}
          />
        </div>

        {/* Emoji picker */}
        <EmojiPicker onEmojiSelect={handleEmojiSelect} />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={(!text.trim() && !isRecording) || isUploading}
          className="p-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {isUploading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Self-destruct picker */}
      {showSelfDestruct && (
        <div className="px-4 pb-3 animate-in fade-in">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-xs text-muted-foreground shrink-0">
              Timer:
            </span>
            {SELF_DESTRUCT_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  setSelfDestructTimer(option.value);
                  setShowSelfDestruct(false);
                }}
                className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors ${
                  selfDestructTimer === option.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/80"
                }`}
              >
                {option.label}
              </button>
            ))}
            <button
              onClick={() => setShowSelfDestruct(false)}
              className="p-1 hover:bg-muted rounded"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
