import Foundation
import Security

/// Aucune E/S. Parité avec ProxyServer.java et, pour HLS, electron/utils/hls-playlist.js.
public enum ProxyRules {

    // MARK: Jeton

    /// Comme le proxy Android.
    public static func newToken() -> String {
        var bytes = [UInt8](repeating: 0, count: 24)
        if SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) != errSecSuccess {
            // Repli sur le générateur système plutôt qu'un jeton vide.
            var generator = SystemRandomNumberGenerator()
            bytes = bytes.map { _ in UInt8.random(in: 0...255, using: &generator) }
        }
        return bytes.map { String(format: "%02x", $0) }.joined()
    }

    /// Temps constant (parité MessageDigest.isEqual).
    public static func tokensEqual(_ given: String?, _ expected: String) -> Bool {
        guard let given else { return false }
        let a = Array(given.utf8), b = Array(expected.utf8)
        guard a.count == b.count else { return false }
        var diff: UInt8 = 0
        for index in a.indices { diff |= a[index] ^ b[index] }
        return diff == 0
    }

    // MARK: Plages d'octets

    /// nil = syntaxe ou bornes non servables.
    public static func parseByteRange(_ header: String?, size: Int64) -> ClosedRange<Int64>? {
        guard let header, size > 0 else { return nil }
        let trimmed = header.trimmingCharacters(in: .whitespaces)
        guard trimmed.hasPrefix("bytes=") else { return nil }
        let spec = trimmed.dropFirst("bytes=".count)
        let parts = spec.split(separator: "-", maxSplits: 1, omittingEmptySubsequences: false)
        guard parts.count == 2,
              parts[0].allSatisfy(\.isASCIIDigit), parts[1].allSatisfy(\.isASCIIDigit) else { return nil }
        let from = String(parts[0]), to = String(parts[1])
        if from.isEmpty && to.isEmpty { return nil }
        let start: Int64, end: Int64
        if from.isEmpty {
            guard let suffix = Int64(to), suffix > 0 else { return nil }
            start = max(0, size - suffix)
            end = size - 1
        } else {
            guard let parsedStart = Int64(from) else { return nil }
            start = parsedStart
            if to.isEmpty { end = size - 1 } else {
                guard let parsedEnd = Int64(to) else { return nil }
                end = parsedEnd
            }
        }
        guard start >= 0, start < size, end >= start else { return nil }
        return start...min(end, size - 1)
    }

    // MARK: Adresses interdites (anti-SSRF)

    /// Une IPv6 qui embarque une IPv4 (`::ffff:`, NAT64 `64:ff9b::`) est jugée sur l'IPv4 : sur un
    /// réseau NAT64, iOS synthétise ces adresses pour tout hôte IPv4.
    public static func isForbiddenAddress(_ raw: [UInt8]) -> Bool {
        if raw.count == 16 {
            let head10Zero = raw[0..<10].allSatisfy { $0 == 0 }
            if head10Zero && raw[10] == 0xff && raw[11] == 0xff {
                return isForbiddenAddress(Array(raw[12..<16]))
            }
            if raw[0] == 0x00 && raw[1] == 0x64 && raw[2] == 0xff && raw[3] == 0x9b &&
                raw[4..<12].allSatisfy({ $0 == 0 }) {
                return isForbiddenAddress(Array(raw[12..<16]))
            }
            if raw[0..<12].allSatisfy({ $0 == 0 }) { return true } // ::, ::1, IPv4-compatible
            if raw[0] == 0xff { return true }                       // multicast
            if raw[0] == 0xfe && (raw[1] & 0xc0) == 0x80 { return true } // fe80::/10
            if raw[0] == 0xfe && (raw[1] & 0xc0) == 0xc0 { return true } // fec0::/10
            return (raw[0] & 0xfe) == 0xfc                          // fc00::/7
        }
        guard raw.count == 4 else { return true }
        let a = raw[0], b = raw[1], c = raw[2]
        if a == 0 || a == 10 || a == 127 || a >= 224 { return true }
        if a == 169 && b == 254 { return true }
        if a == 172 && (16...31).contains(b) { return true }
        if a == 192 && b == 168 { return true }
        if a == 100 && (64...127).contains(b) { return true } // carrier-grade NAT
        if a == 192 && b == 0 && (c == 0 || c == 2) { return true }
        if a == 198 && (b == 18 || b == 19 || b == 51) { return true }
        return a == 203 && b == 0 && c == 113
    }

    // MARK: En-têtes amont

    /// Ordre de priorité d'Android : recette (ou défaut), `dropRefererOffHost`, `mp4Referer`, puis
    /// referer/origin de l'embed.
    public static func upstreamHeaders(
        url: URL, provider: String?, config: ProxyConfig, referer: String?, origin: String?
    ) -> [String: String] {
        var headers = HeaderBag()
        let source = config.source(provider)
        for (name, value) in source?.headers ?? config.defaultHeaders {
            // URLSession négocie et décode lui-même.
            if name.caseInsensitiveCompare("Accept-Encoding") == .orderedSame { continue }
            headers.set(name, value)
        }

        if let source, source.dropRefererOffHost {
            if let hostMatch = source.hostMatch, let host = url.host?.lowercased(),
               host.contains(hostMatch), let dynamicOrigin = originOf(url) {
                headers.set("Referer", dynamicOrigin + "/")
                headers.set("Origin", dynamicOrigin)
            } else {
                headers.remove("Referer")
                headers.remove("Origin")
            }
        }

        if let mediaReferer = mediaReferer(url: url.absoluteString, source: source) {
            headers.set("Referer", mediaReferer)
        }
        // Plus précises que la recette : elles gagnent.
        if let referer, !referer.isEmpty { headers.set("Referer", referer) }
        if let origin, !origin.isEmpty { headers.set("Origin", origin) }
        return headers.values
    }

    public static func canonicalize(_ url: URL, source: ProxyConfig.Source?) -> URL {
        guard let canonicalHost = source?.canonicalHost, let hostMatch = source?.hostMatch,
              let host = url.host, host.contains(hostMatch), !host.hasSuffix(canonicalHost),
              var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return url }
        components.host = canonicalHost
        return components.url ?? url
    }

    static func mediaReferer(url: String, source: ProxyConfig.Source?) -> String? {
        guard let pattern = source?.mp4RefererPattern, let template = source?.mp4RefererTemplate,
              let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
        let range = NSRange(url.startIndex..., in: url)
        guard let match = regex.firstMatch(in: url, range: range) else { return nil }
        var result = template
        for index in 0..<match.numberOfRanges {
            let groupRange = match.range(at: index)
            let value = groupRange.location == NSNotFound ? "" : (url as NSString).substring(with: groupRange)
            result = result.replacingOccurrences(of: "{\(index)}", with: value)
        }
        return result
    }

    public static func originOf(_ url: URL) -> String? {
        guard let scheme = url.scheme, let host = url.host else { return nil }
        if let port = url.port { return "\(scheme)://\(host):\(port)" }
        return "\(scheme)://\(host)"
    }

    // MARK: Playlists HLS

    /// Contre l'URL finale de la playlist, après redirections.
    public static func resolve(_ uri: String, against base: URL) -> URL? {
        guard let resolved = URL(string: uri, relativeTo: base)?.absoluteURL,
              let scheme = resolved.scheme?.lowercased(), scheme == "http" || scheme == "https"
        else { return nil }
        return resolved
    }

    /// Segments et attributs `URI="…"` (pistes, clés AES, init) repassent par le proxy.
    public static func rewritePlaylist(
        _ content: String, baseURL: URL, proxyBase: String, provider: String?,
        referer: String?, origin: String?, token: String
    ) -> String {
        let effectiveProvider = (provider?.isEmpty == false) ? provider! : "unknown"
        func proxify(_ uri: String) -> String {
            guard let absolute = resolve(uri, against: baseURL) else { return uri }
            var out = "\(proxyBase)?url=\(formEncode(absolute.absoluteString))&provider=\(formEncode(effectiveProvider))"
            if let referer, !referer.isEmpty { out += "&referer=\(formEncode(referer))" }
            if let origin, !origin.isEmpty { out += "&origin=\(formEncode(origin))" }
            return out + "&t=\(token)"
        }
        return mapLines(content) { line, trimmed in
            if trimmed.isEmpty { return line }
            if trimmed.hasPrefix("#") { return replaceURIAttributes(in: line, with: proxify) }
            return proxify(trimmed)
        }
    }

    /// Le port n'est connu qu'à l'exécution. Parité rewriteLocalPlaylist Android.
    public static func rewriteLocalPlaylist(_ content: String, id: String, port: UInt16, token: String) -> String {
        let base = "http://127.0.0.1:\(port)/local?id=\(formEncode(id))&path="
        let suffix = "&t=\(token)"
        return mapLines(content) { line, trimmed in
            if trimmed.isEmpty { return line }
            if trimmed.hasPrefix("#") {
                return replaceURIAttributes(in: line) { base + formEncode($0) + suffix }
            }
            return base + formEncode(trimmed) + suffix
        }
    }

    private static let uriAttribute = try! NSRegularExpression(pattern: #"URI="([^"]+)""#)

    private static func replaceURIAttributes(in line: String, with transform: (String) -> String) -> String {
        let nsLine = line as NSString
        let matches = uriAttribute.matches(in: line, range: NSRange(location: 0, length: nsLine.length))
        guard !matches.isEmpty else { return line }
        var result = ""
        var cursor = 0
        for match in matches {
            let whole = match.range, value = match.range(at: 1)
            result += nsLine.substring(with: NSRange(location: cursor, length: whole.location - cursor))
            result += "URI=\"\(transform(nsLine.substring(with: value)))\""
            cursor = whole.location + whole.length
        }
        return result + nsLine.substring(from: cursor)
    }

    /// Conserve exactement la structure, dont un `\r` final éventuel.
    private static func mapLines(_ content: String, _ transform: (String, String) -> String) -> String {
        content.components(separatedBy: "\n").map { line -> String in
            let hasCR = line.hasSuffix("\r")
            let body = hasCR ? String(line.dropLast()) : line
            let out = transform(body, body.trimmingCharacters(in: .whitespaces))
            return hasCR ? out + "\r" : out
        }.joined(separator: "\n")
    }

    // MARK: Encodage de requête

    private static let formAllowed: CharacterSet = {
        var set = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
        set.insert(charactersIn: ".-*_")
        return set
    }()

    /// Parité URLEncoder Java / URLSearchParams.
    public static func formEncode(_ value: String) -> String {
        (value.addingPercentEncoding(withAllowedCharacters: formAllowed) ?? value)
            .replacingOccurrences(of: "%20", with: "+")
    }

    public static func formDecode<S: StringProtocol>(_ value: S) -> String {
        let spaced = value.replacingOccurrences(of: "+", with: " ")
        return spaced.removingPercentEncoding ?? spaced
    }

    /// La première occurrence gagne (parité `first()` Android).
    public static func parseQuery<S: StringProtocol>(_ query: S) -> [String: String] {
        var out: [String: String] = [:]
        for pair in query.split(separator: "&") {
            let parts = pair.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
            let key = formDecode(parts[0])
            if out[key] == nil { out[key] = parts.count > 1 ? formDecode(parts[1]) : "" }
        }
        return out
    }
}

/// « referer » de la recette et « Referer » ne font qu'un.
struct HeaderBag {
    private(set) var values: [String: String] = [:]

    mutating func set(_ name: String, _ value: String) {
        remove(name)
        values[name] = value
    }

    mutating func remove(_ name: String) {
        for key in values.keys where key.caseInsensitiveCompare(name) == .orderedSame {
            values.removeValue(forKey: key)
        }
    }
}

private extension Character {
    var isASCIIDigit: Bool { isASCII && isNumber }
}
