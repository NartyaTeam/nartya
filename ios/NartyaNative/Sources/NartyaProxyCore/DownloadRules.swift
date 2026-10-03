import Foundation

/// Aucune E/S réseau. Même format de stockage que Downloads.java : `/local` et l'interface lisent
/// les deux plateformes de la même façon.
public enum DownloadRules {

    // MARK: Fichiers

    public static func isCompleteFragment(_ url: URL) -> Bool {
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory), !isDirectory.boolValue else {
            return false
        }
        return fileSize(url) > 0
    }

    public static func fileSize(_ url: URL) -> Int64 {
        ((try? FileManager.default.attributesOfItem(atPath: url.path)[.size]) as? NSNumber)?.int64Value ?? 0
    }

    /// nil si l'épisode n'est pas terminé.
    public static func completedFileName(in dir: URL) -> String? {
        if isCompleteFragment(dir.appendingPathComponent("video.mp4")) { return "video.mp4" }
        if isCompleteFragment(dir.appendingPathComponent("playlist.m3u8")) { return "playlist.m3u8" }
        return nil
    }

    public static func scanPageName(_ page: Int) -> String {
        String(format: "p%03d.jpg", page)
    }

    public static func isScanChapterComplete(_ dir: URL, pages: Int) -> Bool {
        guard pages > 0 else { return false }
        return (1...pages).allSatisfy { isCompleteFragment(dir.appendingPathComponent(scanPageName($0))) }
    }

    // MARK: HTTP

    private static let rangeTotal = try! NSRegularExpression(pattern: #"/(\d+)\s*$"#)

    /// D'après `Content-Range` (« bytes 0-1/12345 »).
    public static func totalFromContentRange(_ header: String?, offset: Int64, remaining: Int64) -> Int64 {
        if let header, let match = rangeTotal.firstMatch(in: header, range: NSRange(header.startIndex..., in: header)),
           let range = Range(match.range(at: 1), in: header), let total = Int64(header[range]) {
            return total
        }
        return remaining >= 0 ? offset + remaining : -1
    }

    /// Chaque morceau est un fichier conservé : une reprise ne retélécharge que les manquants.
    public static func chunkPlan(total: Int64, chunkBytes: Int64) -> [ClosedRange<Int64>] {
        guard total > 0, chunkBytes > 0 else { return [] }
        var ranges: [ClosedRange<Int64>] = []
        var start: Int64 = 0
        while start < total {
            let end = min(start + chunkBytes, total) - 1
            ranges.append(start...end)
            start = end + 1
        }
        return ranges
    }

    public static func isHls(_ url: String) -> Bool {
        url.range(of: #"\.m3u8(\?.*)?$"#, options: [.regularExpression, .caseInsensitive]) != nil
    }

    // MARK: Playlists HLS

    public static func segmentExtension(_ uri: String) -> String {
        let path = (uri.split(separator: "?", maxSplits: 1).first.map(String.init) ?? uri).lowercased()
        for ext in [".m4s", ".mp4", ".aac"] where path.hasSuffix(ext) { return ext }
        return ".ts"
    }

    private static func lines(_ text: String) -> [String] {
        text.components(separatedBy: "\n").map { $0.hasSuffix("\r") ? String($0.dropLast()) : $0 }
    }

    private static func firstMatch(_ pattern: String, in line: String, options: NSRegularExpression.Options = []) -> String? {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: options),
              let match = regex.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)),
              let range = Range(match.range(at: 1), in: line) else { return nil }
        return String(line[range])
    }

    /// `maxHeight` ≤ 0 = plus haut débit ; sinon le plus haut sous le plafond, à défaut la plus
    /// basse résolution connue.
    public static func pickBestVariant(_ master: String, base: URL, maxHeight: Int) -> URL? {
        let all = lines(master)
        var variants: [(bandwidth: Int, height: Int, url: URL)] = []
        for (index, line) in all.enumerated() where line.hasPrefix("#EXT-X-STREAM-INF") {
            let bandwidth = firstMatch(#"BANDWIDTH=(\d+)"#, in: line).flatMap(Int.init) ?? 0
            let height = firstMatch(#"RESOLUTION=\d+x(\d+)"#, in: line, options: .caseInsensitive).flatMap(Int.init) ?? 0
            var next = index + 1
            while next < all.count, all[next].trimmingCharacters(in: .whitespaces).isEmpty || all[next].hasPrefix("#") { next += 1 }
            if next < all.count, let url = ProxyRules.resolve(all[next].trimmingCharacters(in: .whitespaces), against: base) {
                variants.append((bandwidth, height, url))
            }
        }
        guard !variants.isEmpty else { return nil }
        if maxHeight <= 0 {
            return variants.max { $0.bandwidth < $1.bandwidth }?.url
        }
        let capped = variants.filter { $0.height > 0 && $0.height <= maxHeight }
        if let best = capped.max(by: { $0.bandwidth < $1.bandwidth }) { return best.url }
        let known = variants.filter { $0.height > 0 }
        return (known.min { $0.height < $1.height } ?? variants[0]).url
    }

    public struct LocalPlaylist {
        public var lines: [String]
        public var segments: [(url: URL, name: String)]
        public var keyURL: URL?
        public var mapURL: URL?
        public var text: String { lines.joined(separator: "\n") }
    }

    private static let uriAttribute = try! NSRegularExpression(pattern: #"URI="[^"]+""#)

    private static func replacingURI(_ line: String, with name: String) -> String {
        uriAttribute.stringByReplacingMatches(
            in: line, range: NSRange(line.startIndex..., in: line), withTemplate: "URI=\"\(name)\"")
    }

    /// segNNNNN.ext, key.bin, init.mp4 : mêmes noms qu'Android.
    public static func localizePlaylist(_ text: String, base: URL) -> LocalPlaylist {
        var result = LocalPlaylist(lines: [], segments: [], keyURL: nil, mapURL: nil)
        for raw in lines(text) {
            let line = raw.trimmingCharacters(in: .whitespaces)
            if line.hasPrefix("#EXT-X-KEY") {
                if let uri = firstMatch(#"URI="([^"]+)""#, in: line), !line.contains("METHOD=NONE"),
                   let url = ProxyRules.resolve(uri, against: base) {
                    result.keyURL = url
                    result.lines.append(replacingURI(raw, with: "key.bin"))
                } else {
                    result.lines.append(raw)
                }
                continue
            }
            if line.hasPrefix("#EXT-X-MAP") {
                if let uri = firstMatch(#"URI="([^"]+)""#, in: line), let url = ProxyRules.resolve(uri, against: base) {
                    result.mapURL = url
                    result.lines.append(replacingURI(raw, with: "init.mp4"))
                } else {
                    result.lines.append(raw)
                }
                continue
            }
            if line.isEmpty || line.hasPrefix("#") {
                result.lines.append(raw)
                continue
            }
            guard let url = ProxyRules.resolve(line, against: base) else { continue }
            let name = String(format: "seg%05d", result.segments.count) + segmentExtension(line)
            result.segments.append((url, name))
            result.lines.append(name)
        }
        return result
    }

    /// Comme URLEncoder Java, espaces en %20 (URL de pages de scan).
    public static func pathEncode(_ value: String) -> String {
        ProxyRules.formEncode(value).replacingOccurrences(of: "+", with: "%20")
    }
}
