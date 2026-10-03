import Foundation

/// Appliqué avant chaque requête amont et à chaque redirection. Android filtre dans le résolveur
/// d'OkHttp ; URLSession n'a pas ce point d'accroche, d'où une résolution préalable. Le risque de
/// rebinding DNS entre les deux est accepté : le proxy n'écoute qu'en loopback et exige un jeton.
public struct AddressPolicy: Sendable {
    private let hostFilter: @Sendable (String) -> Bool

    /// Toute adresse privée ou réservée est refusée.
    public static let strict = AddressPolicy { host in
        guard let addresses = AddressPolicy.resolve(host), !addresses.isEmpty else { return false }
        return !addresses.contains(where: ProxyRules.isForbiddenAddress)
    }

    /// Pour les tests : le serveur amont de test tourne en loopback.
    public init(allowsHost: @escaping @Sendable (String) -> Bool) {
        hostFilter = allowsHost
    }

    /// Bloquant (DNS) : hors de la file du serveur.
    public func allows(host: String) -> Bool {
        hostFilter(host)
    }

    static func resolve(_ host: String) -> [[UInt8]]? {
        var hints = addrinfo()
        hints.ai_family = AF_UNSPEC
        hints.ai_socktype = SOCK_STREAM
        var result: UnsafeMutablePointer<addrinfo>?
        guard getaddrinfo(host, nil, &hints, &result) == 0, let first = result else { return nil }
        defer { freeaddrinfo(first) }

        var addresses: [[UInt8]] = []
        var cursor: UnsafeMutablePointer<addrinfo>? = first
        while let info = cursor {
            if let address = info.pointee.ai_addr {
                switch Int32(address.pointee.sa_family) {
                case AF_INET:
                    address.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { pointer in
                        var raw = pointer.pointee.sin_addr
                        addresses.append(withUnsafeBytes(of: &raw) { Array($0) })
                    }
                case AF_INET6:
                    address.withMemoryRebound(to: sockaddr_in6.self, capacity: 1) { pointer in
                        var raw = pointer.pointee.sin6_addr
                        addresses.append(withUnsafeBytes(of: &raw) { Array($0) })
                    }
                default:
                    // Famille inconnue : refusée.
                    addresses.append([])
                }
            }
            cursor = info.pointee.ai_next
        }
        return addresses
    }
}
