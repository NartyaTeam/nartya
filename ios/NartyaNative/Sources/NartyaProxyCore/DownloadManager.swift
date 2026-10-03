import Foundation

/// Port de Downloads.java : le réseau vidéo passe par le proxy local, `raw=1` récupère les
/// playlists non réécrites, `X-Upstream-Url` donne l'URL finale. Même stockage qu'Android :
/// `root/<base64url(id)>/` et `root/index.json`. L'app pouvant être suspendue à tout moment, les
/// MP4 sont découpés en morceaux gardés sur disque et `interruptAll()` fige les travaux.
public final class DownloadManager: @unchecked Sendable {
    public struct Tuning: Sendable {
        public var maxJobs = 2
        public var mp4ChunkBytes: Int64 = 8 * 1024 * 1024
        public var mp4Connections = 4
        public var hlsConcurrency = 6
        public var scanConcurrency = 6
        public var maxAttempts = 3
        public var retryDelay: TimeInterval = 0.5
        public var progressInterval: TimeInterval = 0.4
        public init() {}
    }

    public typealias Item = [String: Any]

    private enum StopReason { case removed, interrupted }

    private struct Source {
        var provider = ""
        var referer = ""
        var origin = ""
    }

    private let root: URL
    private let tuning: Tuning
    private let proxy: @Sendable () -> (port: UInt16, token: String)?
    private let onProgress: @Sendable (Item) -> Void
    private let transfers = TransferSession()
    private let limiter: AsyncLimiter

    private let lock = NSLock()
    private var index: [String: Item] = [:]
    private var jobs: [String: Task<Void, Never>] = [:]
    private var stopReasons: [String: StopReason] = [:]
    /// Un travail annulé qui finit après une reprise ne doit ni écraser l'état ni retirer le nouveau.
    private var generations: [String: Int] = [:]
    private var nextGeneration = 0
    private var lastSave = Date.distantPast

    public init(root: URL, tuning: Tuning = Tuning(),
                proxy: @escaping @Sendable () -> (port: UInt16, token: String)?,
                onProgress: @escaping @Sendable (Item) -> Void) {
        self.root = root
        self.tuning = tuning
        self.proxy = proxy
        self.onProgress = onProgress
        self.limiter = AsyncLimiter(limit: tuning.maxJobs)
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        loadIndex()
        reconcile()
    }

    // MARK: API du plugin

    public func list() -> [Item] {
        lock.lock()
        defer { lock.unlock() }
        return Array(index.values)
    }

    public var activeCount: Int {
        lock.lock()
        defer { lock.unlock() }
        return index.values.filter { Self.isActive($0) }.count
    }

    /// false = charge utile invalide, ou déjà actif ou fini.
    public func start(_ payload: [String: Any]) -> Bool {
        let isScan = payload["type"] as? String == "scan"
        guard let id = payload["id"] as? String, !id.isEmpty else { return false }
        let directUrl = payload["directUrl"] as? String
        if !isScan && (directUrl?.isEmpty ?? true) { return false }
        if isScan && ((payload["oeuvre"] as? String) == nil || Self.int(payload["pages"]) <= 0
                      || (payload["imageBase"] as? String) == nil) { return false }

        lock.lock()
        if let existing = index[id], let status = existing["status"] as? String,
           ["done", "downloading", "queued"].contains(status) {
            lock.unlock()
            return false
        }
        var item = index[id] ?? [:]
        item["id"] = id
        item["slug"] = payload["slug"] as? String ?? ""
        item["animeTitle"] = payload["animeTitle"] ?? payload["slug"] ?? ""
        item["animeCover"] = payload["animeCover"] ?? NSNull()
        if isScan {
            item["type"] = "scan"
            for key in ["oeuvre", "oeuvreLabel", "chapter", "folder", "imageBase"] { item[key] = payload[key] ?? NSNull() }
            item["pages"] = Self.int(payload["pages"])
        } else {
            for key in ["seasonId", "ep", "lang", "epThumb", "epTitle", "seasonName", "provider"] {
                item[key] = payload[key] ?? NSNull()
            }
            item["maxHeight"] = Self.int(payload["maxHeight"])
            item["sourcePreference"] = payload["sourcePreference"] as? String ?? "auto"
        }
        item["status"] = "queued"
        item["percent"] = 0
        item["sizeBytes"] = 0
        item["createdAt"] = item["createdAt"] ?? Self.now()
        for key in ["error", "finishedAt", "file"] { item.removeValue(forKey: key) }
        index[id] = item
        stopReasons.removeValue(forKey: id)
        nextGeneration += 1
        let generation = nextGeneration
        generations[id] = generation
        // Un travail interrompu peut encore se dérouler : le nouveau l'attend.
        let previous = jobs[id]
        saveLocked()

        let source = Source(provider: payload["provider"] as? String ?? "",
                            referer: payload["referer"] as? String ?? "",
                            origin: payload["origin"] as? String ?? "")
        jobs[id] = Task.detached(priority: .utility) { [weak self] in
            await previous?.value
            await self?.run(id: id, generation: generation, payload: payload, isScan: isScan, source: source)
        }
        lock.unlock()
        onProgress(item)
        return true
    }

    public func cancel(_ id: String) {
        remove(id)
    }

    public func remove(_ id: String) {
        // Un id vide désignerait la racine des téléchargements.
        guard !id.isEmpty else { return }
        lock.lock()
        stopReasons[id] = .removed
        jobs[id]?.cancel()
        generations.removeValue(forKey: id)
        index.removeValue(forKey: id)
        saveLocked()
        lock.unlock()
        try? FileManager.default.removeItem(at: itemDir(id))
    }

    /// iOS va suspendre l'app : fragments conservés, relance au retour (resumeInterrupted).
    @discardableResult
    public func interruptAll() -> Int {
        lock.lock()
        let active = index.filter { Self.isActive($0.value) }.map(\.key)
        for id in active {
            stopReasons[id] = .interrupted
            jobs[id]?.cancel()
            index[id]?["status"] = "interrupted"
            index[id]?["error"] = "Interrompu — reprise au retour dans l'app"
        }
        let items = active.compactMap { index[$0] }
        saveLocked()
        lock.unlock()
        items.forEach(onProgress)
        return active.count
    }

    public func itemDir(_ id: String) -> URL {
        root.appendingPathComponent(ProxyEngine.itemDirectoryName(id), isDirectory: true)
    }

    // MARK: Exécution

    private func run(id: String, generation: Int, payload: [String: Any], isScan: Bool, source: Source) async {
        await limiter.acquire()
        let dir = itemDir(id)
        // Toutes les mises à jour portent la génération du travail.
        let patch: Patch = { [weak self] fields in self?.patch(id, fields, generation: generation) }
        do {
            try Task.checkCancellation()
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

            // Fini juste avant la suspension : rien à retélécharger.
            if isScan, DownloadRules.isScanChapterComplete(dir, pages: Self.int(payload["pages"])) {
                patch(["status": "done", "percent": 100, "sizeBytes": Self.directorySize(dir), "finishedAt": Self.now()])
                return await finish(id, generation: generation)
            }
            if !isScan, let file = DownloadRules.completedFileName(in: dir) {
                patch(["status": "done", "percent": 100, "file": file, "sizeBytes": Self.directorySize(dir), "finishedAt": Self.now()])
                return await finish(id, generation: generation)
            }

            patch(["status": "downloading", "percent": 0])

            // Au mieux, jamais bloquantes.
            let imageSource = Source(provider: isScan ? "" : source.provider)
            if let cover = payload["animeCover"] as? String, !cover.isEmpty,
               await cacheImage(cover, source: imageSource, to: dir.appendingPathComponent("cover.jpg")) {
                patch(["coverFile": "cover.jpg"])
            }
            if !isScan, let thumb = payload["epThumb"] as? String, !thumb.isEmpty,
               await cacheImage(thumb, source: imageSource, to: dir.appendingPathComponent("thumb.jpg")) {
                patch(["thumbFile": "thumb.jpg"])
            }

            if isScan {
                let size = try await downloadScan(payload: payload, dir: dir, patch: patch)
                try Task.checkCancellation()
                patch(["status": "done", "percent": 100, "sizeBytes": size, "finishedAt": Self.now()])
            } else {
                let url = payload["directUrl"] as? String ?? ""
                let hls = DownloadRules.isHls(url)
                let size = hls
                    ? try await downloadHls(url: url, source: source, maxHeight: Self.int(payload["maxHeight"]), dir: dir, patch: patch)
                    : try await downloadMp4(url: url, source: source, dir: dir, patch: patch)
                try Task.checkCancellation()
                patch(["status": "done", "percent": 100, "file": hls ? "playlist.m3u8" : "video.mp4",
                       "sizeBytes": size, "finishedAt": Self.now()])
            }
        } catch {
            switch stopReason(id, generation: generation) {
            case .removed:
                // remove() a déjà nettoyé ; un fragment écrit entre-temps ne doit pas survivre.
                try? FileManager.default.removeItem(at: dir)
            case .interrupted:
                break // interruptAll() a déjà publié l'état
            case nil:
                let message = error is CancellationError ? "Annulé" : (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
                patch(["status": "error", "error": message])
            }
        }
        await finish(id, generation: generation)
    }

    private func finish(_ id: String, generation: Int) async {
        clearJob(id, generation: generation)
        await limiter.release()
    }

    private func clearJob(_ id: String, generation: Int) {
        lock.lock()
        defer { lock.unlock() }
        if generations[id] == generation {
            jobs.removeValue(forKey: id)
            generations.removeValue(forKey: id)
        }
    }

    private typealias Patch = ([String: Any]) -> Void

    // MARK: MP4

    private func downloadMp4(url: String, source: Source, dir: URL, patch: @escaping Patch) async throws -> Int64 {
        var total: Int64 = 0
        if let probe = try? await probeTotal(url, source: source) { total = probe }
        if total > 0 {
            do {
                return try await downloadMp4Chunks(url: url, source: source, dir: dir, total: total, patch: patch)
            } catch DownloadError.rangeIgnored {
                // Hôte qui ment sur Range : repli mono-flux, comme Android.
            }
        }
        return try await downloadMp4Single(url: url, source: source, dir: dir, patch: patch)
    }

    private func probeTotal(_ url: String, source: Source) async throws -> Int64? {
        var request = try proxiedRequest(url, source: source)
        request.setValue("bytes=0-1", forHTTPHeaderField: "Range")
        let (_, response) = try await transfers.data(request, limit: 64 * 1024)
        guard response.statusCode == 206 else { return nil }
        let total = DownloadRules.totalFromContentRange(response.value(forHTTPHeaderField: "Content-Range"), offset: 0, remaining: -1)
        return total > 0 ? total : nil
    }

    private func downloadMp4Chunks(url: String, source: Source, dir: URL, total: Int64, patch: @escaping Patch) async throws -> Int64 {
        let plan = DownloadRules.chunkPlan(total: total, chunkBytes: tuning.mp4ChunkBytes)
        let chunkURL = { (index: Int) in dir.appendingPathComponent(String(format: "video.mp4.c%04d", index)) }
        let progress = ProgressCounter()
        for (index, range) in plan.enumerated() where DownloadRules.fileSize(chunkURL(index)) == Int64(range.count) {
            progress.complete(index, bytes: Int64(range.count))
        }
        let throttle = Throttle(interval: tuning.progressInterval)
        let report = {
            let received = progress.total
            guard throttle.ready() else { return }
            patch(["status": "downloading", "percent": Double(received) * 100 / Double(total), "sizeBytes": received])
        }

        let pending = plan.indices.filter { DownloadRules.fileSize(chunkURL($0)) != Int64(plan[$0].count) }
        try await forEachConcurrently(pending, limit: tuning.mp4Connections) { index in
            let range = plan[index]
            let partial = chunkURL(index).appendingPathExtension("part")
            try await self.withRetry {
                var request = try self.proxiedRequest(url, source: source)
                request.setValue("bytes=\(range.lowerBound)-\(range.upperBound)", forHTTPHeaderField: "Range")
                let (_, written) = try await self.transfers.file(request, to: partial, accept: { response in
                    response.statusCode == 206 ? nil : DownloadError.rangeIgnored(response.statusCode)
                }, onBytes: { bytes in
                    progress.update(index, bytes: bytes)
                    report()
                })
                guard written == Int64(range.count) else { throw DownloadError.invalid("Morceau incomplet") }
            }
            try self.replace(chunkURL(index), with: partial)
            progress.complete(index, bytes: Int64(range.count))
            report()
        }

        // Morceaux bout à bout, puis renommage atomique.
        let assembling = dir.appendingPathComponent("video.mp4.part")
        FileManager.default.createFile(atPath: assembling.path, contents: nil)
        let output = try FileHandle(forWritingTo: assembling)
        do {
            for index in plan.indices {
                try Task.checkCancellation()
                let input = try FileHandle(forReadingFrom: chunkURL(index))
                defer { try? input.close() }
                while let block = try input.read(upToCount: 1024 * 1024), !block.isEmpty {
                    try output.write(contentsOf: block)
                }
            }
            try output.close()
        } catch {
            try? output.close()
            throw error
        }
        guard DownloadRules.fileSize(assembling) == total else { throw DownloadError.invalid("Assemblage incomplet") }
        try replace(dir.appendingPathComponent("video.mp4"), with: assembling)
        plan.indices.forEach { try? FileManager.default.removeItem(at: chunkURL($0)) }
        return total
    }

    private func downloadMp4Single(url: String, source: Source, dir: URL, patch: @escaping Patch) async throws -> Int64 {
        let partial = dir.appendingPathComponent("video.mp4.part")
        let throttle = Throttle(interval: tuning.progressInterval)
        let request = try proxiedRequest(url, source: source)
        let (response, written) = try await transfers.file(request, to: partial, onBytes: { bytes in
            guard throttle.ready() else { return }
            patch(["status": "downloading", "percent": 0, "sizeBytes": bytes])
        })
        let expected = response.expectedContentLength
        if expected > 0 && written != expected { throw DownloadError.invalid("Téléchargement incomplet") }
        try replace(dir.appendingPathComponent("video.mp4"), with: partial)
        return written
    }

    // MARK: HLS

    private func downloadHls(url: String, source: Source, maxHeight: Int, dir: URL, patch: @escaping Patch) async throws -> Int64 {
        var (text, base) = try await fetchPlaylist(url, source: source)
        if text.range(of: "#EXT-X-STREAM-INF", options: .caseInsensitive) != nil,
           let variant = DownloadRules.pickBestVariant(text, base: base, maxHeight: maxHeight) {
            (text, base) = try await fetchPlaylist(variant.absoluteString, source: source)
        }
        let playlist = DownloadRules.localizePlaylist(text, base: base)
        guard !playlist.segments.isEmpty else { throw DownloadError.invalid("Playlist HLS sans segment") }

        for (remote, name) in [(playlist.keyURL, "key.bin"), (playlist.mapURL, "init.mp4")] {
            guard let remote, !DownloadRules.isCompleteFragment(dir.appendingPathComponent(name)) else { continue }
            _ = try await downloadToFile(remote.absoluteString, source: source, destination: dir.appendingPathComponent(name))
        }

        let total = playlist.segments.count
        let counter = SegmentCounter()
        let throttle = Throttle(interval: tuning.progressInterval)
        try await forEachConcurrently(Array(playlist.segments.indices), limit: tuning.hlsConcurrency) { index in
            let segment = playlist.segments[index]
            let destination = dir.appendingPathComponent(segment.name)
            let bytes = DownloadRules.isCompleteFragment(destination)
                ? DownloadRules.fileSize(destination)
                : try await self.downloadToFile(segment.url.absoluteString, source: source, destination: destination)
            let (done, received) = counter.add(bytes)
            if throttle.ready() || done == total {
                patch(["status": "downloading", "percent": Double(done) * 100 / Double(total), "sizeBytes": received])
            }
        }
        try Data(playlist.text.utf8).write(to: dir.appendingPathComponent("playlist.m3u8"), options: .atomic)
        return counter.bytes
    }

    private func fetchPlaylist(_ url: String, source: Source) async throws -> (String, URL) {
        let request = try proxiedRequest(url, source: source, raw: true)
        let (data, response) = try await transfers.data(request)
        guard let text = String(data: data, encoding: .utf8) else { throw DownloadError.invalid("Playlist illisible") }
        let base = response.value(forHTTPHeaderField: "X-Upstream-Url").flatMap(URL.init(string:)) ?? URL(string: url)
        guard let base else { throw DownloadError.invalid("URL de playlist invalide") }
        return (text, base)
    }

    /// Via le proxy, avec essais répétés ; en `.part` d'abord, pour qu'un fragment tronqué ne passe
    /// jamais pour complet.
    private func downloadToFile(_ url: String, source: Source, destination: URL) async throws -> Int64 {
        let partial = destination.appendingPathExtension("part")
        var written: Int64 = 0
        try await withRetry {
            let request = try self.proxiedRequest(url, source: source)
            written = try await self.transfers.file(request, to: partial).1
        }
        try replace(destination, with: partial)
        return written
    }

    // MARK: Scans

    /// Images publiques, en direct : le proxy ne sert qu'aux en-têtes d'hébergeur vidéo. Une page
    /// déjà présente est sautée.
    private func downloadScan(payload: [String: Any], dir: URL, patch: @escaping Patch) async throws -> Int64 {
        let pages = Self.int(payload["pages"])
        guard pages > 0, let imageBase = payload["imageBase"] as? String,
              let oeuvre = payload["oeuvre"] as? String else { throw DownloadError.invalid("Chapitre sans page") }
        let folder = payload["folder"].map { "\($0)" } ?? "null"
        let prefix = "\(imageBase)/\(DownloadRules.pathEncode(oeuvre))/\(folder)/"
        let counter = SegmentCounter()
        let throttle = Throttle(interval: tuning.progressInterval)
        try await forEachConcurrently(Array(1...pages), limit: tuning.scanConcurrency) { page in
            let destination = dir.appendingPathComponent(DownloadRules.scanPageName(page))
            var bytes = DownloadRules.fileSize(destination)
            if !DownloadRules.isCompleteFragment(destination) {
                guard let url = URL(string: "\(prefix)\(page).jpg"),
                      let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http" else {
                    throw DownloadError.invalid("URL de page invalide")
                }
                let partial = destination.appendingPathExtension("part")
                try await self.withRetry { bytes = try await self.transfers.file(URLRequest(url: url), to: partial).1 }
                try self.replace(destination, with: partial)
            }
            let (done, received) = counter.add(bytes)
            if throttle.ready() || done == pages {
                patch(["status": "downloading", "percent": Double(done) * 100 / Double(pages), "sizeBytes": received])
            }
        }
        return counter.bytes
    }

    private func cacheImage(_ url: String, source: Source, to destination: URL) async -> Bool {
        guard let request = try? proxiedRequest(url, source: source) else { return false }
        let partial = destination.appendingPathExtension("part")
        guard (try? await transfers.file(request, to: partial)) != nil else {
            try? FileManager.default.removeItem(at: partial)
            return false
        }
        return (try? replace(destination, with: partial)) != nil
    }

    // MARK: Réseau

    private func proxiedRequest(_ target: String, source: Source, raw: Bool = false) throws -> URLRequest {
        guard let proxy = proxy() else { throw DownloadError.proxyUnavailable }
        var query = "url=\(ProxyRules.formEncode(target))&provider=\(ProxyRules.formEncode(source.provider))"
        if !source.referer.isEmpty { query += "&referer=\(ProxyRules.formEncode(source.referer))" }
        if !source.origin.isEmpty { query += "&origin=\(ProxyRules.formEncode(source.origin))" }
        if raw { query += "&raw=1" }
        query += "&t=\(ProxyRules.formEncode(proxy.token))"
        guard let url = URL(string: "http://127.0.0.1:\(proxy.port)/video/proxy?\(query)") else {
            throw DownloadError.invalid("URL invalide")
        }
        return URLRequest(url: url)
    }

    private func withRetry(_ body: () async throws -> Void) async throws {
        var lastError: Error?
        for attempt in 1...max(1, tuning.maxAttempts) {
            try Task.checkCancellation()
            do {
                try await body()
                return
            } catch {
                if error is CancellationError || Task.isCancelled { throw CancellationError() }
                if case DownloadError.rangeIgnored = error { throw error }
                lastError = error
                if attempt < tuning.maxAttempts {
                    try await Task.sleep(nanoseconds: UInt64(tuning.retryDelay * Double(attempt) * 1_000_000_000))
                }
            }
        }
        throw lastError ?? DownloadError.invalid("Échec")
    }

    /// La première erreur annule le reste.
    private func forEachConcurrently<T: Sendable>(_ items: [T], limit: Int,
                                                  _ body: @escaping @Sendable (T) async throws -> Void) async throws {
        try await withThrowingTaskGroup(of: Void.self) { group in
            var iterator = items.makeIterator()
            for _ in 0..<max(1, limit) {
                guard let item = iterator.next() else { break }
                group.addTask { try await body(item) }
            }
            while try await group.next() != nil {
                if let item = iterator.next() { group.addTask { try await body(item) } }
            }
        }
    }

    private func replace(_ destination: URL, with source: URL) throws {
        try? FileManager.default.removeItem(at: destination)
        try FileManager.default.moveItem(at: source, to: destination)
    }

    // MARK: Index

    private var indexURL: URL { root.appendingPathComponent("index.json") }

    private func loadIndex() {
        guard let data = try? Data(contentsOf: indexURL),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        for (key, value) in object {
            if let item = value as? Item { index[key] = item }
        }
    }

    /// Arrêt brutal : fichier final présent, seul l'index manquait ; sinon les fragments restent.
    private func reconcile() {
        for (id, item) in index where Self.isActive(item) {
            let dir = itemDir(id)
            let isScan = item["type"] as? String == "scan"
            let complete = isScan
                ? DownloadRules.isScanChapterComplete(dir, pages: Self.int(item["pages"]))
                : DownloadRules.completedFileName(in: dir) != nil
            var updated = item
            if complete {
                updated["status"] = "done"
                updated["percent"] = 100
                if !isScan { updated["file"] = DownloadRules.completedFileName(in: dir) }
                updated.removeValue(forKey: "error")
            } else {
                updated["status"] = "interrupted"
                updated["error"] = "Interrompu — reprise au retour dans l'app"
            }
            index[id] = updated
        }
        saveLocked()
    }

    private func patch(_ id: String, _ fields: [String: Any], generation: Int) {
        lock.lock()
        // Une entrée retirée, figée par interruptAll() ou reprise par un autre travail ne bouge plus.
        guard var item = index[id], stopReasons[id] == nil, generations[id] == generation else {
            lock.unlock()
            return
        }
        for (key, value) in fields { item[key] = value }
        index[id] = item
        let isProgress = fields["status"] as? String == "downloading"
        if !isProgress || Date().timeIntervalSince(lastSave) >= 2 { saveLocked() }
        lock.unlock()
        onProgress(item)
    }

    /// nil = aucun arrêt demandé pour ce travail (un travail périmé compte comme interrompu).
    private func stopReason(_ id: String, generation: Int) -> StopReason? {
        lock.lock()
        defer { lock.unlock() }
        if let reason = stopReasons[id] { return reason }
        return generations[id] == generation ? nil : .interrupted
    }

    private static func directorySize(_ dir: URL) -> Int64 {
        let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
        return files.reduce(0) { $0 + DownloadRules.fileSize($1) }
    }

    /// Verrou tenu.
    private func saveLocked() {
        lastSave = Date()
        guard JSONSerialization.isValidJSONObject(index),
              let data = try? JSONSerialization.data(withJSONObject: index) else { return }
        try? data.write(to: indexURL, options: .atomic)
    }

    private static func isActive(_ item: Item) -> Bool {
        let status = item["status"] as? String
        return status == "queued" || status == "downloading"
    }

    private static func int(_ value: Any?) -> Int {
        if let number = value as? NSNumber { return number.intValue }
        if let string = value as? String { return Int(string) ?? 0 }
        return 0
    }

    private static func now() -> Int64 {
        Int64(Date().timeIntervalSince1970 * 1000)
    }
}

// MARK: - Compteurs partagés entre tâches concurrentes

private final class ProgressCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var completed: [Int: Int64] = [:]
    private var inFlight: [Int: Int64] = [:]

    func update(_ index: Int, bytes: Int64) {
        lock.lock()
        inFlight[index] = bytes
        lock.unlock()
    }

    func complete(_ index: Int, bytes: Int64) {
        lock.lock()
        inFlight.removeValue(forKey: index)
        completed[index] = bytes
        lock.unlock()
    }

    var total: Int64 {
        lock.lock()
        defer { lock.unlock() }
        return completed.values.reduce(0, +) + inFlight.values.reduce(0, +)
    }
}

private final class SegmentCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var done = 0
    private(set) var bytes: Int64 = 0

    func add(_ size: Int64) -> (done: Int, bytes: Int64) {
        lock.lock()
        defer { lock.unlock() }
        done += 1
        bytes += size
        return (done, bytes)
    }
}

private final class Throttle: @unchecked Sendable {
    private let lock = NSLock()
    private let interval: TimeInterval
    private var last = Date.distantPast

    init(interval: TimeInterval) {
        self.interval = interval
    }

    func ready() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        let now = Date()
        guard now.timeIntervalSince(last) >= interval else { return false }
        last = now
        return true
    }
}
