import Capacitor
import NartyaProxyCore
import UIKit

/// Même surface JS que NartyaProxyPlugin.java.
/// Au retour au premier plan, le serveur est éprouvé puis relancé au besoin (voir docs/MOBILE.md).
/// En arrière-plan, iOS accorde une trentaine de secondes : les téléchargements continuent, puis
/// sont figés en « interrupted » (fragments conservés) et relancés au retour dans l'app.
@objc(NartyaProxyPlugin)
public class NartyaProxyPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NartyaProxyPlugin"
    public let jsName = "NartyaProxy"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "downloadStart", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "downloadCancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "downloadRemove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "downloadList", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestDownloadPermission", returnType: CAPPluginReturnPromise),
    ]

    private static let downloadsRoot: URL = {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        var root = support.appendingPathComponent("downloads", isDirectory: true)
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        // Des vidéos téléchargées n'ont rien à faire dans la sauvegarde iCloud.
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? root.setResourceValues(values)
        return root
    }()

    /// Un seul moteur pour la vie du processus : le jeton reste stable entre relances.
    private static let engine = ProxyEngine(downloadsRoot: downloadsRoot)

    /// Pour relayer la progression émise hors du plugin.
    private static weak var activePlugin: NartyaProxyPlugin?

    private static let downloads = DownloadManager(
        root: downloadsRoot,
        proxy: { engine.port.map { ($0, engine.token) } },
        onProgress: { item in
            activePlugin?.notifyListeners("downloadProgress", data: item)
            DispatchQueue.main.async { activePlugin?.endBackgroundTimeIfIdle() }
        })

    private var started = false
    private var backgroundTask: UIBackgroundTaskIdentifier = .invalid

    override public func load() {
        Self.activePlugin = self
        Self.engine.onRestart = { port, portChanged in
            Self.activePlugin?.notifyRestart(port: port, portChanged: portChanged, cause: "auto")
        }
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(appDidBecomeActive),
                           name: UIApplication.didBecomeActiveNotification, object: nil)
        center.addObserver(self, selector: #selector(appDidEnterBackground),
                           name: UIApplication.didEnterBackgroundNotification, object: nil)
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc private func appDidBecomeActive() {
        endBackgroundTime()
        guard started else { return }
        Task {
            do {
                let result = try await Self.engine.ensureRunning(verify: true)
                if result.restarted {
                    notifyRestart(port: result.port, portChanged: result.portChanged, cause: "foreground")
                }
            } catch {
                CAPLog.print("[NartyaProxy] relance impossible : \(error.localizedDescription)")
            }
        }
    }

    /// Toute relance, pour que le JS l'adopte et la journalise. `cause` : `auto` (perte signalée
    /// par l'écouteur), `foreground` (retour dans l'app), `request` (requête du JS sans réponse).
    private func notifyRestart(port: UInt16, portChanged: Bool, cause: String) {
        notifyListeners("proxyRestarted", data: [
            "port": Int(port), "token": Self.engine.token, "portChanged": portChanged, "cause": cause,
        ])
    }

    /// Délai de grâce demandé, puis gel juste avant la suspension, sinon ils mourraient en « erreur ».
    @objc private func appDidEnterBackground() {
        guard Self.downloads.activeCount > 0, backgroundTask == .invalid else { return }
        backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "Nartya téléchargements") { [weak self] in
            Self.downloads.interruptAll()
            self?.endBackgroundTime()
        }
    }

    fileprivate func endBackgroundTimeIfIdle() {
        if Self.downloads.activeCount == 0 { endBackgroundTime() }
    }

    private func endBackgroundTime() {
        guard backgroundTask != .invalid else { return }
        UIApplication.shared.endBackgroundTask(backgroundTask)
        backgroundTask = .invalid
    }

    /// Aussi appelé par le JS quand le proxy ne répond plus : sans `configs`, la recette en place
    /// est gardée.
    @objc func start(_ call: CAPPluginCall) {
        if let configs = call.options["configs"] as? [String: Any] {
            Self.engine.updateConfig(ProxyConfig(json: configs))
        }
        Task {
            do {
                let result = try await Self.engine.ensureRunning(verify: true)
                if started, result.restarted {
                    notifyRestart(port: result.port, portChanged: result.portChanged, cause: "request")
                }
                started = true
                call.resolve(["port": Int(result.port), "token": Self.engine.token])
            } catch {
                call.reject("Échec démarrage proxy: \(error.localizedDescription)")
            }
        }
    }

    /// Chargée après authentification.
    @objc func configure(_ call: CAPPluginCall) {
        let configs = call.options["configs"] as? [String: Any] ?? [:]
        Self.engine.updateConfig(ProxyConfig(json: configs))
        call.resolve(["success": true])
    }

    @objc func stop(_ call: CAPPluginCall) {
        if Self.downloads.activeCount > 0 {
            call.resolve(["success": false, "error": "Le proxy reste actif pendant les téléchargements"])
            return
        }
        Self.engine.stop()
        started = false
        call.resolve(["success": true])
    }

    // MARK: Téléchargements hors ligne

    @objc func downloadStart(_ call: CAPPluginCall) {
        let payload = call.options as? [String: Any] ?? [:]
        Task {
            // Un chapitre de scan peut démarrer sans lecture préalable : le proxy doit tourner.
            if (try? await Self.engine.start()) != nil { started = true }
            if Self.downloads.start(payload) {
                call.resolve(["success": true])
            } else {
                call.resolve(["success": false, "error": "Téléchargement invalide ou déjà actif"])
            }
        }
    }

    @objc func downloadCancel(_ call: CAPPluginCall) {
        Self.downloads.cancel(call.getString("id") ?? "")
        call.resolve(["success": true])
    }

    @objc func downloadRemove(_ call: CAPPluginCall) {
        Self.downloads.remove(call.getString("id") ?? "")
        call.resolve(["success": true])
    }

    @objc func downloadList(_ call: CAPPluginCall) {
        call.resolve(["items": Self.downloads.list()])
    }

    /// Pas de notification de téléchargement sur iOS.
    @objc func requestDownloadPermission(_ call: CAPPluginCall) {
        call.resolve(["granted": true])
    }
}
