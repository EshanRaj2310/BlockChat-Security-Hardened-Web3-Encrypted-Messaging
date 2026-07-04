import { useEffect } from "react";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Loader2,
  Phone,
} from "lucide-react";

/**
 * CallOverlay — full-screen call view with local and remote video.
 */
export function CallOverlay({
  localVideoRef,
  remoteVideoRef,
  isCallActive,
  isCalling,
  isMuted,
  isCameraOff,
  onToggleMute,
  onToggleCamera,
  onEndCall,
  remoteUser,
}) {
  if (!isCallActive && !isCalling) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col animate-in fade-in duration-300">
      {/* Remote video (full screen) */}
      <div className="relative flex-1 flex items-center justify-center">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
        {(!isCallActive || !remoteVideoRef?.current?.srcObject) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70">
            {isCalling ? (
              <>
                <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center mb-4 animate-pulse">
                  <Phone className="w-10 h-10 text-primary" />
                </div>
                <p className="text-white text-lg font-medium mb-1">
                  Calling {remoteUser || "..."}
                </p>
                <p className="text-white/60 text-sm">Waiting for answer...</p>
                <Loader2 className="w-6 h-6 text-primary animate-spin mt-4" />
              </>
            ) : (
              <>
                <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Video className="w-10 h-10 text-muted-foreground" />
                </div>
                <p className="text-white/60 text-sm">No video</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Local video (small, corner) */}
      <div className="absolute top-4 right-4 w-40 h-28 rounded-lg overflow-hidden border-2 border-white/20 shadow-lg">
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        {isCameraOff && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
            <VideoOff className="w-6 h-6 text-white/60" />
          </div>
        )}
      </div>

      {/* Call info */}
      {isCallActive && (
        <div className="absolute top-4 left-4">
          <p className="text-white font-medium drop-shadow-lg">
            {remoteUser || "Unknown"}
          </p>
          <p className="text-white/60 text-sm drop-shadow">Connected</p>
        </div>
      )}

      {/* Controls */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4">
        <button
          onClick={onToggleMute}
          className={`p-4 rounded-full transition-colors ${
            isMuted
              ? "bg-red-500 text-white"
              : "bg-white/20 text-white hover:bg-white/30"
          }`}
        >
          {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>
        <button
          onClick={onToggleCamera}
          className={`p-4 rounded-full transition-colors ${
            isCameraOff
              ? "bg-red-500 text-white"
              : "bg-white/20 text-white hover:bg-white/30"
          }`}
        >
          {isCameraOff ? (
            <VideoOff className="w-6 h-6" />
          ) : (
            <Video className="w-6 h-6" />
          )}
        </button>
        <button
          onClick={onEndCall}
          className="p-4 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
        >
          <PhoneOff className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
