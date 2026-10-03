package com.nartya.app.proxy;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.io.File;
import java.net.InetAddress;
import java.nio.file.Files;

public class ProxyServerTest {

    @Test
    public void localFilesStayInsideTheirDownloadDirectory() throws Exception {
        File root = Files.createTempDirectory("nartya-proxy-test").toFile();
        File item = new File(root, "entry");
        assertTrue(item.mkdirs());
        File video = new File(item, "video.mp4");
        assertTrue(video.createNewFile());

        assertTrue(ProxyServer.isWithinBase(item, video));
        assertFalse(ProxyServer.isWithinBase(item, new File(item, "../index.json")));
        assertFalse(ProxyServer.isWithinBase(item, new File(root, "entry-evil/video.mp4")));
    }

    @Test
    public void emptyIdNeverResolvesToTheDownloadsRoot() throws Exception {
        File root = Files.createTempDirectory("nartya-root-test").toFile();
        assertTrue(new File(root, "index.json").createNewFile());
        ProxyServer.setDownloadsRoot(root);

        assertNull(ProxyServer.resolveLocalFile("", "index.json"));
        assertNull(ProxyServer.resolveLocalFile(null, "index.json"));
    }

    @Test
    public void requestsNeedTheListenerToken() {
        ProxyServer server = new ProxyServer(0, null);
        String token = server.getToken();

        assertEquals(48, token.length());
        assertTrue(server.checkToken(token));
        assertFalse(server.checkToken(null));
        assertFalse(server.checkToken(""));
        assertFalse(server.checkToken(token.substring(1)));
        assertFalse(server.checkToken(ProxyServer.newToken()));
    }

    @Test
    public void privateAndReservedAddressesAreRejected() throws Exception {
        assertTrue(ProxyServer.isForbiddenAddress(InetAddress.getByName("127.0.0.1")));
        assertTrue(ProxyServer.isForbiddenAddress(InetAddress.getByName("192.168.1.2")));
        assertTrue(ProxyServer.isForbiddenAddress(InetAddress.getByName("169.254.10.4")));
        assertTrue(ProxyServer.isForbiddenAddress(InetAddress.getByName("203.0.113.8")));
        assertFalse(ProxyServer.isForbiddenAddress(InetAddress.getByName("1.1.1.1")));
    }

    @Test
    public void byteRangesCoverOpenSuffixAndBoundedForms() {
        assertArrayEquals(new long[]{ 10, 19 }, ProxyServer.parseByteRange("bytes=10-19", 100));
        assertArrayEquals(new long[]{ 10, 99 }, ProxyServer.parseByteRange("bytes=10-", 100));
        assertArrayEquals(new long[]{ 90, 99 }, ProxyServer.parseByteRange("bytes=-10", 100));
        assertArrayEquals(new long[]{ 95, 99 }, ProxyServer.parseByteRange("bytes=95-200", 100));
        assertNull(ProxyServer.parseByteRange("bytes=100-", 100));
        assertNull(ProxyServer.parseByteRange("bytes=30-20", 100));
        assertNull(ProxyServer.parseByteRange("bytes=0-1,5-6", 100));
    }

    @Test
    public void playlistUrisResolveAgainstTheFinalUpstreamUrl() {
        String base = "https://cdn.example.test/a/b/master.m3u8?token=abc";
        assertTrue(ProxyServer.resolveUrl(base, "segment.ts")
                .equals("https://cdn.example.test/a/b/segment.ts"));
        assertTrue(ProxyServer.resolveUrl(base, "/key.bin")
                .equals("https://cdn.example.test/key.bin"));
        assertTrue(ProxyServer.resolveUrl(base, "https://other.example.test/init.mp4")
                .equals("https://other.example.test/init.mp4"));
    }

    @Test
    public void interruptedDownloadsRecognizeOnlyFinalNonEmptyFiles() throws Exception {
        File root = Files.createTempDirectory("nartya-download-test").toFile();
        assertNull(Downloads.completedFileName(root));

        File partial = new File(root, "video.mp4.part");
        assertTrue(partial.createNewFile());
        assertNull(Downloads.completedFileName(root));

        File video = new File(root, "video.mp4");
        Files.write(video.toPath(), new byte[]{ 1, 2, 3 });
        assertTrue("video.mp4".equals(Downloads.completedFileName(root)));
    }

    @Test
    public void resumedMp4UsesTheUpstreamTotalWhenAvailable() {
        assertTrue(Downloads.totalFromContentRange("bytes 500-999/2000", 500, 500) == 2000);
        assertTrue(Downloads.totalFromContentRange(null, 500, 700) == 1200);
        assertTrue(Downloads.totalFromContentRange(null, 500, -1) == -1);
    }
}
