/**
 * Skeleton — loading placeholder with shimmer animation.
 */
export function Skeleton({ className = "" }) {
  return (
    <div
      className={`animate-pulse bg-muted rounded-md ${className}`}
    />
  );
}

/**
 * Skeleton circle — for avatar placeholders.
 */
export function SkeletonCircle({ size = "md" }) {
  const sizes = {
    xs: "w-6 h-6",
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-12 h-12",
    xl: "w-16 h-16",
  };
  return <div className={`${sizes[size]} rounded-full bg-muted animate-pulse`} />;
}

/**
 * Message skeleton — placeholder for chat messages.
 */
export function MessageSkeleton({ isOwn = false }) {
  return (
    <div className={`flex gap-3 ${isOwn ? "flex-row-reverse" : ""}`}>
      <SkeletonCircle size="md" />
      <div className={`flex flex-col gap-2 max-w-[70%] ${isOwn ? "items-end" : "items-start"}`}>
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-16 w-48" />
      </div>
    </div>
  );
}

/**
 * Contact skeleton — placeholder for sidebar items.
 */
export function ContactSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <SkeletonCircle size="md" />
      <div className="flex flex-col gap-1.5 flex-1">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-2 w-32" />
      </div>
    </div>
  );
}
