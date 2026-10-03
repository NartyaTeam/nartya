package com.nartya.app.proxy;

import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.net.URLEncoder;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import fi.iki.elonen.NanoHTTPD;
import okhttp3.Dns;
import okhttp3.ConnectionPool;
import okhttp3.Dispatcher;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

/**
 * Comme electron/utils/local-proxy-server.js : en-têtes par hébergeur, redirections, Range,
 * réécriture HLS. Les en-têtes arrivent avec la recette.
 */
public class ProxyServer extends NanoHTTPD {

    private volatile JSONObject configs;    // { providerConfigs: {...}, defaultConfig: {...} }
    private final OkHttpClient client;

    // Sans ce jeton, n'importe quelle app du téléphone pourrait lire flux et téléchargements.
    private final String token;

    private static final Pattern AUTHORITY = Pattern.compile("^(https?://)([^/]+)(.*)$", Pattern.CASE_INSENSITIVE);

    // Racine des téléchargements, servie par la route /local.
    private static File downloadsRoot;

    public static void setDownloadsRoot(File root) {
        downloadsRoot = root;
    }

    /** Doit correspondre à Downloads.itemDir et au JS. */
    static File itemDir(String id) {
        String safe = Base64.encodeToString(id.getBytes(), Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
        return new File(downloadsRoot, safe);
    }

    /** Borné au dossier de l'entrée (anti path-traversal). null sinon. */
    static File resolveLocalFile(String id, String rel) {
        if (downloadsRoot == null || id == null || id.isEmpty()) return null;
        File base = itemDir(id);
        File abs = new File(base, rel != null ? rel : "video.mp4");
        try {
            if (!isWithinBase(base, abs)) return null;
        } catch (Exception e) {
            return null;
        }
        return abs.exists() ? abs : null;
    }

    static boolean isWithinBase(File base, File candidate) throws Exception {
        String basePath = base.getCanonicalPath();
        String candidatePath = candidate.getCanonicalPath();
        // Évite le piège « …/abc » vs « …/abc-evil ».
        return candidatePath.equals(basePath) || candidatePath.startsWith(basePath + File.separator);
    }

    public ProxyServer(int port, JSONObject configs) {
        super("127.0.0.1", port);
        this.token = newToken();
        this.configs = configs != null ? configs : new JSONObject();
        Dispatcher dispatcher = new Dispatcher();
        // HLS charge en parallèle manifeste, audio, vidéo et clés : 5 requêtes par hôte ne suffisent pas.
        dispatcher.setMaxRequests(32);
        dispatcher.setMaxRequestsPerHost(12);
        this.client = new OkHttpClient.Builder()
                .dispatcher(dispatcher)
                .connectionPool(new ConnectionPool(
                        12, 5, java.util.concurrent.TimeUnit.MINUTES))
                // À chaque résolution, redirections incluses : un hôte public ne peut pas rebondir vers
                // localhost, le LAN ou une plage réservée.
                .dns(hostname -> {
                    List<InetAddress> addresses = Dns.SYSTEM.lookup(hostname);
                    for (InetAddress address : addresses) {
                        if (isForbiddenAddress(address)) {
                            throw new UnknownHostException("Adresse privée/réservée bloquée");
                        }
                    }
                    return addresses;
                })
                .followRedirects(true)
                .followSslRedirects(true)
                .retryOnConnectionFailure(true)
                .connectTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
                .readTimeout(60, java.util.concurrent.TimeUnit.SECONDS)
                .build();
    }

    /** Sans android.util.Base64 : testable en JVM. */
    static String newToken() {
        byte[] secret = new byte[24];
        new SecureRandom().nextBytes(secret);
        StringBuilder sb = new StringBuilder(secret.length * 2);
        for (byte b : secret) sb.append(String.format(Locale.ROOT, "%02x", b));
        return sb.toString();
    }

    public String getToken() {
        return token;
    }

    boolean checkToken(String given) {
        if (given == null) return false;
        return MessageDigest.isEqual(
                given.getBytes(StandardCharsets.UTF_8), token.getBytes(StandardCharsets.UTF_8));
    }

    public void updateConfigs(JSONObject next) {
        this.configs = next != null ? next : new JSONObject();
    }

    @Override
    public Response serve(IHTTPSession session) {
        if (Method.OPTIONS.equals(session.getMethod())) {
            return cors(newFixedLengthResponse(Response.Status.OK, "text/plain", ""));
        }

        String uri = session.getUri();
        Map<String, java.util.List<String>> params = session.getParameters();

        if (!checkToken(first(params, "t"))) {
            return cors(newFixedLengthResponse(Response.Status.FORBIDDEN, "text/plain", "Jeton invalide"));
        }

        if ("/local".equals(uri)) {
            try {
                return handleLocal(first(params, "id"), first(params, "path"), session);
            } catch (Exception e) {
                return cors(newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "text/plain",
                        "Local error: " + e.getMessage()));
            }
        }

        if (!"/video/proxy".equals(uri)) {
            return cors(newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "Not found"));
        }

        String targetUrl = first(params, "url");
        String provider = first(params, "provider");
        String referer = first(params, "referer");
        String origin = first(params, "origin");
        boolean raw = "1".equals(first(params, "raw")); // téléchargeur : playlist non réécrite
        if (targetUrl == null || targetUrl.isEmpty()) {
            return cors(newFixedLengthResponse(Response.Status.BAD_REQUEST, "text/plain", "Missing url"));
        }

        try {
            return handleProxy(targetUrl, provider, referer, origin, raw, session);
        } catch (Exception e) {
            return cors(newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "text/plain",
                    "Proxy error: " + e.getMessage()));
        }
    }

    private Response handleProxy(String targetUrl, String provider, String referer, String origin,
                                 boolean raw, IHTTPSession session) throws Exception {
        URI target = new URI(targetUrl);
        String scheme = target.getScheme();
        if (target.getHost() == null || target.getUserInfo() != null ||
                (!("http".equalsIgnoreCase(scheme)) && !("https".equalsIgnoreCase(scheme)))) {
            throw new IllegalArgumentException("URL distante invalide");
        }

        // « unknown » = absent : détection depuis la recette.
        String detected = (provider != null && !provider.isEmpty() && !"unknown".equals(provider))
                ? provider : detectProvider(targetUrl);

        String url = canonicalizeUrl(targetUrl, detected);

        Map<String, String> headers = configHeaders(detected);
        // Un `br` injecté par Chromium reviendrait compressé à la WebView : OkHttp ne décode pas Brotli.
        headers.remove("Accept-Encoding");

        JSONObject source = providerConfig(detected);
        if (source != null && source.optBoolean("dropRefererOffHost", false)) {
            String hostMatch = source.optString("hostMatch", "");
            String dynamicOrigin = originOf(url);
            String host = hostOf(url);
            if (!hostMatch.isEmpty() && host != null && host.contains(hostMatch) && dynamicOrigin != null) {
                headers.put("Referer", dynamicOrigin + "/");
                headers.put("Origin", dynamicOrigin);
            } else {
                headers.remove("Referer");
                headers.remove("Origin");
            }
        }

        String mediaReferer = mediaReferer(url, source);
        if (mediaReferer != null) headers.put("Referer", mediaReferer);

        // Plus précises que les en-têtes génériques de la recette : elles gagnent en dernier et
        // suivent chaque segment HLS.
        if (referer != null && !referer.isEmpty()) headers.put("Referer", referer);
        if (origin != null && !origin.isEmpty()) headers.put("Origin", origin);

        String range = session.getHeaders().get("range");

        Request.Builder rb = new Request.Builder().url(url).get();
        for (Map.Entry<String, String> e : headers.entrySet()) {
            rb.header(e.getKey(), e.getValue());
        }
        if (range != null) rb.header("Range", range);

        Response.IStatus status;
        Response out;
        okhttp3.Response resp = client.newCall(rb.build()).execute();
        String finalUrl = resp.request().url().toString(); // après redirections

        String contentType = resp.header("Content-Type", "");
        boolean isPlaylist = (contentType != null && contentType.contains("mpegurl")) || url.contains(".m3u8");

        // raw=1 (téléchargeur) : playlist non réécrite, plus l'URL finale pour les URI relatives.
        if (isPlaylist && raw) {
            String body = resp.body() != null ? resp.body().string() : "";
            out = newFixedLengthResponse(Response.Status.OK, "application/vnd.apple.mpegurl", body);
            out.addHeader("X-Upstream-Url", finalUrl);
            return cors(out);
        }

        if (isPlaylist) {
            String body = resp.body() != null ? resp.body().string() : "";
            String rewritten = rewritePlaylist(body, finalUrl, detected, referer, origin);
            out = newFixedLengthResponse(Response.Status.OK,
                    "application/vnd.apple.mpegurl", rewritten);
            return cors(out);
        }

        status = mapStatus(resp.code());
        InputStream in = resp.body() != null ? resp.body().byteStream() : null;
        long len = resp.body() != null ? resp.body().contentLength() : -1;
        String mime = (contentType != null && !contentType.isEmpty()) ? contentType : "application/octet-stream";

        if (in == null) {
            return cors(newFixedLengthResponse(status, "text/plain", ""));
        }
        if (len >= 0) {
            out = newFixedLengthResponse(status, mime, in, len);
        } else {
            out = newChunkedResponse(status, mime, in);
        }
        String contentRange = resp.header("Content-Range");
        if (contentRange != null) out.addHeader("Content-Range", contentRange);
        out.addHeader("Accept-Ranges", "bytes");
        out.addHeader("X-Upstream-Url", finalUrl);
        return cors(out);
    }

    /** Chaque segment repasse par ce proxy (parité transformPlaylist). */
    private String rewritePlaylist(String content, String baseUrl, String provider,
                                   String referer, String origin) {
        String proxyBase = "http://127.0.0.1:" + getListeningPort() + "/video/proxy";
        String effectiveProvider = (provider != null && !provider.isEmpty()) ? provider : "unknown";
        StringBuilder sb = new StringBuilder();
        String[] lines = content.split("\n", -1);
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i];
            String trimmed = line.trim();
            if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                sb.append(line);
            } else {
                String abs = resolveUrl(baseUrl, trimmed);
                sb.append(proxyBase).append("?url=").append(enc(abs))
                  .append("&provider=").append(enc(effectiveProvider));
                if (referer != null && !referer.isEmpty()) {
                    sb.append("&referer=").append(enc(referer));
                }
                if (origin != null && !origin.isEmpty()) {
                    sb.append("&origin=").append(enc(origin));
                }
                sb.append("&t=").append(token);
            }
            if (i < lines.length - 1) sb.append("\n");
        }
        return sb.toString();
    }

    // Route /local : fichiers téléchargés

    private Response handleLocal(String id, String relPath, IHTTPSession session) throws Exception {
        File f = resolveLocalFile(id, relPath);
        if (f == null) {
            return cors(newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "Fichier introuvable"));
        }

        // Le port n'est connu qu'à l'exécution : impossible à figer au téléchargement.
        if (f.getName().endsWith(".m3u8")) {
            String content = new String(readAll(new FileInputStream(f)), "UTF-8");
            String rewritten = rewriteLocalPlaylist(content, id);
            Response out = newFixedLengthResponse(Response.Status.OK,
                    "application/vnd.apple.mpegurl", rewritten);
            return cors(out);
        }

        String mime = localMime(f.getName());
        long size = f.length();
        String range = session.getHeaders().get("range");

        if (range != null) {
            long[] bounds = parseByteRange(range, size);
            if (bounds == null) {
                Response r = newFixedLengthResponse(Response.Status.RANGE_NOT_SATISFIABLE, "text/plain", "");
                r.addHeader("Content-Range", "bytes */" + size);
                return cors(r);
            }
            long start = bounds[0], end = bounds[1];
            long len = end - start + 1;
            FileInputStream fis = new FileInputStream(f);
            // `skip()` peut sauter moins que demandé et servir le mauvais offset ; `position()` est exact.
            fis.getChannel().position(start);
            Response out = newFixedLengthResponse(Response.Status.PARTIAL_CONTENT, mime, fis, len);
            out.addHeader("Content-Range", "bytes " + start + "-" + end + "/" + size);
            out.addHeader("Accept-Ranges", "bytes");
            return cors(out);
        }

        Response out = newFixedLengthResponse(Response.Status.OK, mime, new FileInputStream(f), size);
        out.addHeader("Accept-Ranges", "bytes");
        return cors(out);
    }

    /** Clé et init inclus. */
    private String rewriteLocalPlaylist(String content, String id) {
        String base = "http://127.0.0.1:" + getListeningPort() + "/local?id=" + enc(id) + "&path=";
        String tokenSuffix = "&t=" + token;
        StringBuilder sb = new StringBuilder();
        String[] lines = content.split("\n", -1);
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i];
            String t = line.trim();
            if (t.isEmpty()) {
                sb.append(line);
            } else if (t.startsWith("#")) {
                // Clé AES, init fMP4.
                Matcher m = Pattern.compile("URI=\"([^\"]+)\"").matcher(line);
                if (m.find()) {
                    sb.append(line.substring(0, m.start()))
                      .append("URI=\"").append(base).append(enc(m.group(1))).append(tokenSuffix).append("\"")
                      .append(line.substring(m.end()));
                } else {
                    sb.append(line);
                }
            } else {
                sb.append(base).append(enc(t)).append(tokenSuffix);
            }
            if (i < lines.length - 1) sb.append("\n");
        }
        return sb.toString();
    }

    private static String localMime(String name) {
        String n = name.toLowerCase(Locale.ROOT);
        if (n.endsWith(".mp4")) return "video/mp4";
        if (n.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
        if (n.endsWith(".ts")) return "video/mp2t";
        if (n.endsWith(".m4s")) return "video/iso.segment";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        return "application/octet-stream";
    }

    private static byte[] readAll(InputStream in) throws Exception {
        java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) != -1) bos.write(buf, 0, n);
        in.close();
        return bos.toByteArray();
    }

    // En-têtes et hébergeur (la table vient du JS)

    private Map<String, String> configHeaders(String provider) {
        Map<String, String> out = new LinkedHashMap<>();
        JSONObject headersObj = null;
        JSONObject pc = configs.optJSONObject("providerConfigs");
        JSONObject prov = (pc != null && provider != null) ? pc.optJSONObject(provider) : null;
        if (prov != null) {
            headersObj = prov.optJSONObject("headers");
        } else {
            JSONObject def = configs.optJSONObject("defaultConfig");
            if (def != null) headersObj = def.optJSONObject("headers");
        }
        if (headersObj != null) {
            Iterator<String> keys = headersObj.keys();
            while (keys.hasNext()) {
                String k = keys.next();
                // Imposé, il couperait la décompression d'OkHttp, qui ne décode pas le brotli.
                if ("accept-encoding".equalsIgnoreCase(k)) continue;
                out.put(k, headersObj.optString(k));
            }
        }
        return out;
    }

    private JSONObject providerConfig(String provider) {
        JSONObject providerConfigs = configs.optJSONObject("providerConfigs");
        return providerConfigs != null && provider != null
                ? providerConfigs.optJSONObject(provider) : null;
    }

    /** Plage unique. null = syntaxe ou bornes non servables. */
    static long[] parseByteRange(String header, long size) {
        if (header == null || size <= 0) return null;
        Matcher matcher = Pattern.compile("^bytes=(\\d*)-(\\d*)$").matcher(header.trim());
        if (!matcher.matches()) return null;
        try {
            String from = matcher.group(1);
            String to = matcher.group(2);
            if (from.isEmpty() && to.isEmpty()) return null;
            long start;
            long end;
            if (from.isEmpty()) {
                long suffix = Long.parseLong(to);
                if (suffix <= 0) return null;
                start = Math.max(0, size - suffix);
                end = size - 1;
            } else {
                start = Long.parseLong(from);
                end = to.isEmpty() ? size - 1 : Long.parseLong(to);
            }
            if (start < 0 || start >= size || end < start) return null;
            return new long[]{ start, Math.min(end, size - 1) };
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    /** Pilotée par les domaines de la recette. */
    private String detectProvider(String url) {
        if (url == null) return null;
        String host = hostOf(url);
        JSONObject providerConfigs = configs.optJSONObject("providerConfigs");
        if (host == null || providerConfigs == null) return null;
        Iterator<String> keys = providerConfigs.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            JSONObject source = providerConfigs.optJSONObject(key);
            JSONArray domains = source != null ? source.optJSONArray("domains") : null;
            if (domains == null) continue;
            for (int i = 0; i < domains.length(); i++) {
                String domain = domains.optString(i, "").toLowerCase(Locale.ROOT);
                if (!domain.isEmpty() && (host.equals(domain) || host.endsWith("." + domain))) {
                    return key;
                }
            }
        }
        return null;
    }

    private String canonicalizeUrl(String url, String provider) {
        JSONObject source = providerConfig(provider);
        String canonicalHost = source != null ? source.optString("canonicalHost", "") : "";
        String hostMatch = source != null ? source.optString("hostMatch", "") : "";
        if (canonicalHost.isEmpty() || hostMatch.isEmpty()) return url;
        try {
            URI parsed = new URI(url);
            String host = parsed.getHost();
            if (host != null && host.contains(hostMatch) && !host.endsWith(canonicalHost)) {
                return new URI(parsed.getScheme(), null, canonicalHost, parsed.getPort(),
                        parsed.getPath(), parsed.getQuery(), parsed.getFragment()).toString();
            }
        } catch (Exception ignored) {}
        return url;
    }

    private static String mediaReferer(String url, JSONObject source) {
        JSONObject rule = source != null ? source.optJSONObject("mp4Referer") : null;
        if (rule == null) return null;
        String pattern = rule.optString("pattern", "");
        String template = rule.optString("template", "");
        if (pattern.isEmpty() || template.isEmpty()) return null;
        try {
            Matcher matcher = Pattern.compile(pattern).matcher(url);
            if (!matcher.find()) return null;
            String result = template;
            for (int i = 0; i <= matcher.groupCount(); i++) {
                result = result.replace("{" + i + "}", matcher.group(i) != null ? matcher.group(i) : "");
            }
            return result;
        } catch (Exception ignored) {
            return null;
        }
    }

    /** Loopback, LAN, link-local, multicast et plages IPv4 réservées. */
    static boolean isForbiddenAddress(InetAddress address) {
        if (address.isAnyLocalAddress() || address.isLoopbackAddress() ||
                address.isLinkLocalAddress() || address.isSiteLocalAddress() ||
                address.isMulticastAddress()) return true;

        byte[] raw = address.getAddress();
        if (raw.length == 16) {
            int first = raw[0] & 0xff;
            return (first & 0xfe) == 0xfc; // IPv6 unique-local fc00::/7
        }
        if (raw.length != 4) return true;

        int a = raw[0] & 0xff;
        int b = raw[1] & 0xff;
        int c = raw[2] & 0xff;
        if (a == 0 || a >= 224) return true;
        if (a == 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
        if (a == 192 && b == 0 && (c == 0 || c == 2)) return true;
        if (a == 198 && (b == 18 || b == 19 || b == 51)) return true;
        return a == 203 && b == 0 && c == 113;
    }

    private static String hostOf(String url) {
        Matcher m = AUTHORITY.matcher(url);
        if (m.matches()) {
            String auth = m.group(2);
            int at = auth.indexOf('@');
            if (at >= 0) auth = auth.substring(at + 1);
            int colon = auth.indexOf(':');
            if (colon >= 0) auth = auth.substring(0, colon);
            return auth.toLowerCase(Locale.ROOT);
        }
        return null;
    }

    private static String originOf(String url) {
        Matcher m = AUTHORITY.matcher(url);
        if (m.matches()) {
            return m.group(1) + m.group(2);
        }
        return null;
    }

    /** Parité avec transformPlaylist. */
    static String resolveUrl(String baseUrl, String line) {
        if (line.startsWith("http://") || line.startsWith("https://")) return line;
        Matcher m = AUTHORITY.matcher(baseUrl);
        if (!m.matches()) return line;
        String schemeHost = m.group(1) + m.group(2);
        if (line.startsWith("/")) {
            return schemeHost + line;
        }
        String path = m.group(3); // commence par "/" ou vide, peut contenir ?query
        int q = path.indexOf('?');
        if (q >= 0) path = path.substring(0, q);
        int slash = path.lastIndexOf('/');
        String dir = slash >= 0 ? path.substring(0, slash + 1) : "/";
        return schemeHost + dir + line;
    }

    private static String enc(String s) {
        try {
            return URLEncoder.encode(s, "UTF-8");
        } catch (Exception e) {
            return s;
        }
    }

    private static String first(Map<String, java.util.List<String>> params, String key) {
        if (params == null) return null;
        java.util.List<String> v = params.get(key);
        return (v != null && !v.isEmpty()) ? v.get(0) : null;
    }

    private static Response.IStatus mapStatus(int code) {
        Response.Status s = Response.Status.lookup(code);
        return s != null ? s : Response.Status.OK;
    }

    private static Response cors(Response r) {
        r.addHeader("Access-Control-Allow-Origin", "*");
        r.addHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
        r.addHeader("Access-Control-Allow-Headers", "Range, Content-Type");
        return r;
    }
}
