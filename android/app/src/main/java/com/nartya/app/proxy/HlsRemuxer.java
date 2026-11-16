package com.nartya.app.proxy;

import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.os.StatFs;

import java.io.BufferedOutputStream;
import java.io.BufferedReader;
import java.io.DataInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.crypto.Cipher;
import javax.crypto.CipherInputStream;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Android n'embarque pas ffmpeg : un épisode HLS reste sinon en « playlist + segments », relu
 * par hls.js (lent à démarrer, image verte ou décalée sur certains décodeurs). Ici la playlist
 * locale du cœur Rust (URI relatives, clé en `key.bin`, init en `init.mp4`) est recollée dans un
 * fichier temporaire, déchiffrée au passage, puis recopiée sans réencodage dans un `video.mp4`
 * par MediaExtractor + MediaMuxer. Tout échec laisse le dossier intact.
 */
final class HlsRemuxer {
    private static final Pattern ATTR_URI = Pattern.compile("URI=\"([^\"]+)\"");
    private static final Pattern ATTR_IV = Pattern.compile("IV=0[xX]([0-9a-fA-F]+)");
    private static final String TMP = "concat.tmp";
    private static final String OUT = "video.mp4";
    private static final String OUT_PART = "video.mp4.part";

    private HlsRemuxer() {}

    private static final class Segment {
        final File file;
        final long sequence;
        final byte[] key;
        final byte[] iv; // null : dérivé de la séquence

        Segment(File file, long sequence, byte[] key, byte[] iv) {
            this.file = file;
            this.sequence = sequence;
            this.key = key;
            this.iv = iv;
        }
    }

    /** `true` si `video.mp4` est écrit ; `false` sans toucher aux segments sinon. */
    static boolean remux(File dir) {
        File tmp = new File(dir, TMP);
        File part = new File(dir, OUT_PART);
        File out = new File(dir, OUT);
        try {
            File playlist = new File(dir, "playlist.m3u8");
            if (!playlist.isFile()) return false;
            File init = new File(dir, "init.mp4");
            List<Segment> segments = parse(dir, playlist);
            if (segments == null || segments.isEmpty()) return false;

            long total = init.isFile() ? init.length() : 0;
            for (Segment s : segments) total += s.file.length();
            // Fichier recollé + mp4 final s'ajoutent aux segments : sans la place, on ne tente rien.
            if (new StatFs(dir.getAbsolutePath()).getAvailableBytes() < total * 2 + 64L * 1024 * 1024) {
                return false;
            }

            concat(tmp, init.isFile() ? init : null, segments);
            if (!copyStreams(tmp, part)) return false;
            if (part.length() == 0) return false;
            if (out.exists() && !out.delete()) return false;
            return part.renameTo(out);
        } catch (Throwable e) {
            return false;
        } finally {
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
            if (!out.exists() || out.length() == 0) {
                //noinspection ResultOfMethodCallIgnored
                part.delete();
            }
        }
    }

    /** Playlist locale → segments dans l'ordre, avec la clé et l'IV en vigueur pour chacun. */
    private static List<Segment> parse(File dir, File playlist) throws IOException {
        List<String> lines = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(new FileInputStream(playlist), StandardCharsets.UTF_8))) {
            String l;
            while ((l = reader.readLine()) != null) lines.add(l);
        }
        List<Segment> out = new ArrayList<>();
        long mediaSequence = 0;
        byte[] key = null;
        byte[] iv = null;
        for (String raw : lines) {
            String line = raw.trim();
            if (line.isEmpty()) continue;
            if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
                mediaSequence = Long.parseLong(line.substring("#EXT-X-MEDIA-SEQUENCE:".length()).trim());
            } else if (line.startsWith("#EXT-X-KEY")) {
                String upper = line.toUpperCase();
                if (upper.contains("METHOD=NONE")) {
                    key = null;
                    iv = null;
                } else if (upper.contains("METHOD=AES-128")) {
                    Matcher uri = ATTR_URI.matcher(line);
                    if (!uri.find()) return null;
                    File keyFile = new File(dir, uri.group(1));
                    // Seul `key.bin` est écrit par le cœur : une autre adresse n'a pas été récupérée.
                    if (!keyFile.isFile() || keyFile.length() != 16) return null;
                    key = new byte[16];
                    try (DataInputStream keyIn = new DataInputStream(new FileInputStream(keyFile))) {
                        keyIn.readFully(key);
                    }
                    Matcher ivm = ATTR_IV.matcher(line);
                    iv = ivm.find() ? hex(ivm.group(1)) : null;
                } else {
                    return null; // SAMPLE-AES et autres : hors de portée
                }
            } else if (line.startsWith("#EXT-X-BYTERANGE")) {
                return null; // le cœur ne gère pas non plus les plages d'octets
            } else if (!line.startsWith("#")) {
                File f = new File(dir, line);
                if (!f.isFile()) return null;
                out.add(new Segment(f, mediaSequence + out.size(), key, iv));
            }
        }
        return out;
    }

    private static byte[] hex(String s) {
        // Complété à gauche sur 16 octets, comme la spécification.
        String padded = ("00000000000000000000000000000000" + s);
        padded = padded.substring(padded.length() - 32);
        byte[] b = new byte[16];
        for (int i = 0; i < 16; i++) {
            b[i] = (byte) Integer.parseInt(padded.substring(i * 2, i * 2 + 2), 16);
        }
        return b;
    }

    private static byte[] sequenceIv(long sequence) {
        byte[] iv = new byte[16];
        for (int i = 0; i < 8; i++) {
            iv[15 - i] = (byte) (sequence >>> (8 * i));
        }
        return iv;
    }

    private static void concat(File dest, File init, List<Segment> segments) throws Exception {
        byte[] buffer = new byte[256 * 1024];
        try (OutputStream out = new BufferedOutputStream(new FileOutputStream(dest), 256 * 1024)) {
            if (init != null) copy(new FileInputStream(init), out, buffer);
            for (Segment s : segments) {
                InputStream in = new FileInputStream(s.file);
                if (s.key != null) {
                    Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
                    cipher.init(
                            Cipher.DECRYPT_MODE,
                            new SecretKeySpec(s.key, "AES"),
                            new IvParameterSpec(s.iv != null ? s.iv : sequenceIv(s.sequence)));
                    in = new CipherInputStream(in, cipher);
                }
                copy(in, out, buffer);
            }
        }
    }

    private static void copy(InputStream in, OutputStream out, byte[] buffer) throws IOException {
        try (InputStream source = in) {
            int n;
            while ((n = source.read(buffer)) > 0) out.write(buffer, 0, n);
        }
    }

    /**
     * Recopie les pistes audio et vidéo. Les horodatages sont recalés sur zéro avec un même
     * décalage pour toutes les pistes : le MPEG-TS démarre rarement à 0, et l'écart entre image
     * et son doit rester celui du flux.
     */
    private static boolean copyStreams(File source, File dest) throws Exception {
        MediaExtractor extractor = new MediaExtractor();
        MediaMuxer muxer = null;
        boolean started = false;
        try {
            extractor.setDataSource(source.getAbsolutePath());
            Map<Integer, Integer> trackMap = new HashMap<>();
            muxer = new MediaMuxer(dest.getAbsolutePath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            for (int i = 0; i < extractor.getTrackCount(); i++) {
                MediaFormat format = extractor.getTrackFormat(i);
                String mime = format.getString(MediaFormat.KEY_MIME);
                if (mime == null || !(mime.startsWith("video/") || mime.startsWith("audio/"))) continue;
                trackMap.put(i, muxer.addTrack(format));
            }
            if (trackMap.isEmpty()) return false;

            long offset = Long.MAX_VALUE;
            for (int track : trackMap.keySet()) {
                extractor.selectTrack(track);
                long first = extractor.getSampleTime();
                if (first >= 0 && first < offset) offset = first;
                extractor.unselectTrack(track);
            }
            if (offset == Long.MAX_VALUE) return false;
            for (int track : trackMap.keySet()) extractor.selectTrack(track);

            muxer.start();
            started = true;
            ByteBuffer buffer = ByteBuffer.allocate(2 * 1024 * 1024);
            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            long written = 0;
            while (true) {
                int track = extractor.getSampleTrackIndex();
                if (track < 0) break;
                Integer target = trackMap.get(track);
                if (target == null) {
                    extractor.advance();
                    continue;
                }
                long needed = extractor.getSampleSize();
                if (needed > buffer.capacity()) buffer = ByteBuffer.allocate((int) Math.min(needed * 2, Integer.MAX_VALUE - 8));
                int size = extractor.readSampleData(buffer, 0);
                if (size < 0) break;
                info.set(
                        0,
                        size,
                        Math.max(0, extractor.getSampleTime() - offset),
                        (extractor.getSampleFlags() & MediaExtractor.SAMPLE_FLAG_SYNC) != 0
                                ? MediaCodec.BUFFER_FLAG_KEY_FRAME
                                : 0);
                muxer.writeSampleData(target, buffer, info);
                written++;
                extractor.advance();
            }
            return written > 0;
        } finally {
            extractor.release();
            if (muxer != null) {
                try {
                    if (started) muxer.stop();
                } catch (Throwable ignored) {
                    // Aucun échantillon écrit : le fichier est inutilisable, `remux` le jettera.
                }
                try {
                    muxer.release();
                } catch (Throwable ignored) {}
            }
        }
    }
}
