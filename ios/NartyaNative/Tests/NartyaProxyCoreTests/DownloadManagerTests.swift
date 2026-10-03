import XCTest
@testable import NartyaProxyCore

/// Parité Downloads.java.
final class DownloadRulesTests: XCTestCase {
    func testContentRangeTotal() {
        XCTAssertEqual(DownloadRules.totalFromContentRange("bytes 500-999/2000", offset: 500, remaining: 500), 2000)
        XCTAssertEqual(DownloadRules.totalFromContentRange(nil, offset: 500, remaining: 700), 1200)
        XCTAssertEqual(DownloadRules.totalFromContentRange(nil, offset: 500, remaining: -1), -1)
    }

    func testChunkPlanCoversTheWholeFileWithoutOverlap() {
        XCTAssertEqual(DownloadRules.chunkPlan(total: 1000, chunkBytes: 300), [0...299, 300...599, 600...899, 900...999])
        XCTAssertEqual(DownloadRules.chunkPlan(total: 300, chunkBytes: 300), [0...299])
        XCTAssertEqual(DownloadRules.chunkPlan(total: 0, chunkBytes: 300), [])
    }

    func testVariantSelectionFollowsTheQualityCap() throws {
        let base = try XCTUnwrap(URL(string: "https://cdn.example/hls/master.m3u8"))
        let master = """
        #EXTM3U
        #EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=854x480
        480/index.m3u8
        #EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720
        720/index.m3u8
        #EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
        1080/index.m3u8
        """
        XCTAssertEqual(DownloadRules.pickBestVariant(master, base: base, maxHeight: 0)?.absoluteString, "https://cdn.example/hls/1080/index.m3u8")
        XCTAssertEqual(DownloadRules.pickBestVariant(master, base: base, maxHeight: 720)?.absoluteString, "https://cdn.example/hls/720/index.m3u8")
        XCTAssertEqual(DownloadRules.pickBestVariant(master, base: base, maxHeight: 360)?.absoluteString, "https://cdn.example/hls/480/index.m3u8",
                       "rien sous le plafond : la plus basse résolution connue")
    }

    func testPlaylistLocalizationRenamesEveryRemoteResource() throws {
        let base = try XCTUnwrap(URL(string: "https://cdn.example/hls/720/index.m3u8"))
        let local = DownloadRules.localizePlaylist("""
        #EXTM3U
        #EXT-X-KEY:METHOD=AES-128,URI="../key.bin?t=1",IV=0x01
        #EXT-X-MAP:URI="init.mp4"
        #EXTINF:4,
        a.m4s?token=x
        #EXTINF:4,
        https://edge.example/b.ts
        """, base: base)
        XCTAssertEqual(local.keyURL?.absoluteString, "https://cdn.example/hls/key.bin?t=1")
        XCTAssertEqual(local.mapURL?.absoluteString, "https://cdn.example/hls/720/init.mp4")
        XCTAssertEqual(local.segments.map(\.name), ["seg00000.m4s", "seg00001.ts"])
        XCTAssertEqual(local.segments.map(\.url.absoluteString), ["https://cdn.example/hls/720/a.m4s?token=x", "https://edge.example/b.ts"])
        XCTAssertEqual(local.lines[1], "#EXT-X-KEY:METHOD=AES-128,URI=\"key.bin\",IV=0x01")
        XCTAssertEqual(local.lines[2], "#EXT-X-MAP:URI=\"init.mp4\"")
        XCTAssertFalse(local.text.contains("https://"), "plus aucune ressource distante dans la playlist locale")

        let clear = DownloadRules.localizePlaylist("#EXT-X-KEY:METHOD=NONE\nseg.ts", base: base)
        XCTAssertNil(clear.keyURL)
    }

    func testScanPagePathsMatchAndroid() {
        XCTAssertEqual(DownloadRules.scanPageName(7), "p007.jpg")
        XCTAssertEqual(DownloadRules.pathEncode("One Piece+"), "One%20Piece%2B")
    }
}

/// Faux hébergeur → vrai proxy → gestionnaire.
final class DownloadManagerIntegrationTests: XCTestCase {
    private static let payload = Data((0..<1000).map { UInt8(($0 * 7) % 256) })

    private var upstream: LoopbackServer!
    private var upstreamPort: UInt16 = 0
    private let upstreamQueue = DispatchQueue(label: "test.downloads.upstream")
    private var engine: ProxyEngine!
    private var root: URL!
    private var manager: DownloadManager!

    // Lu et écrit sur upstreamQueue.
    private var requestedRanges: [String] = []
    private var stallAfterFirstChunk = true

    override func setUp() async throws {
        upstream = LoopbackServer(queue: upstreamQueue) { [unowned self] request, writer in
            self.serve(request, writer)
        }
        upstreamPort = try await withCheckedThrowingContinuation { continuation in
            upstreamQueue.async { self.upstream.start(preferredPort: nil) { continuation.resume(with: $0) } }
        }
        root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        engine = ProxyEngine(policy: AddressPolicy { $0 == "127.0.0.1" }, downloadsRoot: root)
        _ = try await engine.start()
        manager = makeManager()
    }

    override func tearDown() {
        engine.stop()
        upstreamQueue.sync { upstream.stop() }
        try? FileManager.default.removeItem(at: root)
    }

    private func makeManager() -> DownloadManager {
        var tuning = DownloadManager.Tuning()
        tuning.mp4ChunkBytes = 300
        tuning.retryDelay = 0
        tuning.progressInterval = 0
        let engine = self.engine!
        return DownloadManager(root: root, tuning: tuning, proxy: {
            engine.port.map { ($0, engine.token) }
        }, onProgress: { _ in })
    }

    // MARK: Faux hébergeur

    private func serve(_ request: HTTPRequest, _ writer: HTTPResponseWriter) {
        let payload = Self.payload
        switch request.path {
        case "/video.mp4", "/stall.mp4":
            let range = request.headers["range"] ?? "none"
            requestedRanges.append("\(request.path) \(range)")
            guard let bounds = ProxyRules.parseByteRange(request.headers["range"], size: Int64(payload.count)) else {
                writer.writeHead(status: 200, headers: [("Content-Type", "video/mp4"), ("Content-Length", "\(payload.count)")])
                writer.write(payload)
                writer.finish()
                return
            }
            // Seul le premier morceau répond : téléchargement en cours au moment où iOS suspend l'app.
            if request.path == "/stall.mp4", stallAfterFirstChunk, bounds.lowerBound > 0 { return }
            let slice = payload[Int(bounds.lowerBound)...Int(bounds.upperBound)]
            writer.writeHead(status: 206, headers: [
                ("Content-Type", "video/mp4"), ("Content-Length", "\(slice.count)"),
                ("Content-Range", "bytes \(bounds.lowerBound)-\(bounds.upperBound)/\(payload.count)"),
            ])
            writer.write(Data(slice))
            writer.finish()
        case "/norange.mp4":
            writer.writeHead(status: 200, headers: [("Content-Type", "video/mp4"), ("Content-Length", "\(payload.count)")])
            writer.write(payload)
            writer.finish()
        case "/hls/master.m3u8":
            writer.respond(status: 200, contentType: "application/vnd.apple.mpegurl", body: """
            #EXTM3U
            #EXT-X-STREAM-INF:BANDWIDTH=900000,RESOLUTION=854x480
            480/index.m3u8
            #EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x1080
            1080/index.m3u8
            """)
        case "/hls/480/index.m3u8":
            writer.respond(status: 200, contentType: "application/vnd.apple.mpegurl", body: """
            #EXTM3U
            #EXT-X-KEY:METHOD=AES-128,URI="/keys/k.bin"
            #EXT-X-MAP:URI="init.mp4"
            #EXTINF:4,
            s0.m4s
            #EXTINF:4,
            s1.m4s
            #EXT-X-ENDLIST
            """)
        case "/hls/1080/index.m3u8":
            writer.respond(status: 500, body: "ne doit pas être choisie sous un plafond 480p")
        case "/keys/k.bin":
            writer.respond(status: 200, body: "KEY")
        case "/hls/480/init.mp4", "/hls/480/s0.m4s", "/hls/480/s1.m4s":
            writer.respond(status: 200, body: "DATA:\(request.path)")
        case let path where path.hasPrefix("/scans/One%20Piece/5/"):
            writer.respond(status: 200, contentType: "image/jpeg", body: "PAGE:\(path.split(separator: "/").last!)")
        case "/cover.jpg":
            writer.respond(status: 200, contentType: "image/jpeg", body: "COVER")
        default:
            writer.respond(status: 404, body: "absent")
        }
    }

    // MARK: Outils

    private func url(_ path: String) -> String { "http://127.0.0.1:\(upstreamPort)\(path)" }

    private func item(_ id: String) -> DownloadManager.Item? {
        manager.list().first { $0["id"] as? String == id }
    }

    private func waitFor(_ id: String, status: String, timeout: TimeInterval = 10) async throws -> DownloadManager.Item {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if let item = item(id), item["status"] as? String == status { return item }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        XCTFail("\(id) n'a pas atteint « \(status) » (état : \(String(describing: item(id)?["status"])), erreur : \(String(describing: item(id)?["error"])))")
        throw CancellationError()
    }

    private func episode(_ id: String, _ path: String, extra: [String: Any] = [:]) -> [String: Any] {
        var payload: [String: Any] = ["id": id, "slug": "demo", "seasonId": "s1", "ep": 1, "lang": "vostfr",
                                      "directUrl": url(path), "provider": "demo"]
        payload.merge(extra) { _, new in new }
        return payload
    }

    private func file(_ id: String, _ name: String) -> URL {
        manager.itemDir(id).appendingPathComponent(name)
    }

    // MARK: Cas

    func testMp4IsFetchedInChunksAndAssembled() async throws {
        XCTAssertTrue(manager.start(episode("ep-mp4", "/video.mp4", extra: ["animeCover": url("/cover.jpg")])))
        let done = try await waitFor("ep-mp4", status: "done")
        XCTAssertEqual(done["file"] as? String, "video.mp4")
        XCTAssertEqual((done["sizeBytes"] as? NSNumber)?.int64Value ?? (done["sizeBytes"] as? Int64), 1000)
        XCTAssertEqual(try Data(contentsOf: file("ep-mp4", "video.mp4")), Self.payload)
        XCTAssertEqual(try String(contentsOf: file("ep-mp4", "cover.jpg")), "COVER")
        let leftovers = try FileManager.default.contentsOfDirectory(atPath: manager.itemDir("ep-mp4").path)
            .filter { $0.contains(".c0") || $0.hasSuffix(".part") }
        XCTAssertEqual(leftovers, [], "aucun morceau ne traîne après l'assemblage")
        let ranges = upstreamQueue.sync { requestedRanges }
        XCTAssertTrue(ranges.contains("/video.mp4 bytes=900-999"), "\(ranges)")

        // Un nouveau gestionnaire relit l'entrée terminée.
        let reloaded = makeManager().list().first { $0["id"] as? String == "ep-mp4" }
        XCTAssertEqual(reloaded?["status"] as? String, "done")
    }

    func testMp4FallsBackToOneStreamWhenRangeIsIgnored() async throws {
        XCTAssertTrue(manager.start(episode("ep-norange", "/norange.mp4")))
        _ = try await waitFor("ep-norange", status: "done")
        XCTAssertEqual(try Data(contentsOf: file("ep-norange", "video.mp4")), Self.payload)
    }

    func testHlsPicksTheCappedVariantAndLocalizesEverything() async throws {
        XCTAssertTrue(manager.start(episode("ep-hls", "/hls/master.m3u8", extra: ["maxHeight": 480])))
        let done = try await waitFor("ep-hls", status: "done")
        XCTAssertEqual(done["file"] as? String, "playlist.m3u8")
        let playlist = try String(contentsOf: file("ep-hls", "playlist.m3u8"))
        XCTAssertEqual(playlist, """
        #EXTM3U
        #EXT-X-KEY:METHOD=AES-128,URI="key.bin"
        #EXT-X-MAP:URI="init.mp4"
        #EXTINF:4,
        seg00000.m4s
        #EXTINF:4,
        seg00001.m4s
        #EXT-X-ENDLIST
        """)
        XCTAssertEqual(try String(contentsOf: file("ep-hls", "key.bin")), "KEY")
        XCTAssertEqual(try String(contentsOf: file("ep-hls", "init.mp4")), "DATA:/hls/480/init.mp4")
        XCTAssertEqual(try String(contentsOf: file("ep-hls", "seg00001.m4s")), "DATA:/hls/480/s1.m4s")
    }

    func testScanChaptersDownloadEveryPage() async throws {
        XCTAssertTrue(manager.start(["id": "scan-1", "type": "scan", "slug": "one-piece", "oeuvre": "One Piece",
                                     "folder": 5, "pages": 3, "imageBase": url("/scans")]))
        _ = try await waitFor("scan-1", status: "done")
        for page in 1...3 {
            XCTAssertEqual(try String(contentsOf: file("scan-1", DownloadRules.scanPageName(page))), "PAGE:\(page).jpg")
        }
    }

    func testHostErrorsEndInAnErrorState() async throws {
        XCTAssertTrue(manager.start(episode("ep-missing", "/missing.m3u8")))
        let failed = try await waitFor("ep-missing", status: "error")
        XCTAssertEqual(failed["error"] as? String, "HTTP 404")
    }

    func testInvalidOrDuplicateStartsAreRefused() async throws {
        XCTAssertFalse(manager.start(["id": "x"]), "épisode sans URL")
        XCTAssertFalse(manager.start(["id": "", "directUrl": url("/video.mp4")]))
        XCTAssertFalse(manager.start(["id": "s", "type": "scan", "oeuvre": "o", "pages": 0, "imageBase": "https://x"]))
        XCTAssertTrue(manager.start(episode("ep-dup", "/video.mp4")))
        _ = try await waitFor("ep-dup", status: "done")
        XCTAssertFalse(manager.start(episode("ep-dup", "/video.mp4")), "déjà terminé")
    }

    func testInterruptionKeepsFinishedChunksAndResumeSkipsThem() async throws {
        XCTAssertTrue(manager.start(episode("ep-stall", "/stall.mp4")))
        // Premier morceau sur disque pendant que les autres pendent.
        let firstChunk = file("ep-stall", "video.mp4.c0000")
        let deadline = Date().addingTimeInterval(10)
        while !FileManager.default.fileExists(atPath: firstChunk.path), Date() < deadline {
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        XCTAssertEqual(manager.interruptAll(), 1)
        XCTAssertEqual(item("ep-stall")?["status"] as? String, "interrupted")
        XCTAssertTrue(DownloadRules.isCompleteFragment(firstChunk), "le morceau reçu est conservé")

        upstreamQueue.sync {
            stallAfterFirstChunk = false
            requestedRanges.removeAll()
        }
        XCTAssertTrue(manager.start(episode("ep-stall", "/stall.mp4")), "une entrée interrompue se reprend")
        _ = try await waitFor("ep-stall", status: "done")
        XCTAssertEqual(try Data(contentsOf: file("ep-stall", "video.mp4")), Self.payload)
        let ranges = upstreamQueue.sync { requestedRanges }
        XCTAssertFalse(ranges.contains("/stall.mp4 bytes=0-299"), "le morceau déjà reçu n'est pas retéléchargé : \(ranges)")
    }

    func testRemovingAnActiveDownloadDeletesEverything() async throws {
        XCTAssertTrue(manager.start(episode("ep-remove", "/stall.mp4")))
        let firstChunk = file("ep-remove", "video.mp4.c0000")
        let deadline = Date().addingTimeInterval(10)
        while !FileManager.default.fileExists(atPath: firstChunk.path), Date() < deadline {
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        manager.remove("ep-remove")
        try await Task.sleep(nanoseconds: 300_000_000)
        XCTAssertNil(item("ep-remove"))
        XCTAssertFalse(FileManager.default.fileExists(atPath: manager.itemDir("ep-remove").path))
        XCTAssertEqual(manager.activeCount, 0)
    }

    func testRestartReconcilesEntriesLeftByACrash() throws {
        let finished = manager.itemDir("ep-finished")
        try FileManager.default.createDirectory(at: finished, withIntermediateDirectories: true)
        try Self.payload.write(to: finished.appendingPathComponent("video.mp4"))
        let index: [String: Any] = [
            "ep-finished": ["id": "ep-finished", "status": "downloading"],
            "ep-half": ["id": "ep-half", "status": "queued"],
        ]
        try JSONSerialization.data(withJSONObject: index).write(to: root.appendingPathComponent("index.json"))

        let restarted = makeManager()
        let items = Dictionary(uniqueKeysWithValues: restarted.list().map { ($0["id"] as! String, $0) })
        XCTAssertEqual(items["ep-finished"]?["status"] as? String, "done")
        XCTAssertEqual(items["ep-finished"]?["file"] as? String, "video.mp4")
        XCTAssertEqual(items["ep-half"]?["status"] as? String, "interrupted")
    }

    func testResumingAnAlreadyFinishedEpisodeDoesNotDownloadAgain() async throws {
        let dir = manager.itemDir("ep-ready")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try Self.payload.write(to: dir.appendingPathComponent("video.mp4"))
        upstreamQueue.sync { requestedRanges.removeAll() }
        XCTAssertTrue(manager.start(episode("ep-ready", "/video.mp4")))
        let done = try await waitFor("ep-ready", status: "done")
        XCTAssertEqual(done["file"] as? String, "video.mp4")
        XCTAssertEqual(upstreamQueue.sync { requestedRanges }, [])
    }

    func testDownloadedFilesArePlayableThroughTheLocalRoute() async throws {
        XCTAssertTrue(manager.start(episode("ep-local", "/video.mp4")))
        _ = try await waitFor("ep-local", status: "done")
        let port = try XCTUnwrap(engine.port)
        let local = try XCTUnwrap(URL(string: "http://127.0.0.1:\(port)/local?id=ep-local&path=video.mp4&t=\(engine.token)"))
        var request = URLRequest(url: local)
        request.setValue("bytes=10-19", forHTTPHeaderField: "Range")
        let (data, response) = try await URLSession.shared.data(for: request)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 206)
        XCTAssertEqual(data, Self.payload[10...19])
    }
}
