import { useState, useCallback, useEffect, useRef } from "react";

/**
 * useNotifications — Browser notification permission + display.
 */
export function useNotifications() {
  const [permission, setPermission] = useState("default");
  const [isSupported, setIsSupported] = useState(false);
  const enabledRef = useRef(true);

  /**
   * Check if browser supports notifications.
   */
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setIsSupported(true);
      setPermission(Notification.permission);
    }
  }, []);

  /**
   * Request notification permission.
   */
  const requestPermission = useCallback(async () => {
    if (!isSupported) return false;
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result === "granted";
    } catch {
      return false;
    }
  }, [isSupported]);

  /**
   * Show a notification (only if tab is not focused).
   */
  const showNotification = useCallback(
    (title, options = {}) => {
      if (!isSupported || permission !== "granted") return;
      if (!enabledRef.current) return;
      // Only show if tab is not focused
      if (document.hidden || !document.hasFocus()) {
        const notif = new Notification(title, {
          icon: "/favicon.ico",
          badge: "/favicon.ico",
          tag: options.tag || "blockchat-message",
          requireInteraction: false,
          ...options,
        });
        notif.onclick = () => {
          window.focus();
          notif.close();
        };
      }
    },
    [isSupported, permission]
  );

  /**
   * Show a message notification.
   */
  const notifyMessage = useCallback(
    (from, content, options = {}) => {
      showNotification(from, {
        body: content || "New encrypted message",
        tag: `msg-${options.messageId || Date.now()}`,
        ...options,
      });
    },
    [showNotification]
  );

  /**
   * Enable/disable notifications.
   */
  const setEnabled = useCallback((enabled) => {
    enabledRef.current = enabled;
  }, []);

  return {
    permission,
    isSupported,
    requestPermission,
    showNotification,
    notifyMessage,
    setEnabled,
  };
}
