import { useState, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { truncateAddress } from "@/utils/formatting";
import {
  Camera,
  Loader2,
  User,
  Check,
  X,
  Upload,
} from "lucide-react";

/**
 * ProfileEditor — edit username and profile picture.
 */
export function ProfileEditor({ isOpen, onClose }) {
  const { user, address, registerUser, publicKeyHex } = useAuth();
  const [username, setUsername] = useState(user?.username || "");
  const [isSaving, setIsSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      // 5MB limit for avatar
      return;
    }
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setPreviewUrl(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!username.trim()) return;
    setIsSaving(true);
    try {
      // In a real app, upload the file to IPFS first
      const profileCid = ""; // placeholder
      await registerUser(username.trim(), profileCid);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Profile" size="md">
      <div className="flex flex-col items-center gap-4">
        {/* Avatar with upload */}
        <div className="relative">
          <Avatar
            address={address}
            username={username || user?.username}
            src={previewUrl || user?.avatar}
            size="xl"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors shadow-lg"
          >
            <Camera className="w-4 h-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        {/* Address */}
        <div className="text-center">
          <p className="text-sm font-mono text-muted-foreground">
            {truncateAddress(address)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 break-all max-w-[280px]">
            PubKey: {truncateAddress(publicKeyHex || "", 8, 8)}
          </p>
        </div>

        {/* Username input */}
        <div className="w-full">
          <label className="block text-sm font-medium mb-1.5">Username</label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username..."
              className="w-full pl-9 pr-3 py-2.5 bg-muted rounded-lg text-sm border border-transparent focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 w-full justify-end mt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!username.trim() || isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50 transition-all"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
