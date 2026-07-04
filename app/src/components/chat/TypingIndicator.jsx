/**
 * TypingIndicator — animated dots showing someone is typing.
 */
export function TypingIndicator({ username }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <div className="flex items-center gap-1.5 bg-muted rounded-2xl px-4 py-2.5">
        <div className="flex gap-1">
          <span
            className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"
            style={{ animationDelay: "300ms" }}
          />
        </div>
      </div>
      {username && (
        <span className="text-xs text-muted-foreground">{username} is typing...</span>
      )}
    </div>
  );
}
