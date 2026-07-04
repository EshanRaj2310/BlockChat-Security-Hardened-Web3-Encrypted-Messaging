import { useState, useEffect, useCallback } from "react";
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react";

let toastCounter = 0;

/**
 * Toast notification system.
 * Usage: import { toast } from './Toast'; toast.success('Message');
 */
export function toast(type, message, duration = 3000) {
  const event = new CustomEvent("blockchat-toast", {
    detail: { type, message, duration, id: ++toastCounter },
  });
  window.dispatchEvent(event);
}

toast.success = (msg, dur) => toast("success", msg, dur);
toast.error = (msg, dur) => toast("error", msg, dur);
toast.info = (msg, dur) => toast("info", msg, dur);
toast.warning = (msg, dur) => toast("warning", msg, dur);

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const styles = {
  success: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  error: "bg-red-500/10 border-red-500/30 text-red-400",
  info: "bg-blue-500/10 border-blue-500/30 text-blue-400",
  warning: "bg-amber-500/10 border-amber-500/30 text-amber-400",
};

export function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const handler = (e) => {
      const toast = e.detail;
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => removeToast(toast.id), toast.duration);
    };
    window.addEventListener("blockchat-toast", handler);
    return () => window.removeEventListener("blockchat-toast", handler);
  }, [removeToast]);

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => {
        const Icon = icons[t.type];
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg border backdrop-blur-sm shadow-lg min-w-[280px] max-w-[400px] animate-in slide-in-from-right-full fade-in duration-300 ${styles[t.type]}`}
          >
            <Icon className="w-5 h-5 shrink-0" />
            <span className="text-sm font-medium flex-1">{t.message}</span>
            <button
              onClick={() => removeToast(t.id)}
              className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
