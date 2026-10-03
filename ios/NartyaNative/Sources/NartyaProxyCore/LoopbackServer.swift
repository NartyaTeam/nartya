import Foundation
import Network

/// Une requête par connexion (`Connection: close`) : le serveur reste minimal.
public struct HTTPRequest: Sendable {
    public let method: String
    public let path: String
    public let query: [String: String]
    /// En minuscules.
    public let headers: [String: String]
}

public typealias HTTPHandler = (HTTPRequest, HTTPResponseWriter) -> Void

/// Lié à 127.0.0.1. Tous les rappels passent sur `queue`, fournie par l'appelant : pas de verrous.
final class LoopbackServer: @unchecked Sendable {
    private static let maxHeaderBytes = 32 * 1024

    private let queue: DispatchQueue
    private let handler: HTTPHandler
    private var listener: NWListener?
    private var connections: [ObjectIdentifier: NWConnection] = [:]

    private(set) var port: UInt16?
    private(set) var isReady = false

    init(queue: DispatchQueue, handler: @escaping HTTPHandler) {
        self.queue = queue
        self.handler = handler
    }

    /// `preferredPort` reprend le même port après une suspension iOS : les URL déjà données au
    /// lecteur restent valides. Sur `queue`.
    func start(preferredPort: UInt16?, completion: @escaping (Result<UInt16, Error>) -> Void) {
        stop()
        let parameters = NWParameters.tcp
        parameters.allowLocalEndpointReuse = true
        parameters.requiredInterfaceType = .loopback
        let port = preferredPort.flatMap(NWEndpoint.Port.init(rawValue:)) ?? .any
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: port)

        let listener: NWListener
        do {
            listener = try NWListener(using: parameters)
        } catch {
            completion(.failure(error))
            return
        }
        self.listener = listener
        var settled = false
        listener.stateUpdateHandler = { [weak self, weak listener] state in
            guard let self, let listener, self.listener === listener else { return }
            switch state {
            case .ready:
                self.isReady = true
                self.port = listener.port?.rawValue
                if !settled, let port = self.port {
                    settled = true
                    completion(.success(port))
                }
            // `.waiting` : port encore occupé ; sans ce cas, la relance attendrait sans fin.
            case .failed(let error), .waiting(let error):
                self.isReady = false
                listener.cancel()
                if !settled {
                    settled = true
                    completion(.failure(error))
                }
            case .cancelled:
                self.isReady = false
            default:
                break
            }
        }
        listener.newConnectionHandler = { [weak self] connection in
            self?.accept(connection)
        }
        listener.start(queue: queue)
    }

    func stop() {
        listener?.cancel()
        listener = nil
        isReady = false
        for connection in connections.values { connection.cancel() }
        connections.removeAll()
    }

    private func accept(_ connection: NWConnection) {
        let key = ObjectIdentifier(connection)
        connections[key] = connection
        let writer = HTTPResponseWriter(connection: connection, queue: queue)
        connection.stateUpdateHandler = { [weak self] state in
            switch state {
            case .failed, .cancelled:
                self?.connections.removeValue(forKey: key)
                writer.clientDidClose()
            default:
                break
            }
        }
        connection.start(queue: queue)
        readHead(connection, buffer: Data(), writer: writer)
    }

    private func readHead(_ connection: NWConnection, buffer: Data, writer: HTTPResponseWriter) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 16 * 1024) { [weak self] data, _, isComplete, error in
            guard let self else { return }
            var buffer = buffer
            if let data { buffer.append(data) }
            if let end = buffer.range(of: Data("\r\n\r\n".utf8)) {
                guard let request = Self.parse(buffer[..<end.lowerBound]) else {
                    writer.respond(status: 400, body: "Requête invalide")
                    return
                }
                writer.isHead = request.method == "HEAD"
                self.watchForClose(connection, writer: writer)
                self.handler(request, writer)
            } else if error != nil || isComplete {
                connection.cancel()
            } else if buffer.count > Self.maxHeaderBytes {
                writer.respond(status: 431, body: "En-têtes trop longs")
            } else {
                self.readHead(connection, buffer: buffer, writer: writer)
            }
        }
    }

    /// Le lecteur coupe souvent en route (seek, qualité) : la requête amont est annulée aussitôt.
    private func watchForClose(_ connection: NWConnection, writer: HTTPResponseWriter) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 4096) { [weak self] _, _, isComplete, error in
            if isComplete || error != nil {
                writer.clientDidClose()
            } else {
                self?.watchForClose(connection, writer: writer)
            }
        }
    }

    static func parse(_ head: Data) -> HTTPRequest? {
        guard let text = String(data: head, encoding: .utf8) ?? String(data: head, encoding: .isoLatin1) else { return nil }
        let lines = text.components(separatedBy: "\r\n")
        let requestLine = lines[0].split(separator: " ")
        guard requestLine.count == 3, requestLine[2].hasPrefix("HTTP/1.") else { return nil }
        let target = requestLine[1]
        let questionMark = target.firstIndex(of: "?")
        let path = String(target[..<(questionMark ?? target.endIndex)])
        let query = questionMark.map { ProxyRules.parseQuery(target[target.index(after: $0)...]) } ?? [:]
        var headers: [String: String] = [:]
        for line in lines.dropFirst() {
            guard let colon = line.firstIndex(of: ":") else { continue }
            let name = line[..<colon].trimmingCharacters(in: .whitespaces).lowercased()
            let value = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
            if headers[name] == nil { headers[name] = value }
        }
        return HTTPRequest(method: String(requestLine[0]).uppercased(), path: path, query: query, headers: headers)
    }
}

/// `pendingBytes` compte ce qui n'est pas encore parti ; `onDrain` dit quand relancer l'amont.
public final class HTTPResponseWriter: @unchecked Sendable {
    private static let lowWatermark = 512 * 1024

    private let connection: NWConnection
    private let queue: DispatchQueue
    public internal(set) var isHead = false
    public private(set) var headSent = false
    public private(set) var isClosed = false
    public private(set) var pendingBytes = 0

    /// Une fois, si le client s'en va avant la fin.
    public var onClientClose: (() -> Void)?
    public var onDrain: (() -> Void)?

    init(connection: NWConnection, queue: DispatchQueue) {
        self.connection = connection
        self.queue = queue
    }

    public static let corsHeaders: [(String, String)] = [
        ("Access-Control-Allow-Origin", "*"),
        ("Access-Control-Allow-Methods", "GET, OPTIONS"),
        ("Access-Control-Allow-Headers", "Range, Content-Type"),
    ]

    public func writeHead(status: Int, headers: [(String, String)]) {
        guard !headSent, !isClosed else { return }
        headSent = true
        var head = "HTTP/1.1 \(status) \(Self.reason(status))\r\n"
        for (name, value) in headers + Self.corsHeaders + [("Connection", "close")] {
            head += "\(name): \(Self.sanitize(value))\r\n"
        }
        head += "\r\n"
        send(Data(head.utf8), completion: nil)
    }

    /// `completion` part quand le morceau a quitté le processus.
    public func write(_ data: Data, completion: (() -> Void)? = nil) {
        guard !isClosed, !data.isEmpty else {
            completion?()
            return
        }
        if isHead {
            completion?()
            return
        }
        send(data, completion: completion)
    }

    public func finish() {
        guard !isClosed else { return }
        isClosed = true
        onDrain = nil
        onClientClose = nil
        let connection = connection
        connection.send(content: nil, contentContext: .finalMessage, isComplete: true, completion: .contentProcessed { _ in
            connection.cancel()
        })
    }

    public func respond(status: Int, contentType: String = "text/plain; charset=utf-8", body: String) {
        let data = Data(body.utf8)
        writeHead(status: status, headers: [("Content-Type", contentType), ("Content-Length", "\(data.count)")])
        write(data)
        finish()
    }

    func clientDidClose() {
        guard !isClosed else { return }
        isClosed = true
        let callback = onClientClose
        onClientClose = nil
        onDrain = nil
        callback?()
        connection.cancel()
    }

    private func send(_ data: Data, completion: (() -> Void)?) {
        pendingBytes += data.count
        connection.send(content: data, completion: .contentProcessed { [weak self] _ in
            guard let self else { return }
            self.pendingBytes -= data.count
            completion?()
            if self.pendingBytes < Self.lowWatermark, let drain = self.onDrain {
                self.onDrain = nil
                drain()
            }
        })
    }

    private static func sanitize(_ value: String) -> String {
        value.replacingOccurrences(of: "\r", with: "").replacingOccurrences(of: "\n", with: "")
    }

    static func reason(_ status: Int) -> String {
        switch status {
        case 200: return "OK"
        case 204: return "No Content"
        case 206: return "Partial Content"
        case 301: return "Moved Permanently"
        case 302: return "Found"
        case 304: return "Not Modified"
        case 400: return "Bad Request"
        case 403: return "Forbidden"
        case 404: return "Not Found"
        case 416: return "Range Not Satisfiable"
        case 431: return "Request Header Fields Too Large"
        case 500: return "Internal Server Error"
        case 502: return "Bad Gateway"
        case 504: return "Gateway Timeout"
        default: return HTTPURLResponse.localizedString(forStatusCode: status).capitalized
        }
    }
}
