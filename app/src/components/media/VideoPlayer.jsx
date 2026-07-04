import { useState, useRef } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, Download } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

/**
 * VideoPlayer — thumbnail preview + modal player.
 */
export function VideoPlayer({ src, mime, className = "" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef(null);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setProgress(videoRef.current.currentTime);
      setDuration(videoRef.current.duration || 0);
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleSeek = (e) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setProgress(time);
    }
  };

  const formatTime = (t) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <>
      <div
        className={`relative rounded-lg overflow-hidden cursor-pointer group max-w-[240px] ${className}`}
        onClick={() => setIsOpen(true)}
      >
        <video
          src={src}
          className="max-h-[180px] object-cover rounded-lg"
          preload="metadata"
        >
          {mime && <source src={src} type={mime} />}
        </video>
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/40 transition-colors">
          <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Play className="w-6 h-6 text-white" />
          </div>
        </div>
      </div>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} size="lg">
        <div className="flex flex-col gap-3">
          <div className="relative rounded-lg overflow-hidden bg-black">
            <video
              ref={videoRef}
              src={src}
              className="w-full max-h-[60vh]"
              onTimeUpdate={handleTimeUpdate}
              onEnded={() => setIsPlaying(false)}
              onClick={togglePlay}
            >
              {mime && <source src={src} type={mime} />}
            </video>
          </div>
          <div className="flex items-center gap-3 px-1">
            <button
              onClick={togglePlay}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
            >
              {isPlaying ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={toggleMute}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={duration || 0}
              value={progress}
              onChange={handleSeek}
              className="flex-1 h-1 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
            />
            <span className="text-xs text-muted-foreground min-w-[70px] text-right">
              {formatTime(progress)} / {formatTime(duration)}
            </span>
          </div>
        </div>
      </Modal>
    </>
  );
}
