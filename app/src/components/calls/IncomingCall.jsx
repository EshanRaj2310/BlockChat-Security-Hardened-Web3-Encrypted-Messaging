import { Phone, PhoneOff, Video, User } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";

/**
 * IncomingCall — ringing overlay for incoming calls.
 */
export function IncomingCall({ caller, onAccept, onDecline, isVideo = true }) {
  const [ringCount, setRingCount] = useState(0);

  // Ringing animation
  useEffect(() => {
    const interval = setInterval(() => {
      setRingCount((c) => c + 1);
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-300">
      <div className="flex flex-col items-center gap-6 p-8">
        {/* Avatar with ring animation */}
        <div className="relative">
          <div
            className={`absolute inset-0 rounded-full border-4 border-primary/30 animate-ping`}
            style={{ animationDuration: "1.5s" }}
          />
          <div
            className={`w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center ${
              ringCount % 2 === 0 ? "scale-100" : "scale-105"
            } transition-transform duration-300`}
          >
            {caller?.avatar ? (
              <Avatar address={caller.address} username={caller.username} size="xl" />
            ) : (
              <User className="w-12 h-12 text-primary" />
            )}
          </div>
        </div>

        {/* Caller info */}
        <div className="text-center">
          <h2 className="text-white text-xl font-semibold mb-1">
            {caller?.username || caller?.address || "Unknown"}
          </h2>
          <div className="flex items-center gap-2 justify-center text-white/60">
            {isVideo && <Video className="w-4 h-4" />}
            <span className="text-sm">Incoming {isVideo ? "video" : "audio"} call...</span>
          </div>
        </div>

        {/* Accept / Decline buttons */}
        <div className="flex items-center gap-6 mt-4">
          <button
            onClick={onDecline}
            className="flex flex-col items-center gap-2 group"
          >
            <div className="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center group-hover:bg-red-600 transition-colors shadow-lg shadow-red-500/30">
              <PhoneOff className="w-6 h-6 text-white" />
            </div>
            <span className="text-white/60 text-xs">Decline</span>
          </button>

          <button
            onClick={() => onAccept(isVideo)}
            className="flex flex-col items-center gap-2 group"
          >
            <div className="w-14 h-14 rounded-full bg-emerald-500 flex items-center justify-center group-hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/30 animate-pulse">
              <Phone className="w-6 h-6 text-white" />
            </div>
            <span className="text-white/60 text-xs">Accept</span>
          </button>
        </div>
      </div>
    </div>
  );
}
