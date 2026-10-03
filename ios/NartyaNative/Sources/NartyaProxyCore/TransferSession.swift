import Foundation

public enum DownloadError: LocalizedError, Equatable {
    case http(Int)
    case rangeIgnored(Int)
    case proxyUnavailable
    case invalid(String)

    public var errorDescription: String? {
        switch self {
        case .http(let code): return "HTTP \(code)"
        case .rangeIgnored(let code): return "Range non honoré (HTTP \(code))"
        case .proxyUnavailable: return "Proxy de lecture indisponible"
        case .invalid(let message): return message
        }
    }
}

/// Écrits au fil de l'eau, annulables par la Task appelante. Un seul délégué : mémoire bornée
/// quelle que soit la taille d'un épisode.
final class TransferSession: NSObject, URLSessionDataDelegate, @unchecked Sendable {
    private final class Transfer {
        let accept: (HTTPURLResponse) -> Error?
        let sink: (Data) throws -> Void
        let continuation: CheckedContinuation<HTTPURLResponse, Error>
        var response: HTTPURLResponse?
        var failure: Error?

        init(accept: @escaping (HTTPURLResponse) -> Error?, sink: @escaping (Data) throws -> Void,
             continuation: CheckedContinuation<HTTPURLResponse, Error>) {
            self.accept = accept
            self.sink = sink
            self.continuation = continuation
        }
    }

    private let lock = NSLock()
    /// Jamais `taskIdentifier`, numéroté par session.
    private var transfers: [ObjectIdentifier: Transfer] = [:]
    /// Pas de `lazy var` : initialisé par plusieurs tâches, il créait plusieurs sessions aux numéros
    /// de requête en double (trois pages de scan lancées ensemble, une seule aboutissait).
    private var session: URLSession!

    override init() {
        super.init()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpShouldSetCookies = false
        configuration.httpCookieAcceptPolicy = .never
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = 60
        configuration.httpMaximumConnectionsPerHost = 12
        let queue = OperationQueue()
        queue.maxConcurrentOperationCount = 1
        queue.name = "app.nartya.downloads.transfers"
        session = URLSession(configuration: configuration, delegate: self, delegateQueue: queue)
    }

    /// `accept` refuse une réponse avant toute écriture ; `sink` reçoit le corps par morceaux.
    func run(_ request: URLRequest, accept: @escaping (HTTPURLResponse) -> Error?,
             sink: @escaping (Data) throws -> Void) async throws -> HTTPURLResponse {
        try Task.checkCancellation()
        let task = session.dataTask(with: request)
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                lock.lock()
                transfers[ObjectIdentifier(task)] = Transfer(accept: accept, sink: sink, continuation: continuation)
                lock.unlock()
                task.resume()
            }
        } onCancel: {
            task.cancel()
        }
    }

    /// Plafonné : playlists et petites ressources.
    func data(_ request: URLRequest, limit: Int = 16 * 1024 * 1024) async throws -> (Data, HTTPURLResponse) {
        var body = Data()
        let response = try await run(request, accept: Self.requireSuccess) { chunk in
            body.append(chunk)
            if body.count > limit { throw DownloadError.invalid("Réponse trop volumineuse") }
        }
        return (body, response)
    }

    /// Écrase `destination`. Renvoie la réponse et le nombre d'octets.
    func file(_ request: URLRequest, to destination: URL, accept: @escaping (HTTPURLResponse) -> Error? = requireSuccess,
              onBytes: ((Int64) -> Void)? = nil) async throws -> (HTTPURLResponse, Int64) {
        FileManager.default.createFile(atPath: destination.path, contents: nil)
        let handle = try FileHandle(forWritingTo: destination)
        defer { try? handle.close() }
        var written: Int64 = 0
        let response = try await run(request, accept: accept) { chunk in
            try handle.write(contentsOf: chunk)
            written += Int64(chunk.count)
            onBytes?(written)
        }
        return (response, written)
    }

    static func requireSuccess(_ response: HTTPURLResponse) -> Error? {
        (200..<300).contains(response.statusCode) ? nil : DownloadError.http(response.statusCode)
    }

    private func transfer(_ task: URLSessionTask) -> Transfer? {
        lock.lock()
        defer { lock.unlock() }
        return transfers[ObjectIdentifier(task)]
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let transfer = transfer(dataTask), let http = response as? HTTPURLResponse else {
            completionHandler(.cancel)
            return
        }
        transfer.response = http
        if let refusal = transfer.accept(http) {
            transfer.failure = refusal
            completionHandler(.cancel)
        } else {
            completionHandler(.allow)
        }
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard let transfer = transfer(dataTask), transfer.failure == nil else { return }
        do {
            try transfer.sink(data)
        } catch {
            transfer.failure = error
            dataTask.cancel()
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        lock.lock()
        let transfer = transfers.removeValue(forKey: ObjectIdentifier(task))
        lock.unlock()
        guard let transfer else { return }
        if let failure = transfer.failure {
            transfer.continuation.resume(throwing: failure)
        } else if let error {
            transfer.continuation.resume(throwing: (error as NSError).code == NSURLErrorCancelled ? CancellationError() : error)
        } else if let response = transfer.response {
            transfer.continuation.resume(returning: response)
        } else {
            transfer.continuation.resume(throwing: DownloadError.invalid("Réponse vide"))
        }
    }
}

/// 2 épisodes à la fois, comme Android.
actor AsyncLimiter {
    private let limit: Int
    private var running = 0
    private var waiters: [CheckedContinuation<Void, Never>] = []

    init(limit: Int) {
        self.limit = limit
    }

    func acquire() async {
        if running < limit {
            running += 1
            return
        }
        await withCheckedContinuation { waiters.append($0) }
    }

    func release() {
        if waiters.isEmpty {
            running = max(0, running - 1)
        } else {
            waiters.removeFirst().resume()
        }
    }
}
