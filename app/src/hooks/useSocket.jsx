import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { io } from "socket.io-client";

const SOCKET_URL = "http://localhost:5000";

// Jitter range: 50–250ms random delay on outgoing messages
const MIN_JITTER_MS = 50;
const MAX_JITTER_MS = 250;

function randomJitter() {
  return MIN_JITTER_MS + Math.random() * (MAX_JITTER_MS - MIN_JITTER_MS);
}

const SocketContext = createContext(null);

/**
 * SocketProvider — Shared socket connection via React context.
 *
 * FIX BREAK 6: Previously useSocket() was a hook that created a new
 * socket instance per component. Now the socket is shared via context
 * so Home.jsx and ChatWindow.jsx use the SAME socket connection.
 */
export function SocketProvider({ children }) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const socketRef = useRef(null);
  const handlersRef = useRef({});

  const connect = useCallback((address, token) => {
    if (!address || !token) return;

    // Don't create duplicate connections
    if (socketRef.current?.connected) return;

    // Disconnect old socket if exists
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socket.on("connect", () => {
      setIsConnected(true);
      setError(null);
      socket.emit("join", { address, token });
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("connect_error", (err) => {
      setError(err.message);
      setIsConnected(false);
    });

    socket.on("authenticated", (data) => {
      console.log("[Socket] Authenticated! RelayId:", data.relayId?.slice(0, 8));
    });

    // DEBUG: catch-all listener
    socket.onAny((event, ...args) => {
      console.log(`[Socket:ANY] ${event}`, args);
    });

    socket.on("auth_error", (data) => {
      console.error("[Socket] Auth error:", data.error);
      setError(data.error);
    });

    socket.on("error_msg", (data) => {
      console.error("[Socket] Server error:", data.error);
    });

    // Register all stored handlers
    Object.entries(handlersRef.current).forEach(([event, handler]) => {
      socket.on(event, handler);
    });

    socketRef.current = socket;
  }, []);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    }
  }, []);

  const emit = useCallback((event, payload, callback) => {
    if (socketRef.current?.connected) {
      const delay = randomJitter();
      console.log(`[Socket] Scheduling emit: ${event}`, payload);
      setTimeout(() => {
        if (socketRef.current?.connected) {
          console.log(`[Socket] Emitting: ${event}`, payload.messageId);
          socketRef.current.emit(event, payload, callback);
        }
      }, delay);
    } else {
      console.warn("[Socket] emit failed — not connected:", event);
      if (callback) callback({ success: false, error: "NOT_CONNECTED" });
    }
  }, []);

  const emitImmediate = useCallback((event, payload) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, payload);
    }
  }, []);

  const on = useCallback((event, handler) => {
    handlersRef.current[event] = handler;
    if (socketRef.current) {
      // Remove old handler first to prevent duplicates
      socketRef.current.off(event);
      socketRef.current.on(event, handler);
    }
  }, []);

  const off = useCallback((event) => {
    delete handlersRef.current[event];
    if (socketRef.current) {
      socketRef.current.off(event);
    }
  }, []);

  // Reconnect on visibility change
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && socketRef.current && !socketRef.current.connected) {
        socketRef.current.connect();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const value = {
    isConnected,
    error,
    socket: socketRef.current,
    connect,
    disconnect,
    emit,
    emitImmediate,
    on,
    off,
  };

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
}

/**
 * useSocket — access the shared socket from any component.
 */
export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocket must be used within SocketProvider");
  return ctx;
}
