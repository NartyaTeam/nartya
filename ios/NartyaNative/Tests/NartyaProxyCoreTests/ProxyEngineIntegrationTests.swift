import XCTest
@testable import NartyaProxyCore

/// Faux hébergeur en loopback, proxy devant, vraies requêtes HTTP comme la WebView.
final class ProxyEngineIntegrationTests: XCTestCase {
    private static let payload = Data((0..<1000).map { UInt8($0 % 256) })
    private static let mega = 1024 * 1024
    private static let bigSize = 24 * mega
    private static func bigChunk(_ index: Int) -> Data { Data(repeating: UInt8(index), count: mega) }

    private var upstream: LoopbackServer!
    private var upstreamPort: UInt16 = 0
    private let upstreamQueue = DispatchQueue(label: "test.upstream")
    private var engine: ProxyEngine!
    private var proxyPort: UInt16 = 0
    private var downloads: URL!

    override func setUp() async throws {
        upstream = LoopbackServer(queue: upstreamQueue) { [unowned self] request, writer in
            self.serveUpstream(request, writer)
        }
        upstreamPort = try await withCheckedThrowingContinuation { continuation in
            upstreamQueue.async { self.upstream.start(preferredPort: nil) { continuation.resume(with: $0) } }
        }
        downloads = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        // 127.0.0.1 autorisé nommément ; `localhost` reste interdit pour éprouver le filtre anti-SSRF.
        engine = ProxyEngine(policy: AddressPolicy { $0 == "127.0.0.1" }, downloadsRoot: downloads)
        proxyPort = try await engine.start()
    }

    override func tearDown() {
        engine.stop()
        upstreamQueue.sync { upstream.stop() }
        try? FileManager.default.removeItem(at: downloads)
    }

    // MARK: Faux hébergeur

    private func serveUpstream(_ request: HTTPRequest, _ writer: HTTPResponseWriter) {
        let payload = Self.payload
        switch request.path {
        case "/video.bin":
            if let bounds = ProxyRules.parseByteRange(request.headers["range"], size: Int64(payload.count)) {
                let slice = payload[Int(bounds.lowerBound)...Int(bounds.upperBound)]
                writer.writeHead(status: 206, headers: [
                    ("Content-Type", "video/mp4"), ("Content-Length", "\(slice.count)"),
                    ("Content-Range", "bytes \(bounds.lowerBound)-\(bounds.upperBound)/\(payload.count)"),
                ])
                writer.write(Data(slice))
            } else {
                writer.writeHead(status: 200, headers: [("Content-Type", "video/mp4"), ("Content-Length", "\(payload.count)")])
                writer.write(payload)
            }
            writer.finish()
        case "/big.bin":
            // Dépasse largement le seuil de contre-pression.
            writer.writeHead(status: 200, headers: [("Content-Type", "video/mp4"), ("Content-Length", "\(Self.bigSize)")])
            for index in 0..<(Self.bigSize / Self.mega) { writer.write(Self.bigChunk(index)) }
            writer.finish()
        case "/norange.bin":
            writer.writeHead(status: 200, headers: [("Content-Type", "video/mp4"), ("Content-Length", "\(payload.count)")])
            writer.write(payload)
            writer.finish()
        case "/master.m3u8":
            writer.respond(status: 200, contentType: "application/vnd.apple.mpegurl",
                           body: "#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI=\"audio.m3u8\"\n#EXTINF:4,\nseg1.ts\n")
        case "/error.m3u8":
            writer.respond(status: 403, body: "nope")
        case "/echo", "/seg1.ts":
            let echo = [
                "referer=\(request.headers["referer"] ?? "-")",
                "origin=\(request.headers["origin"] ?? "-")",
                "ua=\(request.headers["user-agent"] ?? "-")",
            ].joined(separator: "\n")
            writer.respond(status: 200, body: echo)
        case "/to-private":
            writer.writeHead(status: 302, headers: [("Location", "http://localhost:\(upstreamPort)/video.bin"), ("Content-Length", "0")])
            writer.finish()
        case "/to-public":
            writer.writeHead(status: 302, headers: [("Location", "http://127.0.0.1:\(upstreamPort)/video.bin"), ("Content-Length", "0")])
            writer.finish()
        default:
            writer.respond(status: 404, body: "absent")
        }
    }

    // MARK: Outils

    private func proxied(_ path: String, extra: [String: String] = [:], token: String? = nil) -> URL {
        var query = [
            "url": "http://127.0.0.1:\(upstreamPort)\(path)",
            "t": token ?? engine.token,
        ]
        query.merge(extra) { _, new in new }
        let encoded = query.map { "\($0.key)=\(ProxyRules.formEncode($0.value))" }.joined(separator: "&")
        return URL(string: "http://127.0.0.1:\(proxyPort)/video/proxy?\(encoded)")!
    }

    private func fetch(_ url: URL, method: String = "GET", headers: [String: String] = [:]) async throws -> (Data, HTTPURLResponse) {
        var request = URLRequest(url: url)
        request.httpMethod = method
        for (name, value) in headers { request.setValue(value, forHTTPHeaderField: name) }
        let (data, response) = try await URLSession.shared.data(for: request)
        return (data, response as! HTTPURLResponse)
    }

    // MARK: Cas

    func testRejectsRequestsWithoutTheToken() async throws {
        let (_, response) = try await fetch(proxied("/video.bin", token: "mauvais"))
        XCTAssertEqual(response.statusCode, 403)
        XCTAssertEqual(response.value(forHTTPHeaderField: "Access-Control-Allow-Origin"), "*")
    }

    func testAnswersCorsPreflight() async throws {
        let (_, response) = try await fetch(URL(string: "http://127.0.0.1:\(proxyPort)/video/proxy")!, method: "OPTIONS")
        XCTAssertEqual(response.statusCode, 200)
        XCTAssertEqual(response.value(forHTTPHeaderField: "Access-Control-Allow-Headers"), "Range, Content-Type")
    }

    func testStreamsTheWholeBody() async throws {
        let (data, response) = try await fetch(proxied("/video.bin"))
        XCTAssertEqual(response.statusCode, 200)
        XCTAssertEqual(data, Self.payload)
        XCTAssertEqual(response.value(forHTTPHeaderField: "Accept-Ranges"), "bytes")
        XCTAssertEqual(response.value(forHTTPHeaderField: "X-Upstream-Url"), "http://127.0.0.1:\(upstreamPort)/video.bin")
    }

    func testForwardsRangeRequests() async throws {
        let (data, response) = try await fetch(proxied("/video.bin"), headers: ["Range": "bytes=10-19"])
        XCTAssertEqual(response.statusCode, 206)
        XCTAssertEqual(response.value(forHTTPHeaderField: "Content-Range"), "bytes 10-19/1000")
        XCTAssertEqual(data, Self.payload[10...19])
    }

    func testSlicesWhenTheHostIgnoresRange() async throws {
        let (data, response) = try await fetch(proxied("/norange.bin"), headers: ["Range": "bytes=990-"])
        XCTAssertEqual(response.statusCode, 206)
        XCTAssertEqual(response.value(forHTTPHeaderField: "Content-Range"), "bytes 990-999/1000")
        XCTAssertEqual(data, Self.payload[990...999])
    }

    func testRewritesPlaylistsAndSegmentsKeepTheEmbedReferer() async throws {
        let (data, response) = try await fetch(proxied("/master.m3u8", extra: ["referer": "https://embed.example/e/1"]))
        XCTAssertEqual(response.statusCode, 200)
        XCTAssertEqual(response.value(forHTTPHeaderField: "Content-Type"), "application/vnd.apple.mpegurl")
        let lines = String(decoding: data, as: UTF8.self).components(separatedBy: "\n")
        XCTAssertTrue(lines[1].contains("URI=\"http://127.0.0.1:\(proxyPort)/video/proxy?url="), "piste audio proxifiée")
        let segment = try XCTUnwrap(URL(string: lines[3]))
        XCTAssertTrue(lines[3].hasSuffix("&t=\(engine.token)"))

        let (echo, segmentResponse) = try await fetch(segment)
        XCTAssertEqual(segmentResponse.statusCode, 200)
        XCTAssertTrue(String(decoding: echo, as: UTF8.self).contains("referer=https://embed.example/e/1"))
    }

    func testRawPlaylistIsReturnedUntouchedWithItsFinalUrl() async throws {
        let (data, response) = try await fetch(proxied("/master.m3u8", extra: ["raw": "1"]))
        XCTAssertTrue(String(decoding: data, as: UTF8.self).contains("\nseg1.ts\n"))
        XCTAssertEqual(response.value(forHTTPHeaderField: "X-Upstream-Url"), "http://127.0.0.1:\(upstreamPort)/master.m3u8")
    }

    func testHostErrorsAreRelayedNotRewritten() async throws {
        let (data, response) = try await fetch(proxied("/error.m3u8"))
        XCTAssertEqual(response.statusCode, 403)
        XCTAssertEqual(String(decoding: data, as: UTF8.self), "nope")
    }

    func testAppliesTheRecipeHeaders() async throws {
        engine.updateConfig(ProxyConfig(json: [
            "providerConfigs": ["demo": ["domains": ["127.0.0.1"], "headers": ["User-Agent": "NartyaTest/1", "Referer": "https://recipe.example/"]]],
        ]))
        var (data, _) = try await fetch(proxied("/echo"))
        var echo = String(decoding: data, as: UTF8.self)
        XCTAssertTrue(echo.contains("ua=NartyaTest/1"), echo)
        XCTAssertTrue(echo.contains("referer=https://recipe.example/"), echo)

        (data, _) = try await fetch(proxied("/echo", extra: ["referer": "https://embed.example/", "origin": "https://embed.example"]))
        echo = String(decoding: data, as: UTF8.self)
        XCTAssertTrue(echo.contains("referer=https://embed.example/"), echo)
        XCTAssertTrue(echo.contains("origin=https://embed.example"), echo)
    }

    func testBlocksPrivateHostsAndRedirectsToThem() async throws {
        let direct = URL(string: "http://127.0.0.1:\(proxyPort)/video/proxy?url=\(ProxyRules.formEncode("http://localhost:\(upstreamPort)/video.bin"))&t=\(engine.token)")!
        var (_, response) = try await fetch(direct)
        XCTAssertEqual(response.statusCode, 502)

        (_, response) = try await fetch(proxied("/to-private"))
        XCTAssertEqual(response.statusCode, 502, "la redirection interdite n'est jamais relayée au lecteur")

        let (data, allowed) = try await fetch(proxied("/to-public"))
        XCTAssertEqual(allowed.statusCode, 200)
        XCTAssertEqual(data, Self.payload)
    }

    func testRejectsNonHttpTargets() async throws {
        let url = URL(string: "http://127.0.0.1:\(proxyPort)/video/proxy?url=\(ProxyRules.formEncode("file:///etc/passwd"))&t=\(engine.token)")!
        let (_, response) = try await fetch(url)
        XCTAssertEqual(response.statusCode, 400)
    }

    func testHeadRequestsGetHeadersOnly() async throws {
        let (data, response) = try await fetch(proxied("/video.bin"), method: "HEAD")
        XCTAssertEqual(response.statusCode, 200)
        XCTAssertEqual(response.value(forHTTPHeaderField: "Content-Length"), "1000")
        XCTAssertTrue(data.isEmpty)
    }

    func testServesDownloadedFilesWithRanges() async throws {
        let item = downloads.appendingPathComponent(ProxyEngine.itemDirectoryName("ep-1"))
        try FileManager.default.createDirectory(at: item, withIntermediateDirectories: true)
        try Self.payload.write(to: item.appendingPathComponent("video.mp4"))
        try Data("#EXTM3U\nseg0.ts".utf8).write(to: item.appendingPathComponent("index.m3u8"))

        func local(_ path: String, token: String? = nil) -> URL {
            URL(string: "http://127.0.0.1:\(proxyPort)/local?id=ep-1&path=\(ProxyRules.formEncode(path))&t=\(token ?? engine.token)")!
        }
        var (data, response) = try await fetch(local("video.mp4"), headers: ["Range": "bytes=-5"])
        XCTAssertEqual(response.statusCode, 206)
        XCTAssertEqual(response.value(forHTTPHeaderField: "Content-Range"), "bytes 995-999/1000")
        XCTAssertEqual(data, Self.payload[995...999])

        (data, response) = try await fetch(local("video.mp4"))
        XCTAssertEqual(data, Self.payload)
        XCTAssertEqual(response.value(forHTTPHeaderField: "Content-Type"), "video/mp4")

        (_, response) = try await fetch(local("video.mp4"), headers: ["Range": "bytes=5000-"])
        XCTAssertEqual(response.statusCode, 416)

        (data, _) = try await fetch(local("index.m3u8"))
        XCTAssertEqual(String(decoding: data, as: UTF8.self), "#EXTM3U\nhttp://127.0.0.1:\(proxyPort)/local?id=ep-1&path=seg0.ts&t=\(engine.token)")

        (_, response) = try await fetch(local("../\(item.lastPathComponent)/video.mp4"))
        XCTAssertEqual(response.statusCode, 200, "rester dans son propre dossier est permis")
        (_, response) = try await fetch(local("../../etc/hosts"))
        XCTAssertEqual(response.statusCode, 404)
        (_, response) = try await fetch(local("video.mp4", token: "x"))
        XCTAssertEqual(response.statusCode, 403)
    }

    func testRestartsOnTheSamePortAfterSuspension() async throws {
        engine.simulateListenerLoss()
        XCTAssertNil(engine.port)
        let result = try await engine.ensureRunning()
        XCTAssertTrue(result.restarted)
        XCTAssertFalse(result.portChanged)
        XCTAssertEqual(result.port, proxyPort)
        let (data, _) = try await fetch(proxied("/video.bin"))
        XCTAssertEqual(data, Self.payload)

        let again = try await engine.ensureRunning()
        XCTAssertFalse(again.restarted, "rien à faire quand le serveur tourne")
    }

    func testLargeStreamsArriveIntactThroughBackpressure() async throws {
        let (data, response) = try await fetch(proxied("/big.bin"))
        XCTAssertEqual(response.statusCode, 200)
        XCTAssertEqual(data.count, Self.bigSize)
        for index in 0..<(Self.bigSize / Self.mega) {
            XCTAssertEqual(data[index * Self.mega], UInt8(index))
            XCTAssertEqual(data[(index + 1) * Self.mega - 1], UInt8(index))
        }
    }

    func testSurvivesClientsThatHangUpMidStream() async throws {
        // Le lecteur abandonne souvent une requête (seek) : le serveur doit rester sain.
        for _ in 0..<20 {
            let task = URLSession.shared.dataTask(with: proxied("/video.bin"))
            task.resume()
            task.cancel()
        }
        let (data, _) = try await fetch(proxied("/video.bin"))
        XCTAssertEqual(data, Self.payload)
    }
}
