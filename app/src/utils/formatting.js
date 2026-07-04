// ============================================================
// BlockChat Formatting Utilities
// ============================================================

/**
 * Truncate Ethereum address: 0x1234...abcd
 */
export function truncateAddress(address, startChars = 4, endChars = 4) {
  if (!address) return "";
  if (address.length <= startChars + endChars + 3) return address;
  return `${address.slice(0, startChars + 2)}...${address.slice(-endChars)}`;
}

/**
 * Format timestamp to relative time (e.g., "2m ago", "Just now").
 */
export function formatRelativeTime(timestamp) {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = now - then;

  const seconds = Math.floor(diff / 1000);
  if (seconds < 10) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  return formatDateShort(timestamp);
}

/**
 * Format timestamp to short date (e.g., "Apr 23").
 */
export function formatDateShort(timestamp) {
  const d = new Date(timestamp);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Format timestamp to full date + time.
 */
export function formatDateTime(timestamp) {
  const d = new Date(timestamp);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Format timestamp to time only (e.g., "2:30 PM").
 */
export function formatTime(timestamp) {
  const d = new Date(timestamp);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Format duration in seconds to mm:ss.
 */
export function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Self-destruct timer options.
 */
export const SELF_DESTRUCT_OPTIONS = [
  { label: "10 seconds", value: 10 },
  { label: "30 seconds", value: 30 },
  { label: "1 minute", value: 60 },
  { label: "5 minutes", value: 300 },
];

/**
 * Get initials from username or address.
 */
export function getInitials(name) {
  if (!name) return "?";
  if (name.startsWith("0x")) return name.slice(2, 4).toUpperCase();
  const parts = name.split(/\s+/);
  if (parts.length === 1) return name.slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Generate a color class based on address/username (for avatars).
 */
export function getAvatarColor(address) {
  if (!address) return "bg-gray-500";
  const colors = [
    "bg-red-500",
    "bg-orange-500",
    "bg-amber-500",
    "bg-green-500",
    "bg-emerald-500",
    "bg-teal-500",
    "bg-cyan-500",
    "bg-blue-500",
    "bg-indigo-500",
    "bg-violet-500",
    "bg-purple-500",
    "bg-fuchsia-500",
    "bg-pink-500",
    "bg-rose-500",
  ];
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = address.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
}

/**
 * Check if message is within editable window (5 minutes).
 */
export function isEditable(timestamp) {
  const fiveMinutes = 5 * 60 * 1000;
  return Date.now() - new Date(timestamp).getTime() < fiveMinutes;
}

/**
 * Generate a self-destruct countdown display.
 */
export function getSelfDestructCountdown(expiresAt) {
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return "Expired";
  const seconds = Math.floor(remaining / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}
