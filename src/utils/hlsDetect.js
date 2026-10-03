/** Sans dépendance : testable sous Node. */

/** `kind=hls` d'abord : le lecteur reçoit une poignée opaque sans extension. */
export function isHlsUrl(url) {
  if (!url || typeof url !== "string") return false;
  return (
    url.includes("kind=hls") ||
    url.includes(".m3u8") ||
    url.endsWith("m3u8") ||
    url.includes("/proxy/playlist")
  );
}
