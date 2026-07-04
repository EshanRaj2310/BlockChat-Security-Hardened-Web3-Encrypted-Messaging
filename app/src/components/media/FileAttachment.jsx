import { useState } from "react";
import {
  FileText,
  Download,
  File,
  FileSpreadsheet,
  FileCode,
  Image,
  Film,
  Music,
  Loader2,
} from "lucide-react";
import { formatFileSize } from "@/utils/ipfs";

const iconMap = {
  "image/": Image,
  "video/": Film,
  "audio/": Music,
  "text/": FileText,
  "application/pdf": FileText,
  "application/vnd.ms-excel": FileSpreadsheet,
  "application/vnd.openxmlformats-officedocument": FileSpreadsheet,
  "application/json": FileCode,
  "text/javascript": FileCode,
  "text/html": FileCode,
  "text/css": FileCode,
};

function getFileIcon(mime) {
  for (const [prefix, Icon] of Object.entries(iconMap)) {
    if (mime?.startsWith(prefix)) return Icon;
  }
  return File;
}

/**
 * FileAttachment — displays file info with download button.
 */
export function FileAttachment({
  name,
  size,
  mime,
  url,
  isUploading = false,
  uploadProgress = 0,
  className = "",
}) {
  const [isDownloading, setIsDownloading] = useState(false);
  const Icon = getFileIcon(mime);

  const handleDownload = async () => {
    if (!url || isUploading) return;
    setIsDownloading(true);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div
      className={`flex items-center gap-3 p-3 bg-muted rounded-lg max-w-[280px] ${className}`}
    >
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        {isUploading ? (
          <Loader2 className="w-5 h-5 text-primary animate-spin" />
        ) : (
          <Icon className="w-5 h-5 text-primary" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{name}</p>
        <p className="text-xs text-muted-foreground">
          {isUploading
            ? `Uploading... ${uploadProgress}%`
            : formatFileSize(size)}
        </p>
        {isUploading && (
          <div className="w-full h-1 bg-muted-foreground/20 rounded-full mt-1">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}
      </div>
      {!isUploading && (
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className="p-2 hover:bg-background rounded-lg transition-colors shrink-0"
        >
          <Download className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
