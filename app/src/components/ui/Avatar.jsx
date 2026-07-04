import { getInitials, getAvatarColor } from "@/utils/formatting";

/**
 * Avatar — displays user avatar with fallback to initials.
 */
export function Avatar({ address, username, src, size = "md", className = "" }) {
  const displayName = username || address || "?";
  const initials = getInitials(displayName);
  const colorClass = getAvatarColor(address || username || "");

  const sizeClasses = {
    xs: "w-6 h-6 text-[10px]",
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-12 h-12 text-base",
    xl: "w-16 h-16 text-lg",
  };

  if (src) {
    return (
      <img
        src={src}
        alt={displayName}
        className={`${sizeClasses[size]} rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} ${colorClass} rounded-full flex items-center justify-center text-white font-semibold shrink-0 ${className}`}
    >
      {initials}
    </div>
  );
}
