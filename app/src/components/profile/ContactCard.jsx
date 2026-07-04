import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { truncateAddress, formatDateTime } from "@/utils/formatting";
import {
  Copy,
  Check,
  MessageCircle,
  Ban,
  Shield,
  X,
} from "lucide-react";
import { useState } from "react";

/**
 * ContactCard — displays contact details (click any user to view).
 */
export function ContactCard({ contact, isOpen, onClose, onMessage, onBlock, isBlocked }) {
  const [copied, setCopied] = useState(false);

  if (!contact) return null;

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(contact.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      <div className="flex flex-col items-center gap-4">
        {/* Avatar */}
        <Avatar
          address={contact.address}
          username={contact.username}
          src={contact.avatar}
          size="xl"
        />

        {/* Name */}
        <div className="text-center">
          <h3 className="text-lg font-semibold">
            {contact.username || "Unknown"}
          </h3>
          {contact.username && (
            <p className="text-sm text-muted-foreground font-mono">
              {truncateAddress(contact.address)}
            </p>
          )}
        </div>

        {/* Public key */}
        {contact.publicKey && (
          <div className="w-full">
            <p className="text-xs text-muted-foreground mb-1">Public Key</p>
            <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
              <span className="text-xs font-mono flex-1 truncate">
                {truncateAddress(contact.publicKey, 12, 12)}
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(contact.publicKey);
                }}
                className="p-1 hover:bg-background rounded"
              >
                <Copy className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="flex gap-4 w-full justify-center">
          {contact.joinDate && (
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Joined</p>
              <p className="text-sm font-medium">
                {formatDateTime(contact.joinDate)}
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 w-full mt-2">
          <button
            onClick={() => {
              onMessage?.(contact.address);
              onClose();
            }}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            Message
          </button>
          <button
            onClick={() => {
              onBlock?.(contact.address);
              onClose();
            }}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm transition-colors ${
              isBlocked
                ? "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                : "bg-red-500/10 text-red-500 hover:bg-red-500/20"
            }`}
          >
            <Ban className="w-4 h-4" />
            {isBlocked ? "Unblock" : "Block"}
          </button>
        </div>

        {/* Copy full address */}
        <button
          onClick={handleCopyAddress}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              Copy full address
            </>
          )}
        </button>
      </div>
    </Modal>
  );
}
