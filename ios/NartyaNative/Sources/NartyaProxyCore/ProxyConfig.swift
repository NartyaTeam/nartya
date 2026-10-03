import Foundation

/// Même forme que sur Android : `{ providerConfigs: { <clé>: {...} }, defaultConfig: {...} }`.
/// Aucune table d'hébergeurs ici : elle arrive avec la recette authentifiée.
public struct ProxyConfig: Sendable {
    public struct Source: Sendable {
        public var headers: [String: String] = [:]
        public var domains: [String] = []
        public var canonicalHost: String?
        public var hostMatch: String?
        public var dropRefererOffHost = false
        public var mp4RefererPattern: String?
        public var mp4RefererTemplate: String?
    }

    /// Triées : la détection par domaine doit être déterministe.
    public private(set) var sourceKeys: [String] = []
    public private(set) var sources: [String: Source] = [:]
    public private(set) var defaultHeaders: [String: String] = [:]

    public static let empty = ProxyConfig()

    public init() {}

    public init(json: [String: Any]) {
        if let providers = json["providerConfigs"] as? [String: Any] {
            for (key, value) in providers {
                guard let raw = value as? [String: Any] else { continue }
                var source = Source()
                source.headers = Self.stringMap(raw["headers"])
                source.domains = (raw["domains"] as? [Any] ?? []).compactMap { $0 as? String }
                source.canonicalHost = Self.nonEmpty(raw["canonicalHost"])
                source.hostMatch = Self.nonEmpty(raw["hostMatch"])
                source.dropRefererOffHost = raw["dropRefererOffHost"] as? Bool ?? false
                if let rule = raw["mp4Referer"] as? [String: Any] {
                    source.mp4RefererPattern = Self.nonEmpty(rule["pattern"])
                    source.mp4RefererTemplate = Self.nonEmpty(rule["template"])
                }
                sources[key] = source
            }
            sourceKeys = sources.keys.sorted()
        }
        if let fallback = json["defaultConfig"] as? [String: Any] {
            defaultHeaders = Self.stringMap(fallback["headers"])
        }
    }

    public func source(_ key: String?) -> Source? {
        guard let key else { return nil }
        return sources[key]
    }

    /// Pilotée par les domaines de la recette.
    public func detectProvider(host: String?) -> String? {
        guard let host = host?.lowercased(), !host.isEmpty else { return nil }
        for key in sourceKeys {
            for domain in sources[key]?.domains ?? [] {
                let allowed = domain.lowercased()
                if !allowed.isEmpty && (host == allowed || host.hasSuffix("." + allowed)) {
                    return key
                }
            }
        }
        return nil
    }

    private static func stringMap(_ value: Any?) -> [String: String] {
        guard let map = value as? [String: Any] else { return [:] }
        var out: [String: String] = [:]
        for (key, value) in map {
            if let string = value as? String { out[key] = string }
            else if let number = value as? NSNumber { out[key] = number.stringValue }
        }
        return out
    }

    private static func nonEmpty(_ value: Any?) -> String? {
        guard let string = value as? String, !string.isEmpty else { return nil }
        return string
    }
}
