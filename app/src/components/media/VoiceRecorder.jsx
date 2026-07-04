import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Square, Play, Pause, Trash2, Send } from "lucide-react";
import { formatDuration } from "@/utils/formatting";

/**
 * VoiceRecorder — record, preview, and send voice messages.
 */
export function VoiceRecorder({ onSend, onCancel }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [waveform, setWaveform] = useState([]);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const audioRef = useRef(null);
  const analyserRef = useRef(null);
  const animationRef = useRef(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      // Set up audio analysis for waveform
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      mediaRecorder.ondataavailable = (e) => {
        audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setDuration(0);

      // Timer
      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);

      // Waveform animation
      const updateWaveform = () => {
        if (!analyserRef.current) return;
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        const bars = Array.from(dataArray).slice(0, 20);
        setWaveform(bars);
        animationRef.current = requestAnimationFrame(updateWaveform);
      };
      updateWaveform();
    } catch (err) {
      console.error("Failed to start recording:", err);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
      cancelAnimationFrame(animationRef.current);
      setWaveform([]);
    }
  }, [isRecording]);

  const togglePause = useCallback(() => {
    if (!mediaRecorderRef.current) return;
    if (isPaused) {
      mediaRecorderRef.current.resume();
      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } else {
      mediaRecorderRef.current.pause();
      clearInterval(timerRef.current);
    }
    setIsPaused(!isPaused);
  }, [isPaused]);

  const handleSend = useCallback(() => {
    if (!audioUrl) return;
    fetch(audioUrl)
      .then((r) => r.blob())
      .then((blob) => {
        onSend?.(blob, "audio/webm");
        cleanup();
      });
  }, [audioUrl, onSend]);

  const handleCancel = useCallback(() => {
    cleanup();
    onCancel?.();
  }, [onCancel]);

  const cleanup = () => {
    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
    }
    clearInterval(timerRef.current);
    cancelAnimationFrame(animationRef.current);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setIsRecording(false);
    setIsPaused(false);
    setDuration(0);
    setAudioUrl(null);
    setWaveform([]);
  };

  const togglePlayback = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  useEffect(() => {
    return cleanup;
  }, []);

  // Recording state
  if (isRecording || audioUrl) {
    return (
      <div className="flex items-center gap-3 bg-muted rounded-lg px-3 py-2 flex-1">
        {isRecording && !audioUrl ? (
          <>
            <button
              onClick={stopRecording}
              className="p-1.5 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
            >
              <Square className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1 flex-1">
              {waveform.map((val, i) => (
                <div
                  key={i}
                  className="bg-primary rounded-full w-1 transition-all"
                  style={{
                    height: `${Math.max(4, (val / 255) * 24)}px`,
                    opacity: 0.4 + (val / 255) * 0.6,
                  }}
                />
              ))}
            </div>
            <span className="text-xs text-red-500 font-mono min-w-[40px] text-right">
              {formatDuration(duration)}
            </span>
          </>
        ) : (
          <>
            <button
              onClick={togglePlayback}
              className="p-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {isPlaying ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </button>
            <span className="text-xs text-muted-foreground font-mono flex-1">
              {formatDuration(duration)}
            </span>
            <audio
              ref={audioRef}
              src={audioUrl}
              onEnded={() => setIsPlaying(false)}
              className="hidden"
            />
          </>
        )}

        <button
          onClick={handleCancel}
          className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        {audioUrl && (
          <button
            onClick={handleSend}
            className="p-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  // Idle state — just the record button
  return (
    <button
      type="button"
      onMouseDown={startRecording}
      className="p-2.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-primary transition-colors"
      title="Hold to record voice"
    >
      <Mic className="w-5 h-5" />
    </button>
  );
}
