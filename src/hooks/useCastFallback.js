import { useCallback, useEffect, useRef } from "react";
import { isHlsUrl } from "@/utils/hlsDetect";
import { useCastStore } from "@/stores/useCastStore";
import { toast } from "@/lib/toast";

/**
 * Quand la TV ne sait pas lire la source en cours, on l'écarte et on recaste la suivante à la
 * même position.
 */
export function useCastFallback({
  title,
  poster,
  videoUrl,
  error,
  playLocal,
  sourceOptions,
  failedSources,
  setFailedSources,
  usedSourceRef,
  carryOverResumeRef,
  playerApiRef,
}) {
  const castMediaFor = useCallback(
    (url) => ({
      url,
      // Pas de test sur « .m3u8 » : une URL de lecture est une poignée opaque.
      contentType: isHlsUrl(url) ? "application/vnd.apple.mpegurl" : "video/mp4",
      title,
      poster: poster || "",
    }),
    [title, poster]
  );

  const pendingRecastRef = useRef(null);
  const handleCastMediaFailed = useCallback(
    ({ deviceId, startAt }) => {
      const failedKey = usedSourceRef.current;
      if (playLocal || !failedKey) return false;
      const remaining = sourceOptions.some((s) => s.id !== failedKey && !failedSources.has(s.id));
      if (!remaining) return false;
      pendingRecastRef.current = { deviceId, startAt };
      if (startAt > 1) carryOverResumeRef.current = startAt;
      setFailedSources((prev) => new Set(prev).add(failedKey));
      return true;
    },
    [playLocal, sourceOptions, failedSources, setFailedSources, usedSourceRef, carryOverResumeRef]
  );
  const castFailedRef = useRef(handleCastMediaFailed);
  castFailedRef.current = handleCastMediaFailed;

  useEffect(() => {
    const pending = pendingRecastRef.current;
    if (!pending) return;
    if (error) {
      pendingRecastRef.current = null;
      toast.error("Aucune autre source n'a pu être lancée sur la TV.");
      return;
    }
    if (!videoUrl) return;
    pendingRecastRef.current = null;
    playerApiRef.current?.pause?.();
    (async () => {
      const res = await useCastStore.getState().cast(pending.deviceId, {
        ...castMediaFor(videoUrl),
        startAt: pending.startAt,
      });
      playerApiRef.current?.pause?.();
      if (res.success) toast.success("Lecture relancée sur la TV avec une autre source");
      else if (!(res.mediaFailed && castFailedRef.current(pending))) {
        toast.error(res.error || "Cast impossible");
      }
    })();
  }, [videoUrl, error, castMediaFor, playerApiRef]);

  return { castMediaFor, handleCastMediaFailed };
}
