import XCTest
@testable import NartyaProxyCore

/// Reprend ProxyServerTest.java cas par cas, plus les écarts propres à iOS.
final class ProxyRulesTests: XCTestCase {

    func testRequestsNeedTheListenerToken() {
        let token = ProxyRules.newToken()
        XCTAssertEqual(token.count, 48)
        XCTAssertTrue(ProxyRules.tokensEqual(token, token))
        XCTAssertFalse(ProxyRules.tokensEqual(nil, token))
        XCTAssertFalse(ProxyRules.tokensEqual("", token))
        XCTAssertFalse(ProxyRules.tokensEqual(String(token.dropFirst()), token))
        XCTAssertFalse(ProxyRules.tokensEqual(ProxyRules.newToken(), token))
    }

    func testByteRangesCoverOpenSuffixAndBoundedForms() {
        XCTAssertEqual(ProxyRules.parseByteRange("bytes=10-19", size: 100), 10...19)
        XCTAssertEqual(ProxyRules.parseByteRange("bytes=10-", size: 100), 10...99)
        XCTAssertEqual(ProxyRules.parseByteRange("bytes=-10", size: 100), 90...99)
        XCTAssertEqual(ProxyRules.parseByteRange("bytes=95-200", size: 100), 95...99)
        XCTAssertEqual(ProxyRules.parseByteRange("bytes=-500", size: 100), 0...99)
        XCTAssertNil(ProxyRules.parseByteRange("bytes=100-", size: 100))
        XCTAssertNil(ProxyRules.parseByteRange("bytes=30-20", size: 100))
        XCTAssertNil(ProxyRules.parseByteRange("bytes=0-1,5-6", size: 100))
        XCTAssertNil(ProxyRules.parseByteRange("bytes=-", size: 100))
        XCTAssertNil(ProxyRules.parseByteRange("bytes=-0", size: 100))
        XCTAssertNil(ProxyRules.parseByteRange("items=0-1", size: 100))
        XCTAssertNil(ProxyRules.parseByteRange("bytes=0-1", size: 0))
    }

    func testPrivateAndReservedAddressesAreRejected() {
        let forbidden: [[UInt8]] = [
            [127, 0, 0, 1], [192, 168, 1, 2], [169, 254, 10, 4], [203, 0, 113, 8],
            [10, 0, 0, 1], [172, 16, 0, 1], [172, 31, 255, 255], [100, 64, 0, 1],
            [0, 0, 0, 0], [224, 0, 0, 1], [255, 255, 255, 255], [198, 18, 0, 1],
            ipv6("::1"), ipv6("::"), ipv6("fe80::1"), ipv6("fd00::1"), ipv6("ff02::1"),
            ipv6("::ffff:127.0.0.1"), ipv6("::ffff:192.168.0.1"), ipv6("64:ff9b::10.0.0.1"),
        ]
        for address in forbidden {
            XCTAssertTrue(ProxyRules.isForbiddenAddress(address), "\(address) devrait être refusée")
        }
        let allowed: [[UInt8]] = [
            [1, 1, 1, 1], [8, 8, 8, 8], [172, 32, 0, 1], [100, 128, 0, 1],
            ipv6("2606:4700:4700::1111"), ipv6("::ffff:1.1.1.1"), ipv6("64:ff9b::8.8.8.8"),
        ]
        for address in allowed {
            XCTAssertFalse(ProxyRules.isForbiddenAddress(address), "\(address) devrait passer")
        }
        XCTAssertTrue(ProxyRules.isForbiddenAddress([]), "famille inconnue refusée")
    }

    func testPlaylistUrisResolveAgainstTheFinalUpstreamUrl() throws {
        let base = try XCTUnwrap(URL(string: "https://cdn.example.test/a/b/master.m3u8?token=abc"))
        XCTAssertEqual(ProxyRules.resolve("segment.ts", against: base)?.absoluteString, "https://cdn.example.test/a/b/segment.ts")
        XCTAssertEqual(ProxyRules.resolve("/key.bin", against: base)?.absoluteString, "https://cdn.example.test/key.bin")
        XCTAssertEqual(ProxyRules.resolve("https://other.example.test/init.mp4", against: base)?.absoluteString,
                       "https://other.example.test/init.mp4")
        XCTAssertEqual(ProxyRules.resolve("../c/seg.ts?x=1", against: base)?.absoluteString, "https://cdn.example.test/a/c/seg.ts?x=1")
        XCTAssertEqual(ProxyRules.resolve("//edge.example.test/s.ts", against: base)?.absoluteString, "https://edge.example.test/s.ts")
        XCTAssertNil(ProxyRules.resolve("data:text/plain,abc", against: base))
    }

    func testPlaylistRewriteCoversSegmentsAndUriAttributes() throws {
        let base = try XCTUnwrap(URL(string: "https://cdn.example.test/hls/master.m3u8"))
        let playlist = [
            "#EXTM3U",
            "#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"a\",NAME=\"VF\",URI=\"audio/vf.m3u8\"",
            "#EXT-X-KEY:METHOD=AES-128,URI=\"/keys/k.bin\",IV=0x1",
            "#EXT-X-MAP:URI=\"init.mp4\"",
            "#EXTINF:4.0,",
            "seg1.ts\r",
            "",
        ].joined(separator: "\n")
        let out = ProxyRules.rewritePlaylist(playlist, baseURL: base, proxyBase: "http://127.0.0.1:9/video/proxy",
                                             provider: "demo", referer: "https://embed.example/e/1", origin: nil, token: "tok")
        let lines = out.components(separatedBy: "\n")
        XCTAssertEqual(lines.count, 7, "structure de lignes conservée")
        XCTAssertEqual(lines[0], "#EXTM3U")
        XCTAssertTrue(lines[1].contains("URI=\"http://127.0.0.1:9/video/proxy?url=https%3A%2F%2Fcdn.example.test%2Fhls%2Faudio%2Fvf.m3u8&provider=demo&referer=https%3A%2F%2Fembed.example%2Fe%2F1&t=tok\""))
        XCTAssertTrue(lines[2].hasSuffix(",IV=0x1"), "attributs suivants conservés")
        XCTAssertTrue(lines[2].contains("url=https%3A%2F%2Fcdn.example.test%2Fkeys%2Fk.bin"))
        XCTAssertTrue(lines[3].contains("url=https%3A%2F%2Fcdn.example.test%2Fhls%2Finit.mp4"))
        XCTAssertEqual(lines[4], "#EXTINF:4.0,")
        XCTAssertEqual(lines[5], "http://127.0.0.1:9/video/proxy?url=https%3A%2F%2Fcdn.example.test%2Fhls%2Fseg1.ts&provider=demo&referer=https%3A%2F%2Fembed.example%2Fe%2F1&t=tok\r")
        XCTAssertEqual(lines[6], "")
    }

    func testRewriteMarksMissingProviderAsUnknown() throws {
        let base = try XCTUnwrap(URL(string: "https://cdn.example.test/x.m3u8"))
        let out = ProxyRules.rewritePlaylist("a.ts", baseURL: base, proxyBase: "P", provider: nil, referer: nil, origin: nil, token: "t")
        XCTAssertEqual(out, "P?url=https%3A%2F%2Fcdn.example.test%2Fa.ts&provider=unknown&t=t")
    }

    func testLocalPlaylistPointsToTheLocalRoute() {
        let out = ProxyRules.rewriteLocalPlaylist("#EXT-X-KEY:METHOD=AES-128,URI=\"key.bin\"\nseg 1.ts", id: "a b", port: 8080, token: "t")
        XCTAssertEqual(out, "#EXT-X-KEY:METHOD=AES-128,URI=\"http://127.0.0.1:8080/local?id=a+b&path=key.bin&t=t\"\nhttp://127.0.0.1:8080/local?id=a+b&path=seg+1.ts&t=t")
    }

    func testQueryEncodingRoundTrips() {
        let value = "https://h.example/p?a=1&b=é ü+x"
        let query = "url=\(ProxyRules.formEncode(value))&t=abc&t=ignored&empty"
        let parsed = ProxyRules.parseQuery(query)
        XCTAssertEqual(parsed["url"], value)
        XCTAssertEqual(parsed["t"], "abc", "la première occurrence gagne")
        XCTAssertEqual(parsed["empty"], "")
    }

    func testRecipeHeadersFollowAndroidPriority() throws {
        let config = ProxyConfig(json: [
            "providerConfigs": [
                "vid": [
                    "domains": ["vid.example"],
                    "headers": ["referer": "https://recipe.example/", "User-Agent": "UA", "Accept-Encoding": "br"],
                    "hostMatch": "vid", "canonicalHost": "vid.example", "dropRefererOffHost": true,
                ],
                "mp4": ["mp4Referer": ["pattern": #"https://m\.example/v/(\w+)"#, "template": "https://m.example/e/{1}"]],
            ],
            "defaultConfig": ["headers": ["User-Agent": "Default"]],
        ])
        XCTAssertEqual(config.detectProvider(host: "cdn.vid.example"), "vid")
        XCTAssertNil(config.detectProvider(host: "evilvid.example"))

        let onHost = try XCTUnwrap(URL(string: "https://s1.vid.example/x.mp4"))
        var headers = ProxyRules.upstreamHeaders(url: onHost, provider: "vid", config: config, referer: nil, origin: nil)
        XCTAssertEqual(headers["Referer"], "https://s1.vid.example/")
        XCTAssertEqual(headers["Origin"], "https://s1.vid.example")
        XCTAssertNil(headers["referer"], "pas de doublon de casse")
        XCTAssertNil(headers["Accept-Encoding"])
        XCTAssertEqual(headers["User-Agent"], "UA")

        let offHost = try XCTUnwrap(URL(string: "https://cdn.other.example/x.mp4"))
        headers = ProxyRules.upstreamHeaders(url: offHost, provider: "vid", config: config, referer: nil, origin: nil)
        XCTAssertNil(headers["Referer"])
        headers = ProxyRules.upstreamHeaders(url: offHost, provider: "vid", config: config, referer: "https://embed/", origin: "https://embed")
        XCTAssertEqual(headers["Referer"], "https://embed/", "le referer de l'embed gagne en dernier")

        let media = try XCTUnwrap(URL(string: "https://m.example/v/abc123"))
        headers = ProxyRules.upstreamHeaders(url: media, provider: "mp4", config: config, referer: nil, origin: nil)
        XCTAssertEqual(headers["Referer"], "https://m.example/e/abc123")

        headers = ProxyRules.upstreamHeaders(url: media, provider: nil, config: config, referer: nil, origin: nil)
        XCTAssertEqual(headers["User-Agent"], "Default")

        let alias = try XCTUnwrap(URL(string: "https://vid.mirror.net/e/1?x=2"))
        XCTAssertEqual(ProxyRules.canonicalize(alias, source: config.source("vid")).absoluteString, "https://vid.example/e/1?x=2")
    }

    func testLocalFilesStayInsideTheirDownloadDirectory() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let item = root.appendingPathComponent(ProxyEngine.itemDirectoryName("entry"))
        try FileManager.default.createDirectory(at: item, withIntermediateDirectories: true)
        try Data([1]).write(to: item.appendingPathComponent("video.mp4"))
        try Data([1]).write(to: root.appendingPathComponent("index.json"))
        let evil = root.appendingPathComponent(ProxyEngine.itemDirectoryName("entry") + "-evil")
        try FileManager.default.createDirectory(at: evil, withIntermediateDirectories: true)
        try Data([1]).write(to: evil.appendingPathComponent("video.mp4"))
        defer { try? FileManager.default.removeItem(at: root) }

        XCTAssertNotNil(ProxyEngine.resolveLocalFile(root: root, id: "entry", relative: "video.mp4"))
        XCTAssertNotNil(ProxyEngine.resolveLocalFile(root: root, id: "entry", relative: nil), "video.mp4 par défaut")
        XCTAssertNil(ProxyEngine.resolveLocalFile(root: root, id: "entry", relative: "../index.json"))
        XCTAssertNil(ProxyEngine.resolveLocalFile(root: root, id: "entry", relative: "../\(evil.lastPathComponent)/video.mp4"))
        XCTAssertNil(ProxyEngine.resolveLocalFile(root: root, id: "entry", relative: "."), "un dossier n'est pas servi")
        XCTAssertNil(ProxyEngine.resolveLocalFile(root: root, id: "", relative: "index.json"))
        XCTAssertNil(ProxyEngine.resolveLocalFile(root: root, id: nil, relative: "index.json"))
    }

    func testItemDirectoryMatchesAndroidBase64Url() {
        XCTAssertEqual(ProxyEngine.itemDirectoryName("abc"), "YWJj")
        XCTAssertEqual(ProxyEngine.itemDirectoryName("??>"), "Pz8-")
        XCTAssertEqual(ProxyEngine.itemDirectoryName("???"), "Pz8_")
        XCTAssertEqual(ProxyEngine.itemDirectoryName("a"), "YQ")
    }

    private func ipv6(_ text: String) -> [UInt8] {
        var address = in6_addr()
        precondition(inet_pton(AF_INET6, text, &address) == 1, text)
        return withUnsafeBytes(of: &address) { Array($0) }
    }
}
