import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getAttachmentUrl } from "@/api/reports";

/** URL signée résolue à la demande. */
export default function AttachmentThumb({ path, onOpen, size = "h-20 w-20" }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let alive = true;
    getAttachmentUrl(path)
      .then((u) => alive && setUrl(u))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [path]);

  if (!url) {
    return (
      <div className={`flex ${size} shrink-0 items-center justify-center rounded-md bg-surface-2/60 ring-1 ring-border`}>
        <Loader2 size={14} className="animate-spin text-muted" />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(url)}
      title="Agrandir la pièce jointe"
      className={`shrink-0 overflow-hidden rounded-md ${size} ring-1 ring-border transition-opacity hover:opacity-85`}
    >
      <img src={url} alt="Pièce jointe" className="h-full w-full object-cover" />
    </button>
  );
}
