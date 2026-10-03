/** Chaque URI devient une poignée opaque du proxy local. Module pur, testable sous Node. */
export function transformPlaylist(playlistContent, baseUrl, proxyBaseUrl, options = {}) {
  if (!playlistContent || typeof playlistContent !== "string") {
    return playlistContent;
  }
  const { mint, provider, referer = "", origin = "", tokenSuffix = "" } = options;

  const proxifyUri = (uri) => {
    let absoluteUrl;
    try {
      absoluteUrl = new URL(uri, baseUrl).toString();
    } catch {
      return uri;
    }
    if (!/^https?:\/\//i.test(absoluteUrl)) return uri;

    const handle = mint({
      url: absoluteUrl,
      provider: provider && provider !== "unknown" ? provider : null,
      referer,
      origin,
    });
    return handle ? `${proxyBaseUrl}?h=${handle}${tokenSuffix}` : uri;
  };

  return playlistContent
    .split("\n")
    .map((line) => {
      if (line.trim() === "") return line;
      // Pistes audio/sous-titres, clés AES et init segments passent par un attribut URI.
      if (line.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_match, uri) => `URI="${proxifyUri(uri)}"`);
      }
      return proxifyUri(line.trim());
    })
    .join("\n");
}
