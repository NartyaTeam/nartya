import Foundation
import os

/// Parité avec ProxyServer.java. Routes, toutes protégées par le jeton `t` :
/// - `/video/proxy?url=&provider=&referer=&origin=[&raw=1]` : relais, Range, réécriture HLS ;
/// - `/local?id=&path=` : fichiers téléchargés.
/// Tout l'état vit sur une file série, où URLSession livre aussi ses rappels.
public final class ProxyEngine: NSObject, @unchecked Sendable {
    public let token: String

    private static let maxPlaylistBytes = 8 * 1024 * 1024
    private static let highWatermark = 2 * 1024 * 1024
    private static let localChunk = 256 * 1024
    private static let log = Logger(subsystem: "app.nartya", category: "proxy")

    private let queue = DispatchQueue(label: "app.nartya.proxy")
    private let policy: AddressPolicy
    private let downloadsRoot: URL?
    private var config = ProxyConfig.empty
    private var server: LoopbackServer?
    private var lastPort: UInt16?
    private var exchanges: [Int: Exchange] = [:]
    private lazy var session: URLSession = makeSession()

    public init(policy: AddressPolicy = .strict, downloadsRoot: URL? = nil, token: String = ProxyRules.newToken()) {
        self.policy = policy
        self.downloadsRoot = downloadsRoot
        self.token = token
        super.init()
    }

    // MARK: Cycle de vie

    public var port: UInt16? { queue.sync { server?.isReady == true ? server?.port : nil } }

    public func updateConfig(_ next: ProxyConfig) {
        queue.async { self.config = next }
    }

    /// Renvoie le port d'écoute.
    public func start() async throws -> UInt16 {
        try await ensureRunning().port
    }

    /// Après une suspension iOS : même port d'abord, pour garder valides les URL du lecteur ;
    /// `portChanged` dit au JS de vider ses caches sinon.
    public func ensureRunning() async throws -> (port: UInt16, restarted: Bool, portChanged: Bool) {
        try await withCheckedThrowingContinuation { continuation in
            queue.async {
                if let server = self.server, server.isReady, let port = server.port {
                    continuation.resume(returning: (port, false, false))
                    return
                }
                let previous = self.lastPort
                self.bind(preferredPort: previous) { result in
                    switch result {
                    case .success(let port):
                        continuation.resume(returning: (port, previous != nil, previous != nil && previous != port))
                    case .failure(let error):
                        continuation.resume(throwing: error)
                    }
                }
            }
        }
    }

    public func stop() {
        queue.sync {
            server?.stop()
            server = nil
            for exchange in exchanges.values { exchange.task?.cancel() }
            exchanges.removeAll()
        }
    }

    /// Tests : perte du socket d'écoute lors d'une suspension.
    func simulateListenerLoss() {
        queue.sync { server?.stop() }
    }

    private func bind(preferredPort: UInt16?, attemptsLeft: Int = 3,
                      completion: @escaping (Result<UInt16, Error>) -> Void) {
        let server = LoopbackServer(queue: queue) { [weak self] request, writer in
            self?.handle(request, writer)
        }
        self.server = server
        server.start(preferredPort: preferredPort) { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let port):
                self.lastPort = port
                completion(.success(port))
            case .failure where preferredPort != nil && attemptsLeft > 1:
                // Le système libère un port de façon asynchrone : changer de port coupe la lecture.
                self.queue.asyncAfter(deadline: .now() + 0.15) {
                    self.bind(preferredPort: preferredPort, attemptsLeft: attemptsLeft - 1, completion: completion)
                }
            case .failure where preferredPort != nil:
                // Port repris par un autre processus.
                self.bind(preferredPort: nil, completion: completion)
            case .failure(let error):
                completion(.failure(error))
            }
        }
    }

    private func makeSession() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpShouldSetCookies = false
        configuration.httpCookieAcceptPolicy = .never
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        // HLS charge en parallèle manifeste, audio, vidéo et clés.
        configuration.httpMaximumConnectionsPerHost = 12
        configuration.timeoutIntervalForRequest = 60
        configuration.waitsForConnectivity = false
        let delegateQueue = OperationQueue()
        delegateQueue.maxConcurrentOperationCount = 1
        delegateQueue.underlyingQueue = queue
        return URLSession(configuration: configuration, delegate: self, delegateQueue: delegateQueue)
    }

    // MARK: Routage

    private func handle(_ request: HTTPRequest, _ writer: HTTPResponseWriter) {
        if request.method == "OPTIONS" {
            writer.writeHead(status: 200, headers: [("Content-Length", "0")])
            writer.finish()
            return
        }
        guard request.method == "GET" || request.method == "HEAD" else {
            writer.respond(status: 405, body: "Méthode non gérée")
            return
        }
        guard ProxyRules.tokensEqual(request.query["t"], token) else {
            writer.respond(status: 403, body: "Jeton invalide")
            return
        }
        switch request.path {
        case "/video/proxy": handleProxy(request, writer)
        case "/local": handleLocal(request, writer)
        default: writer.respond(status: 404, body: "Not found")
        }
    }

    // MARK: /video/proxy

    private final class Exchange {
        let writer: HTTPResponseWriter
        let provider: String?
        let referer: String?
        let origin: String?
        let raw: Bool
        let requestedRange: String?
        let requestedURL: URL
        var task: URLSessionDataTask?
        var mode: Mode = .pending
        var body = Data()
        /// Hôte qui ignore Range : octets à sauter puis à transmettre.
        var skip: Int64 = 0
        var remaining: Int64?
        var suspended = false

        enum Mode { case pending, stream, playlist(URL), rawPlaylist(URL), failed }

        init(writer: HTTPResponseWriter, provider: String?, referer: String?, origin: String?,
             raw: Bool, requestedRange: String?, requestedURL: URL) {
            self.writer = writer
            self.provider = provider
            self.referer = referer
            self.origin = origin
            self.raw = raw
            self.requestedRange = requestedRange
            self.requestedURL = requestedURL
        }
    }

    private func handleProxy(_ request: HTTPRequest, _ writer: HTTPResponseWriter) {
        guard let rawURL = request.query["url"], !rawURL.isEmpty else {
            writer.respond(status: 400, body: "Missing url")
            return
        }
        guard let target = URL(string: rawURL), let host = target.host, !host.isEmpty,
              target.user == nil, target.password == nil,
              let scheme = target.scheme?.lowercased(), scheme == "http" || scheme == "https" else {
            writer.respond(status: 400, body: "URL distante invalide")
            return
        }

        let given = request.query["provider"]
        let provider = (given?.isEmpty == false && given != "unknown") ? given : config.detectProvider(host: host)
        let url = ProxyRules.canonicalize(target, source: config.source(provider))
        let referer = request.query["referer"], origin = request.query["origin"]
        let headers = ProxyRules.upstreamHeaders(url: url, provider: provider, config: config, referer: referer, origin: origin)

        var upstream = URLRequest(url: url)
        upstream.httpMethod = "GET"
        upstream.httpShouldHandleCookies = false
        for (name, value) in headers { upstream.setValue(value, forHTTPHeaderField: name) }
        let range = request.headers["range"]
        if let range { upstream.setValue(range, forHTTPHeaderField: "Range") }

        let exchange = Exchange(writer: writer, provider: provider, referer: referer, origin: origin,
                                raw: request.query["raw"] == "1", requestedRange: range, requestedURL: url)
        let upstreamHost = url.host ?? host
        let policy = self.policy
        DispatchQueue.global(qos: .userInitiated).async {
            let allowed = policy.allows(host: upstreamHost)
            self.queue.async {
                guard !writer.isClosed else { return }
                guard allowed else {
                    Self.log.error("Hôte bloqué : \(upstreamHost, privacy: .public)")
                    writer.respond(status: 502, body: "Adresse bloquée")
                    return
                }
                let task = self.session.dataTask(with: upstream)
                exchange.task = task
                self.exchanges[task.taskIdentifier] = exchange
                writer.onClientClose = { [weak task] in task?.cancel() }
                task.resume()
            }
        }
    }

    private func proxyBase() -> String {
        "http://127.0.0.1:\(server?.port ?? 0)/video/proxy"
    }

    // MARK: /local

    private func handleLocal(_ request: HTTPRequest, _ writer: HTTPResponseWriter) {
        guard let file = Self.resolveLocalFile(root: downloadsRoot, id: request.query["id"], relative: request.query["path"]) else {
            writer.respond(status: 404, body: "Fichier introuvable")
            return
        }
        let name = file.lastPathComponent.lowercased()
        if name.hasSuffix(".m3u8") {
            guard let data = try? Data(contentsOf: file), let content = String(data: data, encoding: .utf8),
                  let port = server?.port, let id = request.query["id"] else {
                writer.respond(status: 500, body: "Playlist locale illisible")
                return
            }
            let rewritten = ProxyRules.rewriteLocalPlaylist(content, id: id, port: port, token: token)
            writer.respond(status: 200, contentType: "application/vnd.apple.mpegurl", body: rewritten)
            return
        }

        guard let size = (try? FileManager.default.attributesOfItem(atPath: file.path)[.size] as? NSNumber)?.int64Value,
              let handle = try? FileHandle(forReadingFrom: file) else {
            writer.respond(status: 500, body: "Fichier illisible")
            return
        }
        var headers: [(String, String)] = [("Content-Type", Self.localMime(name)), ("Accept-Ranges", "bytes")]
        var bounds: ClosedRange<Int64> = 0...max(0, size - 1)
        var status = 200
        if let range = request.headers["range"] {
            guard let parsed = ProxyRules.parseByteRange(range, size: size) else {
                try? handle.close()
                writer.writeHead(status: 416, headers: [("Content-Range", "bytes */\(size)"), ("Content-Length", "0")])
                writer.finish()
                return
            }
            bounds = parsed
            status = 206
            headers.append(("Content-Range", "bytes \(parsed.lowerBound)-\(parsed.upperBound)/\(size)"))
        }
        let length = size == 0 ? 0 : bounds.upperBound - bounds.lowerBound + 1
        headers.append(("Content-Length", "\(length)"))
        writer.writeHead(status: status, headers: headers)
        if writer.isHead || length == 0 {
            try? handle.close()
            writer.finish()
            return
        }
        do {
            try handle.seek(toOffset: UInt64(bounds.lowerBound))
        } catch {
            try? handle.close()
            writer.finish()
            return
        }
        streamFile(handle, remaining: length, writer: writer)
    }

    /// Le morceau suivant part quand le précédent a quitté le processus : mémoire bornée.
    private func streamFile(_ handle: FileHandle, remaining: Int64, writer: HTTPResponseWriter) {
        guard !writer.isClosed, remaining > 0 else {
            try? handle.close()
            writer.finish()
            return
        }
        let count = Int(min(Int64(Self.localChunk), remaining))
        let data = (try? handle.read(upToCount: count)) ?? nil
        guard let data, !data.isEmpty else {
            try? handle.close()
            writer.finish()
            return
        }
        writer.write(data) { [weak self] in
            self?.queue.async { self?.streamFile(handle, remaining: remaining - Int64(data.count), writer: writer) }
        }
    }

    /// base64url(id) sans remplissage, aligné avec Android.
    static func itemDirectoryName(_ id: String) -> String {
        Data(id.utf8).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    /// Borné au dossier de l'entrée (anti-traversée). nil sinon.
    static func resolveLocalFile(root: URL?, id: String?, relative: String?) -> URL? {
        guard let root, let id, !id.isEmpty else { return nil }
        let base = root.appendingPathComponent(itemDirectoryName(id), isDirectory: true)
            .standardizedFileURL.resolvingSymlinksInPath()
        let candidate = base.appendingPathComponent(relative ?? "video.mp4")
            .standardizedFileURL.resolvingSymlinksInPath()
        let basePath = base.path, candidatePath = candidate.path
        // Évite le piège « …/abc » vs « …/abc-evil ».
        guard candidatePath == basePath || candidatePath.hasPrefix(basePath + "/") else { return nil }
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: candidatePath, isDirectory: &isDirectory), !isDirectory.boolValue else {
            return nil
        }
        return candidate
    }

    private static func localMime(_ name: String) -> String {
        if name.hasSuffix(".mp4") { return "video/mp4" }
        if name.hasSuffix(".m3u8") { return "application/vnd.apple.mpegurl" }
        if name.hasSuffix(".ts") { return "video/mp2t" }
        if name.hasSuffix(".m4s") { return "video/iso.segment" }
        if name.hasSuffix(".jpg") || name.hasSuffix(".jpeg") { return "image/jpeg" }
        if name.hasSuffix(".png") { return "image/png" }
        if name.hasSuffix(".webp") { return "image/webp" }
        return "application/octet-stream"
    }

    // MARK: Réponse amont

    private func beginResponse(_ exchange: Exchange, _ response: HTTPURLResponse) -> Bool {
        let finalURL = response.url ?? exchange.requestedURL
        let contentType = response.value(forHTTPHeaderField: "Content-Type") ?? ""
        let status = response.statusCode
        let looksLikePlaylist = contentType.lowercased().contains("mpegurl") ||
            exchange.requestedURL.absoluteString.contains(".m3u8") || finalURL.absoluteString.contains(".m3u8")

        // Une erreur de l'hôte (403 HTML…) est relayée telle quelle, jamais réécrite en 200.
        if looksLikePlaylist && (200..<300).contains(status) {
            exchange.mode = exchange.raw ? .rawPlaylist(finalURL) : .playlist(finalURL)
            return true
        }

        exchange.mode = .stream
        let writer = exchange.writer
        let encoding = response.value(forHTTPHeaderField: "Content-Encoding")?.lowercased() ?? "identity"
        // URLSession a décompressé le corps : la longueur amont ne correspond plus.
        let length: Int64? = (encoding == "identity" && response.expectedContentLength >= 0) ? response.expectedContentLength : nil
        var headers: [(String, String)] = [
            ("Content-Type", contentType.isEmpty ? "application/octet-stream" : contentType),
            ("Accept-Ranges", "bytes"),
            ("X-Upstream-Url", finalURL.absoluteString),
        ]
        var outStatus = status

        let contentRange = response.value(forHTTPHeaderField: "Content-Range")
        if let requested = exchange.requestedRange, status == 200, contentRange == nil, let total = length {
            // Sinon le lecteur reçoit le début du fichier en croyant avoir obtenu son seek.
            guard let bounds = ProxyRules.parseByteRange(requested, size: total) else {
                writer.writeHead(status: 416, headers: [("Content-Range", "bytes */\(total)"), ("Content-Length", "0")])
                writer.finish()
                return false
            }
            exchange.skip = bounds.lowerBound
            exchange.remaining = bounds.upperBound - bounds.lowerBound + 1
            outStatus = 206
            headers.append(("Content-Range", "bytes \(bounds.lowerBound)-\(bounds.upperBound)/\(total)"))
            headers.append(("Content-Length", "\(exchange.remaining!)"))
        } else {
            if let contentRange { headers.append(("Content-Range", contentRange)) }
            if let length { headers.append(("Content-Length", "\(length)")) }
        }
        writer.writeHead(status: outStatus, headers: headers)
        if writer.isHead {
            writer.finish()
            return false
        }
        return true
    }

    private func forward(_ exchange: Exchange, _ data: Data) {
        var chunk = data
        if exchange.skip > 0 {
            let dropped = Int(min(Int64(chunk.count), exchange.skip))
            exchange.skip -= Int64(dropped)
            chunk = chunk.dropFirst(dropped)
        }
        if let remaining = exchange.remaining {
            if Int64(chunk.count) > remaining { chunk = chunk.prefix(Int(remaining)) }
            exchange.remaining = remaining - Int64(chunk.count)
        }
        let writer = exchange.writer
        if !chunk.isEmpty { writer.write(Data(chunk)) }
        if exchange.remaining == 0 {
            exchange.task?.cancel()
            writer.finish()
            return
        }
        if writer.pendingBytes > Self.highWatermark, !exchange.suspended, let task = exchange.task {
            exchange.suspended = true
            task.suspend()
            writer.onDrain = { [weak self, weak task] in
                self?.queue.async {
                    exchange.suspended = false
                    task?.resume()
                }
            }
        }
    }

    private func complete(_ exchange: Exchange, error: Error?) {
        let writer = exchange.writer
        if let error {
            if (error as NSError).code != NSURLErrorCancelled {
                Self.log.error("Amont en échec (\(exchange.requestedURL.host ?? "?", privacy: .public)) : \((error as NSError).code)")
            }
            if !writer.headSent { writer.respond(status: 502, body: "Hébergeur injoignable") } else { writer.finish() }
            return
        }
        switch exchange.mode {
        case .playlist(let finalURL):
            let text = String(data: exchange.body, encoding: .utf8) ?? String(decoding: exchange.body, as: UTF8.self)
            let rewritten = ProxyRules.rewritePlaylist(text, baseURL: finalURL, proxyBase: proxyBase(),
                                                       provider: exchange.provider, referer: exchange.referer,
                                                       origin: exchange.origin, token: token)
            writer.respond(status: 200, contentType: "application/vnd.apple.mpegurl", body: rewritten)
        case .rawPlaylist(let finalURL):
            let data = exchange.body
            writer.writeHead(status: 200, headers: [
                ("Content-Type", "application/vnd.apple.mpegurl"),
                ("Content-Length", "\(data.count)"),
                ("X-Upstream-Url", finalURL.absoluteString),
            ])
            writer.write(data)
            writer.finish()
        case .pending:
            writer.respond(status: 502, body: "Réponse amont vide")
        case .stream, .failed:
            writer.finish()
        }
    }
}

// MARK: - URLSessionDataDelegate (rappels livrés sur `queue`)

extension ProxyEngine: URLSessionDataDelegate {
    public func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                           completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let exchange = exchanges[dataTask.taskIdentifier], !exchange.writer.isClosed,
              let http = response as? HTTPURLResponse else {
            completionHandler(.cancel)
            return
        }
        completionHandler(beginResponse(exchange, http) ? .allow : .cancel)
    }

    public func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard let exchange = exchanges[dataTask.taskIdentifier], !exchange.writer.isClosed else {
            dataTask.cancel()
            return
        }
        switch exchange.mode {
        case .playlist, .rawPlaylist:
            exchange.body.append(data)
            if exchange.body.count > Self.maxPlaylistBytes {
                exchange.mode = .failed
                dataTask.cancel()
                exchange.writer.respond(status: 502, body: "Playlist trop volumineuse")
            }
        case .stream:
            forward(exchange, data)
        case .pending, .failed:
            break
        }
    }

    public func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let exchange = exchanges.removeValue(forKey: task.taskIdentifier) else { return }
        if case .failed = exchange.mode { return }
        complete(exchange, error: error)
    }

    public func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                           newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        guard let url = request.url, let host = url.host,
              let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else {
            refuseRedirect(task, completionHandler)
            return
        }
        let policy = self.policy
        DispatchQueue.global(qos: .userInitiated).async {
            let allowed = policy.allows(host: host)
            self.queue.async {
                if allowed {
                    completionHandler(request)
                } else {
                    Self.log.error("Redirection bloquée vers \(host, privacy: .public)")
                    self.refuseRedirect(task, completionHandler)
                }
            }
        }
    }

    /// Rendre la 3xx la relaierait au lecteur, qui suivrait la redirection interdite : 502 à la place.
    private func refuseRedirect(_ task: URLSessionTask, _ completionHandler: (URLRequest?) -> Void) {
        if let exchange = exchanges[task.taskIdentifier] {
            exchange.mode = .failed
            exchange.writer.respond(status: 502, body: "Redirection bloquée")
        }
        task.cancel()
        completionHandler(nil)
    }
}
