import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

const ThemeContext = createContext(null);
const THEME_KEY = "blockchat_theme";

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState("dark");
  const [isSystem, setIsSystem] = useState(false);

  /**
   * Load theme from IndexedDB on mount.
   */
  useEffect(() => {
    const load = async () => {
      try {
        const db = await openThemeDB();
        const saved = await getThemeFromDB(db);
        if (saved) {
          setTheme(saved.theme);
          setIsSystem(saved.isSystem || false);
        }
      } catch {
        // fallback to dark
      }
    };
    load();
  }, []);

  /**
   * Save theme to IndexedDB whenever it changes.
   */
  useEffect(() => {
    const save = async () => {
      try {
        const db = await openThemeDB();
        await saveThemeToDB(db, { theme, isSystem });
      } catch {
        // ignore
      }
    };
    save();
  }, [theme, isSystem]);

  /**
   * Apply theme class to document.
   */
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    if (isSystem) {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.add(prefersDark ? "dark" : "light");
    } else {
      root.classList.add(theme);
    }
  }, [theme, isSystem]);

  const setLight = useCallback(() => {
    setTheme("light");
    setIsSystem(false);
  }, []);

  const setDark = useCallback(() => {
    setTheme("dark");
    setIsSystem(false);
  }, []);

  const setSystem = useCallback(() => {
    setIsSystem(true);
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
    setIsSystem(false);
  }, []);

  const isDark = isSystem
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : theme === "dark";

  return (
    <ThemeContext.Provider
      value={{ theme, isDark, isSystem, setLight, setDark, setSystem, toggle }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

// IndexedDB helpers for theme persistence
function openThemeDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("BlockChatThemeDB", 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings");
      }
    };
  });
}

function getThemeFromDB(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("settings", "readonly");
    const store = tx.objectStore("settings");
    const req = store.get(THEME_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

function saveThemeToDB(db, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("settings", "readwrite");
    const store = tx.objectStore("settings");
    const req = store.put(value, THEME_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
