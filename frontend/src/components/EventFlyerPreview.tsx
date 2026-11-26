import React, { useEffect, useState } from "react";
import { Download, Image as ImageIcon, Maximize2, X } from "lucide-react";
import { api } from "../api/client";

// Module-level cache of authenticated flyer object URLs keyed by band+event+filename
const flyerUrlCache = new Map<string, string>();

function makeFriendlyFilename(title: string, flyerFilename: string): string {
  const ext = flyerFilename.split(".").pop()?.toLowerCase() || "jpg";
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "event";
  return `${slug}-flyer.${ext}`;
}

export async function downloadEventFlyer(
  bandId: string,
  eventId: string,
  eventTitle: string,
  flyerFilename: string,
): Promise<void> {
  const cacheKey = `${bandId}:${eventId}:${flyerFilename}`;
  let url = flyerUrlCache.get(cacheKey);
  if (!url) {
    const blob = await api.fetchEventFlyerBlob(bandId, eventId);
    url = URL.createObjectURL(blob);
    flyerUrlCache.set(cacheKey, url);
  }
  const a = document.createElement("a");
  a.href = url;
  a.download = makeFriendlyFilename(eventTitle, flyerFilename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

interface EventFlyerThumbnailProps {
  bandId: string;
  eventId: string;
  eventTitle: string;
  flyerFilename: string;
  size?: "sm" | "md";
}

export const EventFlyerThumbnail: React.FC<EventFlyerThumbnailProps> = ({
  bandId,
  eventId,
  eventTitle,
  flyerFilename,
  size = "sm",
}) => {
  const cacheKey = `${bandId}:${eventId}:${flyerFilename}`;
  const [objectUrl, setObjectUrl] = useState<string | null>(
    () => flyerUrlCache.get(cacheKey) || null,
  );
  const [failed, setFailed] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    const cached = flyerUrlCache.get(cacheKey);
    if (cached) {
      setObjectUrl(cached);
      setFailed(false);
      return;
    }

    let cancelled = false;
    setObjectUrl(null);
    setFailed(false);

    api
      .fetchEventFlyerBlob(bandId, eventId)
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        flyerUrlCache.set(cacheKey, url);
        setObjectUrl(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [bandId, eventId, cacheKey]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxOpen]);

  const dimClass = size === "md" ? "w-20 h-24" : "w-14 h-18";

  if (failed) {
    return (
      <div
        title="Flyer image file is missing on server"
        className={`${dimClass} shrink-0 rounded-lg bg-zinc-950 border border-dashed border-zinc-700 flex flex-col items-center justify-center text-[10px] text-zinc-500 p-1 text-center`}
      >
        <ImageIcon className="w-4 h-4 mb-0.5 text-zinc-600" />
        <span>Missing</span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => objectUrl && setLightboxOpen(true)}
        title={`Preview flyer for ${eventTitle}`}
        className={`${dimClass} shrink-0 relative group rounded-lg overflow-hidden bg-zinc-950 border border-zinc-700 hover:border-amber-500/70 transition cursor-pointer`}
      >
        {objectUrl ? (
          <>
            <img
              src={objectUrl}
              alt={`${eventTitle} flyer`}
              className="w-full h-full object-cover"
            />
            <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
              <Maximize2 className="w-4 h-4 text-white" />
            </span>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600 animate-pulse">
            <ImageIcon className="w-4 h-4" />
          </div>
        )}
      </button>

      {lightboxOpen && objectUrl && (
        <div
          onClick={() => setLightboxOpen(false)}
          className="fixed inset-0 bg-black/85 backdrop-blur-xs z-50 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-3xl w-full max-h-[92vh] bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden flex flex-col shadow-2xl"
          >
            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between gap-3">
              <div className="truncate">
                <div className="text-sm font-semibold text-zinc-100 truncate">
                  {eventTitle}
                </div>
                <div className="text-[11px] font-mono text-zinc-400 truncate">
                  Show Flyer
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    downloadEventFlyer(
                      bandId,
                      eventId,
                      eventTitle,
                      flyerFilename,
                    )
                  }
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </button>
                <button
                  type="button"
                  onClick={() => setLightboxOpen(false)}
                  aria-label="Close flyer preview"
                  className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 bg-zinc-950 overflow-auto flex items-center justify-center flex-1">
              <img
                src={objectUrl}
                alt={`${eventTitle} show flyer`}
                className="max-h-[76vh] max-w-full object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};
