package com.nartya.app.proxy;

import android.util.Base64;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

/**
 * Équivalent de electron/utils/download-manager.js. Le réseau vidéo passe par le proxy local ;
 * `&raw=1` récupère les playlists non réécrites, X-Upstream-Url donne l'URL finale.
 * Stockage : downloadsRoot/<base64url(id)>/, avec un index JSON persistant.
 */
public class Downloads {

    public interface Listener {
        void onProgress(JSONObject item);
    }

    private static final int MP4_CONNECTIONS = 4;
    private static final long MP4_MIN_PARALLEL_BYTES = 8L * 1024 * 1024;
    private static final int HLS_SEGMENT_CONCURRENCY = 6;
    private static final int SCAN_PAGE_CONCURRENCY = 6;
    private static final int IO_THREADS = 12; // 2 jobs × 6 segments au maximum
    private static final int SEGMENT_MAX_ATTEMPTS = 3;

    private final File root;
    private final OkHttpClient client;
    private final Listener listener;
    private volatile int proxyPort = 0;
    private volatile String proxyToken = "";

    private final Map<String, JSONObject> index = new ConcurrentHashMap<>();
    private final Map<String, AtomicBoolean> cancelFlags = new ConcurrentHashMap<>();
    private final ExecutorService jobs = Executors.newFixedThreadPool(2);
    private final ExecutorService io = Executors.newFixedThreadPool(IO_THREADS);
    private long lastIndexSaveAt = 0;

    private static class SourceContext {
        final String provider;
        final String referer;
        final String origin;

        SourceContext(String provider, String referer, String origin) {
            this.provider = provider != null ? provider : "";
            this.referer = referer != null ? referer : "";
            this.origin = origin != null ? origin : "";
        }
    }

    public Downloads(File downloadsRoot, Listener listener) {
        this.root = downloadsRoot;
        this.listener = listener;
        this.client = new OkHttpClient.Builder()
                .connectTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
                .readTimeout(60, java.util.concurrent.TimeUnit.SECONDS)
                .build();
        if (!root.exists()) root.mkdirs();
        loadIndex();
        // Arrêt brutal : fichier final présent, seul l'index manquait ; sinon les fragments restent
        // pour la reprise.
        for (JSONObject it : index.values()) {
            String st = it.optString("status");
            if ("downloading".equals(st) || "queued".equals(st)) {
                try {
                    boolean isScan = "scan".equals(it.optString("type"));
                    boolean complete = isScan
                            ? isScanChapterComplete(ProxyServer.itemDir(it.optString("id")), it.optInt("pages", 0))
                            : completedFileName(ProxyServer.itemDir(it.optString("id"))) != null;
                    if (complete) {
                        it.put("status", "done");
                        it.put("percent", 100);
                        if (!isScan) it.put("file", completedFileName(ProxyServer.itemDir(it.optString("id"))));
                        it.remove("error");
                    } else {
                        it.put("status", "interrupted");
                        it.put("error", "Interrompu — reprise dès le retour en ligne");
                    }
                } catch (Exception ignored) {}
            }
        }
        saveIndex();
    }

    public void setProxy(int port, String token) {
        this.proxyPort = port;
        this.proxyToken = token != null ? token : "";
    }

    // API exposée au plugin

    public List<JSONObject> list() {
        return new ArrayList<>(index.values());
    }

    public int activeCount() {
        int count = 0;
        for (JSONObject item : index.values()) {
            String status = item.optString("status");
            if ("queued".equals(status) || "downloading".equals(status)) count++;
        }
        return count;
    }

    public synchronized boolean start(JSONObject payload) {
        boolean isScan = "scan".equals(payload.optString("type"));
        String id = payload.optString("id", null);
        String directUrl = isScan ? null : payload.optString("directUrl", null);
        if (id == null || id.isEmpty() || (!isScan && directUrl == null)) return false;
        if (isScan && (payload.optString("oeuvre", null) == null || payload.optInt("pages", 0) <= 0
                || payload.optString("imageBase", null) == null)) return false;

        JSONObject existing = index.get(id);
        if (existing != null) {
            String st = existing.optString("status");
            if ("done".equals(st) || "downloading".equals(st) || "queued".equals(st)) return false;
        }

        JSONObject item = existing != null ? existing : new JSONObject();
        try {
            item.put("id", id);
            item.put("slug", payload.optString("slug"));
            item.put("animeTitle", payload.optString("animeTitle", payload.optString("slug")));
            item.put("animeCover", payload.opt("animeCover"));
            if (isScan) {
                item.put("type", "scan");
                item.put("oeuvre", payload.optString("oeuvre"));
                item.put("oeuvreLabel", payload.opt("oeuvreLabel"));
                item.put("chapter", payload.opt("chapter"));
                item.put("folder", payload.opt("folder"));
                item.put("pages", payload.optInt("pages", 0));
                item.put("imageBase", payload.optString("imageBase"));
            } else {
                item.put("seasonId", payload.optString("seasonId"));
                item.put("ep", payload.opt("ep"));
                item.put("lang", payload.optString("lang"));
                item.put("epThumb", payload.opt("epThumb"));
                item.put("epTitle", payload.opt("epTitle"));
                item.put("seasonName", payload.opt("seasonName"));
                item.put("provider", payload.optString("provider"));
                item.put("maxHeight", payload.optInt("maxHeight", 0));
                item.put("sourcePreference", payload.optString("sourcePreference", "auto"));
            }
            item.put("status", "queued");
            item.put("percent", 0);
            item.put("sizeBytes", 0);
            item.put("createdAt", item.optLong("createdAt", System.currentTimeMillis()));
            item.remove("error");
            item.remove("finishedAt");
            item.remove("file");
        } catch (Exception ignored) {}
        index.put(id, item);
        saveIndex();
        emit(item);

        AtomicBoolean cancel = new AtomicBoolean(false);
        cancelFlags.put(id, cancel);
        final String coverUrl = payload.optString("animeCover", "");

        if (isScan) {
            jobs.submit(() -> runScanJob(id, cancel));
        } else {
            final SourceContext source = new SourceContext(
                    payload.optString("provider", ""),
                    payload.optString("referer", ""),
                    payload.optString("origin", ""));
            final int maxHeight = payload.optInt("maxHeight", 0); // 0 = max (pas de plafond)
            final String thumbUrl = payload.optString("epThumb", "");
            jobs.submit(() -> runJob(id, directUrl, source, maxHeight, coverUrl, thumbUrl, cancel));
        }
        return true;
    }

    public void cancel(String id) {
        AtomicBoolean c = cancelFlags.get(id);
        if (c != null) c.set(true);
        remove(id);
    }

    public void remove(String id) {
        // Un id vide désignerait la racine des téléchargements.
        if (id == null || id.isEmpty()) return;
        AtomicBoolean c = cancelFlags.get(id);
        if (c != null) c.set(true);
        deleteDir(ProxyServer.itemDir(id));
        index.remove(id);
        cancelFlags.remove(id);
        saveIndex();
    }

    // Exécution d'un téléchargement

    private void runJob(String id, String directUrl, SourceContext source, int maxHeight,
                        String coverUrl, String thumbUrl, AtomicBoolean cancel) {
        File dir = ProxyServer.itemDir(id);
        dir.mkdirs();
        try {
            patch(id, "status", "downloading", "percent", 0);

            // Best-effort, pour la bibliothèque hors ligne.
            SourceContext imageSource = new SourceContext(source.provider, "", "");
            if (!coverUrl.isEmpty() && cacheImage(coverUrl, imageSource, new File(dir, "cover.jpg")))
                patch(id, "coverFile", "cover.jpg");
            if (!thumbUrl.isEmpty() && cacheImage(thumbUrl, imageSource, new File(dir, "thumb.jpg")))
                patch(id, "thumbFile", "thumb.jpg");

            boolean isHls = directUrl.matches(".*\\.m3u8(\\?.*)?$");
            String file;
            long size;
            if (isHls) {
                long[] s = downloadHls(id, directUrl, source, maxHeight, dir, cancel);
                file = "playlist.m3u8"; size = s[0];
            } else {
                long[] s = downloadMp4(id, directUrl, source, dir, cancel);
                file = "video.mp4"; size = s[0];
            }
            if (cancel.get()) return;
            patch(id, "status", "done", "percent", 100, "file", file, "sizeBytes", size,
                    "finishedAt", System.currentTimeMillis());
        } catch (Exception e) {
            if (cancel.get()) return; // annulation utilisateur : remove() a déjà nettoyé
            patch(id, "status", "error", "error", e.getMessage() != null ? e.getMessage() : "Échec");
        } finally {
            cancelFlags.remove(id);
        }
    }

    private void runScanJob(String id, AtomicBoolean cancel) {
        File dir = ProxyServer.itemDir(id);
        dir.mkdirs();
        try {
            patch(id, "status", "downloading", "percent", 0);
            JSONObject item = index.get(id);
            String coverUrl = item != null ? item.optString("animeCover", "") : "";
            if (!coverUrl.isEmpty()) {
                SourceContext imageSource = new SourceContext("", "", "");
                if (cacheImage(coverUrl, imageSource, new File(dir, "cover.jpg"))) patch(id, "coverFile", "cover.jpg");
            }
            long size = downloadScanPages(id, dir, cancel);
            if (cancel.get()) return;
            patch(id, "status", "done", "percent", 100, "sizeBytes", size,
                    "finishedAt", System.currentTimeMillis());
        } catch (Exception e) {
            if (cancel.get()) return;
            patch(id, "status", "error", "error", e.getMessage() != null ? e.getMessage() : "Échec");
        } finally {
            cancelFlags.remove(id);
        }
    }

    /** Images publiques, en direct. Une page déjà sur disque est sautée. */
    private long downloadScanPages(String id, File dir, AtomicBoolean cancel) throws Exception {
        JSONObject item = index.get(id);
        if (item == null) throw new Exception("Entrée disparue");
        String imageBase = item.optString("imageBase");
        String oeuvre = item.optString("oeuvre");
        String folder = String.valueOf(item.opt("folder"));
        int total = item.optInt("pages", 0);
        if (total <= 0) throw new Exception("Chapitre sans page");

        AtomicLong received = new AtomicLong(0);
        AtomicLong doneCount = new AtomicLong(0);
        final long[] lastEmit = {0};
        final java.util.concurrent.atomic.AtomicInteger cursor = new java.util.concurrent.atomic.AtomicInteger(0);
        final int totalF = total;
        String encodedOeuvre = URLEncoder.encode(oeuvre, "UTF-8").replace("+", "%20");

        List<Future<?>> workers = new ArrayList<>();
        int concurrency = Math.min(SCAN_PAGE_CONCURRENCY, total);
        for (int w = 0; w < concurrency; w++) {
            workers.add(io.submit(() -> {
                while (true) {
                    if (cancel.get()) throw new RuntimeException("Annulé");
                    int page = cursor.incrementAndGet();
                    if (page > totalF) return null;
                    File dest = new File(dir, "p" + String.format(Locale.ROOT, "%03d", page) + ".jpg");
                    long bytes;
                    if (isCompleteFragment(dest)) {
                        bytes = dest.length();
                    } else {
                        String url = imageBase + "/" + encodedOeuvre + "/" + folder + "/" + page + ".jpg";
                        bytes = downloadToFileDirect(url, dest, cancel);
                    }
                    long tot = received.addAndGet(bytes);
                    long done = doneCount.incrementAndGet();
                    long now = System.currentTimeMillis();
                    synchronized (lastEmit) {
                        if (now - lastEmit[0] > 400 || done == totalF) {
                            lastEmit[0] = now;
                            patch(id, "status", "downloading", "percent", done * 100.0 / totalF, "sizeBytes", tot);
                        }
                    }
                    return null;
                }
            }));
        }
        awaitAll(workers);
        return received.get();
    }

    private long downloadToFileDirect(String url, File dest, AtomicBoolean cancel) throws Exception {
        Exception last = null;
        for (int attempt = 1; attempt <= SEGMENT_MAX_ATTEMPTS; attempt++) {
            if (cancel.get()) throw new Exception("Annulé");
            try {
                Request request = new Request.Builder().url(url).get().build();
                Response res = client.newCall(request).execute();
                if (!res.isSuccessful()) { res.close(); throw new Exception("HTTP " + res.code()); }
                File tmp = new File(dest.getParentFile(), dest.getName() + ".part");
                long bytes = 0;
                try (InputStream in = res.body().byteStream(); FileOutputStream out = new FileOutputStream(tmp)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) != -1) {
                        if (cancel.get()) throw new Exception("Annulé");
                        out.write(buf, 0, n);
                        bytes += n;
                    }
                } finally {
                    res.close();
                }
                tmp.renameTo(dest);
                return bytes;
            } catch (Exception e) {
                if (cancel.get()) throw e;
                last = e;
                if (attempt < SEGMENT_MAX_ATTEMPTS) Thread.sleep(500L * attempt);
            }
        }
        throw last != null ? last : new Exception("Échec page");
    }

    static boolean isScanChapterComplete(File dir, int pages) {
        if (dir == null || pages <= 0) return false;
        for (int page = 1; page <= pages; page++) {
            File f = new File(dir, "p" + String.format(Locale.ROOT, "%03d", page) + ".jpg");
            if (!isCompleteFragment(f)) return false;
        }
        return true;
    }

    // MP4

    private long[] downloadMp4(String id, String url, SourceContext source, File dir, AtomicBoolean cancel) throws Exception {
        long total = 0;
        boolean acceptsRange = false;
        try {
            Response probe = fetch(url, source, false, "bytes=0-1");
            if (probe.code() == 206) {
                String cr = probe.header("Content-Range");
                Matcher m = cr != null ? Pattern.compile("/(\\d+)\\s*$").matcher(cr) : null;
                if (m != null && m.find()) { total = Long.parseLong(m.group(1)); acceptsRange = true; }
            }
            probe.close();
        } catch (Exception ignored) {}

        if (acceptsRange && total > MP4_MIN_PARALLEL_BYTES) {
            try {
                return downloadMp4Parallel(id, url, source, dir, total, cancel);
            } catch (Exception e) {
                if (cancel.get()) throw e;
                // repli mono-flux
            }
        }
        return downloadMp4Single(id, url, source, dir, cancel);
    }

    private long[] downloadMp4Single(String id, String url, SourceContext source, File dir, AtomicBoolean cancel) throws Exception {
        File dest = new File(dir, "video.mp4");
        File tmp = new File(dir, "video.mp4.part");
        long received = tmp.exists() ? tmp.length() : 0;
        Response res = received > 0
                ? fetch(url, source, false, "bytes=" + received + "-")
                : fetch(url, source, false, null);
        boolean resuming = received > 0 && res.code() == 206;
        if (!resuming && received > 0) {
            res.close();
            received = 0;
            res = fetch(url, source, false, null);
        }
        if (!res.isSuccessful()) { res.close(); throw new Exception("HTTP " + res.code()); }
        long total = resuming
                ? totalFromContentRange(res.header("Content-Range"), received, res.body().contentLength())
                : res.body().contentLength();
        long lastEmit = 0;
        try (InputStream in = res.body().byteStream(); FileOutputStream out = new FileOutputStream(tmp, resuming)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) != -1) {
                if (cancel.get()) throw new Exception("Annulé");
                out.write(buf, 0, n);
                received += n;
                long now = System.currentTimeMillis();
                if (now - lastEmit > 400) {
                    lastEmit = now;
                    patch(id, "status", "downloading",
                            "percent", total > 0 ? (received * 100.0 / total) : 0, "sizeBytes", received);
                }
            }
        } finally {
            res.close();
        }
        tmp.renameTo(dest);
        return new long[]{ received };
    }

    private long[] downloadMp4Parallel(String id, String url, SourceContext source, File dir, long total, AtomicBoolean cancel) throws Exception {
        File dest = new File(dir, "video.mp4");
        File tmp = new File(dir, "video.mp4.part");
        try (RandomAccessFile raf = new RandomAccessFile(tmp, "rw")) {
            raf.setLength(total);
        }
        int parts = Math.max(1, (int) Math.min(MP4_CONNECTIONS, (total + MP4_MIN_PARALLEL_BYTES - 1) / MP4_MIN_PARALLEL_BYTES));
        long chunk = (total + parts - 1) / parts;
        AtomicLong received = new AtomicLong(0);
        List<Future<?>> futures = new ArrayList<>();
        final long[] lastEmit = {0};

        for (int i = 0; i < parts; i++) {
            final long start = i * chunk;
            if (start >= total) break;
            final long end = Math.min(start + chunk - 1, total - 1);
            futures.add(io.submit(() -> {
                Response res = fetch(url, source, false, "bytes=" + start + "-" + end);
                if (res.code() != 206) { res.close(); throw new RuntimeException("Range non honoré (HTTP " + res.code() + ")"); }
                try (InputStream in = res.body().byteStream();
                     RandomAccessFile raf = new RandomAccessFile(tmp, "rw")) {
                    raf.seek(start);
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) != -1) {
                        if (cancel.get()) throw new RuntimeException("Annulé");
                        raf.write(buf, 0, n);
                        long tot = received.addAndGet(n);
                        long now = System.currentTimeMillis();
                        synchronized (lastEmit) {
                            if (now - lastEmit[0] > 400) {
                                lastEmit[0] = now;
                                patch(id, "status", "downloading", "percent", tot * 100.0 / total, "sizeBytes", tot);
                            }
                        }
                    }
                } finally {
                    res.close();
                }
                return null;
            }));
        }
        awaitAll(futures);
        tmp.renameTo(dest);
        return new long[]{ total };
    }

    // HLS

    private long[] downloadHls(String id, String directUrl, SourceContext source, int maxHeight, File dir, AtomicBoolean cancel) throws Exception {
        Pl pl = fetchPlaylist(directUrl, source);
        if (Pattern.compile("#EXT-X-STREAM-INF", Pattern.CASE_INSENSITIVE).matcher(pl.text).find()) {
            String variant = pickBestVariant(pl.text, pl.baseUrl, maxHeight);
            if (variant != null) pl = fetchPlaylist(variant, source);
        }

        String[] lines = pl.text.split("\r?\n");
        List<String[]> segments = new ArrayList<>(); // [url, name]
        List<String> outLines = new ArrayList<>();
        String keyUrl = null, mapUrl = null;

        for (String raw : lines) {
            String line = raw.trim();
            if (line.startsWith("#EXT-X-KEY")) {
                String uri = attrUri(line);
                if (uri != null && !line.matches(".*METHOD=NONE.*")) {
                    keyUrl = resolveUri(uri, pl.baseUrl);
                    outLines.add(raw.replaceFirst("URI=\"[^\"]+\"", "URI=\"key.bin\""));
                } else outLines.add(raw);
                continue;
            }
            if (line.startsWith("#EXT-X-MAP")) {
                String uri = attrUri(line);
                if (uri != null) {
                    mapUrl = resolveUri(uri, pl.baseUrl);
                    outLines.add(raw.replaceFirst("URI=\"[^\"]+\"", "URI=\"init.mp4\""));
                } else outLines.add(raw);
                continue;
            }
            if (line.isEmpty() || line.startsWith("#")) { outLines.add(raw); continue; }
            String name = "seg" + String.format(Locale.ROOT, "%05d", segments.size()) + segExt(line);
            segments.add(new String[]{ resolveUri(line, pl.baseUrl), name });
            outLines.add(name);
        }
        if (segments.isEmpty()) throw new Exception("Playlist HLS sans segment");

        if (keyUrl != null && !isCompleteFragment(new File(dir, "key.bin"))) {
            downloadToFile(keyUrl, source, new File(dir, "key.bin"), cancel);
        }
        if (mapUrl != null && !isCompleteFragment(new File(dir, "init.mp4"))) {
            downloadToFile(mapUrl, source, new File(dir, "init.mp4"), cancel);
        }

        final int totalSeg = segments.size();
        AtomicLong received = new AtomicLong(0);
        AtomicLong doneCount = new AtomicLong(0);
        final long[] lastEmit = {0};
        final java.util.concurrent.atomic.AtomicInteger cursor = new java.util.concurrent.atomic.AtomicInteger(0);

        List<Future<?>> workers = new ArrayList<>();
        int concurrency = Math.min(HLS_SEGMENT_CONCURRENCY, totalSeg);
        for (int w = 0; w < concurrency; w++) {
            workers.add(io.submit(() -> {
                while (true) {
                    if (cancel.get()) throw new RuntimeException("Annulé");
                    int i = cursor.getAndIncrement();
                    if (i >= totalSeg) return null;
                    String[] seg = segments.get(i);
                    File segmentFile = new File(dir, seg[1]);
                    long bytes = isCompleteFragment(segmentFile)
                            ? segmentFile.length()
                            : downloadToFile(seg[0], source, segmentFile, cancel);
                    received.addAndGet(bytes);
                    long done = doneCount.incrementAndGet();
                    long now = System.currentTimeMillis();
                    synchronized (lastEmit) {
                        if (now - lastEmit[0] > 400 || done == totalSeg) {
                            lastEmit[0] = now;
                            patch(id, "status", "downloading", "percent", done * 100.0 / totalSeg, "sizeBytes", received.get());
                        }
                    }
                }
            }));
        }
        awaitAll(workers);

        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < outLines.size(); i++) {
            sb.append(outLines.get(i));
            if (i < outLines.size() - 1) sb.append("\n");
        }
        writeFile(new File(dir, "playlist.m3u8"), sb.toString().getBytes("UTF-8"));
        return new long[]{ received.get() };
    }

    private static class Pl { String text; String baseUrl; }

    static String completedFileName(File dir) {
        if (dir == null) return null;
        File mp4 = new File(dir, "video.mp4");
        if (isCompleteFragment(mp4)) return "video.mp4";
        File hls = new File(dir, "playlist.m3u8");
        if (isCompleteFragment(hls)) return "playlist.m3u8";
        return null;
    }

    static boolean isCompleteFragment(File file) {
        return file != null && file.isFile() && file.length() > 0;
    }

    static long totalFromContentRange(String contentRange, long offset, long remaining) {
        if (contentRange != null) {
            Matcher matcher = Pattern.compile("/(\\d+)\\s*$").matcher(contentRange);
            if (matcher.find()) {
                try { return Long.parseLong(matcher.group(1)); } catch (NumberFormatException ignored) {}
            }
        }
        return remaining >= 0 ? offset + remaining : -1;
    }

    private Pl fetchPlaylist(String url, SourceContext source) throws Exception {
        Response res = fetch(url, source, true, null); // raw=1
        if (!res.isSuccessful()) { res.close(); throw new Exception("HTTP " + res.code()); }
        Pl pl = new Pl();
        pl.text = res.body().string();
        String upstream = res.header("X-Upstream-Url");
        pl.baseUrl = upstream != null ? upstream : url;
        res.close();
        return pl;
    }

    private String pickBestVariant(String master, String baseUrl, int maxHeight) {
        String[] lines = master.split("\r?\n");
        List<long[]> idx = new ArrayList<>();   // [lineIndex, bw, height]
        List<String> uris = new ArrayList<>();
        for (int i = 0; i < lines.length; i++) {
            if (!lines[i].startsWith("#EXT-X-STREAM-INF")) continue;
            Matcher bwM = Pattern.compile("BANDWIDTH=(\\d+)").matcher(lines[i]);
            Matcher resM = Pattern.compile("RESOLUTION=\\d+x(\\d+)", Pattern.CASE_INSENSITIVE).matcher(lines[i]);
            long bw = bwM.find() ? Long.parseLong(bwM.group(1)) : 0;
            long h = resM.find() ? Long.parseLong(resM.group(1)) : 0;
            int j = i + 1;
            while (j < lines.length && (lines[j].trim().isEmpty() || lines[j].startsWith("#"))) j++;
            if (j < lines.length) { idx.add(new long[]{ bw, h }); uris.add(resolveUri(lines[j].trim(), baseUrl)); }
        }
        if (uris.isEmpty()) return null;
        int best = -1;
        if (maxHeight <= 0) { // max : plus haut débit
            long bw = -1;
            for (int i = 0; i < idx.size(); i++) if (idx.get(i)[0] > bw) { bw = idx.get(i)[0]; best = i; }
        } else {
            long bw = -1;
            for (int i = 0; i < idx.size(); i++) {
                long h = idx.get(i)[1];
                if (h > 0 && h <= maxHeight && idx.get(i)[0] > bw) { bw = idx.get(i)[0]; best = i; }
            }
            if (best == -1) { // aucune sous le plafond : plus basse résolution connue
                long hMin = Long.MAX_VALUE;
                for (int i = 0; i < idx.size(); i++) { long h = idx.get(i)[1]; if (h > 0 && h < hMin) { hMin = h; best = i; } }
            }
            if (best == -1) best = 0;
        }
        return best >= 0 ? uris.get(best) : null;
    }

    private long downloadToFile(String url, SourceContext source, File dest, AtomicBoolean cancel) throws Exception {
        Exception last = null;
        for (int attempt = 1; attempt <= SEGMENT_MAX_ATTEMPTS; attempt++) {
            if (cancel.get()) throw new Exception("Annulé");
            try {
                Response res = fetch(url, source, false, null);
                if (!res.isSuccessful()) { res.close(); throw new Exception("HTTP " + res.code()); }
                File tmp = new File(dest.getParentFile(), dest.getName() + ".part");
                long bytes = 0;
                try (InputStream in = res.body().byteStream(); FileOutputStream out = new FileOutputStream(tmp)) {
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) != -1) {
                        if (cancel.get()) throw new Exception("Annulé");
                        out.write(buf, 0, n);
                        bytes += n;
                    }
                } finally {
                    res.close();
                }
                tmp.renameTo(dest);
                return bytes;
            } catch (Exception e) {
                if (cancel.get()) throw e;
                last = e;
                if (attempt < SEGMENT_MAX_ATTEMPTS) Thread.sleep(500L * attempt);
            }
        }
        throw last != null ? last : new Exception("Échec segment");
    }

    private boolean cacheImage(String url, SourceContext source, File dest) {
        try {
            Response res = fetch(url, source, false, null);
            if (!res.isSuccessful()) { res.close(); return false; }
            try (InputStream in = res.body().byteStream(); FileOutputStream out = new FileOutputStream(dest)) {
                byte[] buf = new byte[16 * 1024];
                int n;
                while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
            } finally { res.close(); }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    // Réseau, via le proxy local

    private Response fetch(String targetUrl, SourceContext source, boolean raw, String range) throws Exception {
        String u = "http://127.0.0.1:" + proxyPort + "/video/proxy?url=" + enc(targetUrl)
                + "&provider=" + enc(source != null ? source.provider : "");
        if (source != null && !source.referer.isEmpty()) u += "&referer=" + enc(source.referer);
        if (source != null && !source.origin.isEmpty()) u += "&origin=" + enc(source.origin);
        if (raw) u += "&raw=1";
        u += "&t=" + enc(proxyToken);
        Request.Builder rb = new Request.Builder().url(u).get();
        if (range != null) rb.header("Range", range);
        return client.newCall(rb.build()).execute();
    }

    // Index persistant

    private void loadIndex() {
        File f = new File(root, "index.json");
        if (!f.exists()) return;
        try {
            byte[] data = new byte[(int) f.length()];
            try (java.io.FileInputStream in = new java.io.FileInputStream(f)) { in.read(data); }
            JSONObject obj = new JSONObject(new String(data, "UTF-8"));
            IterableKeys(obj);
        } catch (Exception ignored) {}
    }

    private void IterableKeys(JSONObject obj) {
        java.util.Iterator<String> it = obj.keys();
        while (it.hasNext()) {
            String k = it.next();
            JSONObject v = obj.optJSONObject(k);
            if (v != null) index.put(k, v);
        }
    }

    private synchronized void saveIndex() {
        try {
            JSONObject obj = new JSONObject();
            for (Map.Entry<String, JSONObject> e : index.entrySet()) obj.put(e.getKey(), e.getValue());
            writeFile(new File(root, "index.json"), obj.toString().getBytes("UTF-8"));
            lastIndexSaveAt = System.currentTimeMillis();
        } catch (Exception ignored) {}
    }

    private synchronized void saveIndexThrottled() {
        if (System.currentTimeMillis() - lastIndexSaveAt >= 2_000) saveIndex();
    }

    private void patch(String id, Object... kv) {
        JSONObject it = index.get(id);
        if (it == null) return;
        boolean progressUpdate = false;
        try {
            for (int i = 0; i + 1 < kv.length; i += 2) {
                String key = (String) kv[i];
                Object value = kv[i + 1];
                it.put(key, value);
                if ("status".equals(key) && "downloading".equals(value)) progressUpdate = true;
            }
        } catch (Exception ignored) {}
        if (progressUpdate) saveIndexThrottled();
        else saveIndex();
        emit(it);
    }

    private void emit(JSONObject item) {
        if (listener != null) listener.onProgress(item);
    }

    // Utilitaires

    private static void awaitAll(List<Future<?>> futures) throws Exception {
        Exception err = null;
        for (Future<?> f : futures) {
            try { f.get(); } catch (Exception e) { if (err == null) err = e; }
        }
        if (err != null) throw err;
    }

    private static String resolveUri(String uri, String baseUrl) {
        try { return new java.net.URI(baseUrl).resolve(uri).toString(); }
        catch (Exception e) { return uri; }
    }

    private static String attrUri(String line) {
        Matcher m = Pattern.compile("URI=\"([^\"]+)\"").matcher(line);
        return m.find() ? m.group(1) : null;
    }

    private static String segExt(String uri) {
        String p = uri.split("\\?")[0].toLowerCase(Locale.ROOT);
        if (p.endsWith(".m4s")) return ".m4s";
        if (p.endsWith(".mp4")) return ".mp4";
        if (p.endsWith(".aac")) return ".aac";
        return ".ts";
    }

    private static String enc(String s) {
        try { return URLEncoder.encode(s, "UTF-8"); } catch (Exception e) { return s; }
    }

    private static void writeFile(File f, byte[] data) throws Exception {
        try (FileOutputStream out = new FileOutputStream(f)) { out.write(data); }
    }

    private static void deleteDir(File dir) {
        if (dir == null || !dir.exists()) return;
        File[] kids = dir.listFiles();
        if (kids != null) for (File k : kids) { if (k.isDirectory()) deleteDir(k); else k.delete(); }
        dir.delete();
    }
}
