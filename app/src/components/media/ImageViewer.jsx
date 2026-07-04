import { useState } from "react";
import { X, ZoomIn, Download } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

/**
 * ImageViewer — inline thumbnail + full-screen modal viewer.
 */
export function ImageViewer({ src, alt = "Image", className = "" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <>
      <div
        className={`relative rounded-lg overflow-hidden cursor-pointer group ${className}`}
        onClick={() => setIsOpen(true)}
      >
        <img
          src={src}
          alt={alt}
          className="max-w-[240px] max-h-[180px] object-cover rounded-lg"
          onLoad={() => setIsLoaded(true)}
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} size="full">
        <div className="flex flex-col items-center gap-4">
          <img
            src={src}
            alt={alt}
            className="max-w-full max-h-[80vh] object-contain rounded-lg"
          />
          <div className="flex gap-2">
            <a
              href={src}
              download
              className="flex items-center gap-2 px-4 py-2 bg-muted rounded-lg hover:bg-muted/80 transition-colors text-sm"
            >
              <Download className="w-4 h-4" />
              Download
            </a>
          </div>
        </div>
      </Modal>
    </>
  );
}
