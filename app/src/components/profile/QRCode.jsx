import { QRCodeSVG } from "qrcode.react";
import { Modal } from "@/components/ui/Modal";
import { truncateAddress } from "@/utils/formatting";
import { Copy, Check } from "lucide-react";
import { useState } from "react";

/**
 * QRCode — displays wallet address as QR code for easy sharing.
 */
export function QRCodeModal({ isOpen, onClose, address, username }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Your QR Code" size="sm">
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm text-muted-foreground text-center">
          Scan this QR code to share your BlockChat address
        </p>

        <div className="p-4 bg-white rounded-xl">
          <QRCodeSVG
            value={address}
            size={200}
            level="M"
            includeMargin={false}
            bgColor="#ffffff"
            fgColor="#000000"
          />
        </div>

        <div className="w-full">
          <p className="text-xs text-muted-foreground mb-1">Wallet Address</p>
          <div className="flex items-center gap-2 p-2.5 bg-muted rounded-lg">
            <span className="text-sm font-mono flex-1 truncate">
              {truncateAddress(address, 10, 10)}
            </span>
            <button
              onClick={handleCopy}
              className="p-1.5 hover:bg-background rounded transition-colors"
            >
              {copied ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {username && (
          <p className="text-sm font-medium">{username}</p>
        )}
      </div>
    </Modal>
  );
}
