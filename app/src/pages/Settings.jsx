import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Avatar } from "@/components/ui/Avatar";
import {
  truncateAddress,
} from "@/utils/formatting";
import {
  ArrowLeft,
  User,
  Shield,
  Bell,
  Moon,
  Sun,
  Trash2,
  Download,
  Loader2,
  Check,
  Globe,
  Lock,
} from "lucide-react";

/**
 * Settings — app settings page.
 */
export function Settings() {
  const navigate = useNavigate();
  const { user, address, logout, publicKeyHex } = useAuth();
  const [isDark, setIsDark] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isClearing, setIsClearing] = useState(false);
  const [cleared, setCleared] = useState(false);

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle("dark");
  };

  const handleClearData = async () => {
    setIsClearing(true);
    // Clear IndexedDB data
    try {
      const databases = await indexedDB.databases();
      for (const db of databases) {
        if (db.name?.startsWith("BlockChat")) {
          indexedDB.deleteDatabase(db.name);
        }
      }
      setCleared(true);
      setTimeout(() => setCleared(false), 3000);
    } catch {
      // ignore
    } finally {
      setIsClearing(false);
    }
  };

  const handleExportKeys = () => {
    const data = {
      address,
      publicKey: publicKeyHex,
      exportDate: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `blockchat-keys-${address.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="p-2 -ml-2 hover:bg-muted rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Profile section */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Profile
          </h2>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-4">
              <Avatar
                address={address}
                username={user?.username}
                src={user?.avatar}
                size="lg"
              />
              <div>
                <p className="font-medium">
                  {user?.username || "Anonymous User"}
                </p>
                <p className="text-sm text-muted-foreground font-mono">
                  {truncateAddress(address)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 break-all max-w-[300px]">
                  PubKey: {truncateAddress(publicKeyHex || "", 10, 10)}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Appearance */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Appearance
          </h2>
          <div className="bg-card border border-border rounded-xl divide-y divide-border">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                {isDark ? (
                  <Moon className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <Sun className="w-4 h-4 text-muted-foreground" />
                )}
                <span className="text-sm">Dark Mode</span>
              </div>
              <button
                onClick={toggleTheme}
                className={`w-11 h-6 rounded-full transition-colors relative ${
                  isDark ? "bg-primary" : "bg-muted-foreground/30"
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                    isDark ? "left-6" : "left-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        {/* Notifications */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Notifications
          </h2>
          <div className="bg-card border border-border rounded-xl divide-y divide-border">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <Bell className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Push Notifications</span>
              </div>
              <button
                onClick={() => setNotifications(!notifications)}
                className={`w-11 h-6 rounded-full transition-colors relative ${
                  notifications ? "bg-primary" : "bg-muted-foreground/30"
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                    notifications ? "left-6" : "left-1"
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        {/* Security */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Security
          </h2>
          <div className="bg-card border border-border rounded-xl divide-y divide-border">
            <button
              onClick={handleExportKeys}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Download className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Export Public Key</span>
              </div>
            </button>
            <button
              onClick={handleClearData}
              disabled={isClearing}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Trash2 className="w-4 h-4 text-red-500" />
                <span className="text-sm text-red-500">Clear All Data</span>
              </div>
              {isClearing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : cleared ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : null}
            </button>
          </div>
        </section>

        {/* About */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            About
          </h2>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mx-auto mb-3">
              <Shield className="w-6 h-6 text-primary-foreground" />
            </div>
            <h3 className="font-semibold">BlockChat</h3>
            <p className="text-sm text-muted-foreground mt-1">
              End-to-end encrypted messaging on the blockchain.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Version 1.0.0 &middot; All encryption happens in your browser.
            </p>
          </div>
        </section>

        {/* Logout */}
        <section className="pb-8">
          <button
            onClick={() => {
              logout();
              navigate("/");
            }}
            className="w-full py-3 bg-red-500/10 text-red-500 rounded-xl text-sm font-medium hover:bg-red-500/20 transition-colors"
          >
            Logout
          </button>
        </section>
      </div>
    </div>
  );
}
