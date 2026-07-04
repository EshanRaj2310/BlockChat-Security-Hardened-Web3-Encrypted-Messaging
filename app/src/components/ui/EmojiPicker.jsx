import { useState, useRef, useEffect } from "react";
import EmojiPickerReact from "emoji-picker-react";
import { Smile } from "lucide-react";

/**
 * EmojiPicker — wrapper around emoji-picker-react with toggle button.
 */
export function EmojiPicker({ onEmojiSelect, position = "top" }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleEmojiClick = (emojiData) => {
    onEmojiSelect(emojiData.emoji);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        title="Add emoji"
      >
        <Smile className="w-5 h-5" />
      </button>
      {isOpen && (
        <div
          className={`absolute z-50 ${position === "top" ? "bottom-full mb-2" : "top-full mt-2"} right-0`}
        >
          <EmojiPickerReact
            onEmojiClick={handleEmojiClick}
            autoFocusSearch={false}
            width={280}
            height={350}
          />
        </div>
      )}
    </div>
  );
}
