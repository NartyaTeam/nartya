import AVFoundation
import Capacitor
import MediaPlayer
import UIKit

/// Même surface JS que PlayerPlugin.java.
/// - Luminosité : iOS n'a qu'une luminosité globale. La valeur d'origine est rendue dès que le
/// lecteur se ferme ou que l'app quitte le premier plan, sinon l'écran resterait assombri partout.
/// - Volume : volume multimédia du téléphone, sur ses 16 crans.
/// - Boutons volume : pendant la capture, un MPVolumeView masque la bulle système et chaque
/// changement part au HUD (événement `volume`).
@objc(NartyaPlayerPlugin)
public class NartyaPlayerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NartyaPlayerPlugin"
    public let jsName = "NartyaPlayer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setBrightness", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getVolume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setVolume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setVolumeCapture", returnType: CAPPluginReturnPromise),
    ]

    /// Le HUD raisonne en crans, comme Android.
    private static let volumeSteps = 16

    /// nil = rien à rendre.
    private var originalBrightness: CGFloat?
    /// Réappliquée au retour au premier plan.
    private var requestedBrightness: CGFloat?
    private var volumeView: MPVolumeView?
    private var volumeObservation: NSKeyValueObservation?
    private var volumeNotificationTokens: [NSObjectProtocol] = []
    /// KVO, notification système et geste peuvent signaler le même changement : relayé une fois.
    private var lastEmittedStep: Int?

    override public func load() {
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(appWillResignActive),
                           name: UIApplication.willResignActiveNotification, object: nil)
        center.addObserver(self, selector: #selector(appDidBecomeActive),
                           name: UIApplication.didBecomeActiveNotification, object: nil)
        center.addObserver(self, selector: #selector(appWillResignActive),
                           name: UIApplication.willTerminateNotification, object: nil)
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: Luminosité

    /// 0..1, ou -1 pour rendre la main au système (sortie du lecteur).
    @objc func setBrightness(_ call: CAPPluginCall) {
        let value = call.getFloat("value") ?? -1
        DispatchQueue.main.async {
            if value < 0 {
                self.requestedBrightness = nil
                self.restoreBrightness()
            } else {
                if self.originalBrightness == nil { self.originalBrightness = self.screen?.brightness }
                let clamped = CGFloat(max(0.01, min(1, value)))
                self.requestedBrightness = clamped
                self.screen?.brightness = clamped
            }
            call.resolve()
        }
    }

    private var screen: UIScreen? {
        (bridge?.viewController?.view.window?.windowScene ?? UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }.first)?.screen
    }

    private func restoreBrightness() {
        guard let original = originalBrightness else { return }
        screen?.brightness = original
        originalBrightness = nil
    }

    @objc private func appWillResignActive() {
        // Avant que l'utilisateur ne voie son écran d'accueil.
        let requested = requestedBrightness
        restoreBrightness()
        requestedBrightness = requested
    }

    @objc private func appDidBecomeActive() {
        guard let requested = requestedBrightness else { return }
        if originalBrightness == nil { originalBrightness = screen?.brightness }
        screen?.brightness = requested
    }

    // MARK: Volume

    @objc func getVolume(_ call: CAPPluginCall) {
        let volume = AVAudioSession.sharedInstance().outputVolume
        call.resolve(["value": Int((volume * Float(Self.volumeSteps)).rounded()), "max": Self.volumeSteps])
    }

    /// iOS n'offre pas d'API directe : le curseur d'un MPVolumeView est la voie documentée.
    @objc func setVolume(_ call: CAPPluginCall) {
        let ratio = max(0, min(1, call.getFloat("value") ?? 0))
        DispatchQueue.main.async {
            let view = self.ensureVolumeView()
            if let slider = view.subviews.compactMap({ $0 as? UISlider }).first {
                slider.value = ratio
                slider.sendActions(for: .valueChanged)
            }
            self.emitVolume(ratio)
            call.resolve()
        }
    }

    /// Capture active = lecteur ouvert.
    @objc func setVolumeCapture(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        DispatchQueue.main.async {
            if enabled {
                self.startCapture()
            } else {
                self.stopCapture()
            }
            call.resolve()
        }
    }

    private func startCapture() {
        // Sans cette garde, chaque appel empilait un observateur (chaque appui relayé deux fois).
        guard volumeObservation == nil else { return }
        _ = ensureVolumeView()
        let session = AVAudioSession.sharedInstance()
        // `.playback` : le son de l'épisode ignore le bouton silencieux.
        do {
            try session.setCategory(.playback, mode: .moviePlayback)
            try session.setActive(true)
        } catch {
            NSLog("%@", "[NartyaPlayer] session audio : \(error.localizedDescription)")
        }
        lastEmittedStep = nil
        // KVO sur outputVolume ne se déclenche jamais pendant qu'une WKWebView lit une vidéo (mesuré
        // sous iOS 26) : WebKit gère la session audio de son côté.
        volumeObservation = session.observe(\.outputVolume, options: [.new]) { [weak self] _, change in
            guard let value = change.newValue else { return }
            DispatchQueue.main.async { self?.emitVolume(value) }
        }
        // Voie fiable : « SystemVolumeDidChange » (AVSystemController avant iOS 15), diffusée seulement
        // si un MPVolumeView existe, ce qui est le cas pendant la capture.
        let names = ["SystemVolumeDidChange", "AVSystemController_SystemVolumeDidChangeNotification"]
        volumeNotificationTokens = names.map { name in
            NotificationCenter.default.addObserver(forName: Notification.Name(name), object: nil, queue: .main) { [weak self] note in
                let info = note.userInfo ?? [:]
                let raw = info["Volume"] ?? info["AVSystemController_AudioVolumeNotificationParameter"]
                guard let volume = (raw as? NSNumber)?.floatValue else { return }
                self?.emitVolume(volume)
            }
        }
    }

    private func stopCapture() {
        volumeObservation?.invalidate()
        volumeObservation = nil
        volumeNotificationTokens.forEach(NotificationCenter.default.removeObserver)
        volumeNotificationTokens = []
        volumeView?.removeFromSuperview()
        volumeView = nil
    }

    /// Seul un MPVolumeView affiché remplace la bulle système : hors écran ou à 1 % d'opacité, iOS
    /// le tient pour invisible. Il reste opaque, 1 × 1 point dans un coin, derrière la WebView.
    /// Son curseur règle aussi le volume, et sa présence déclenche SystemVolumeDidChange.
    private func ensureVolumeView() -> MPVolumeView {
        if let view = volumeView { return view }
        let view = MPVolumeView(frame: CGRect(x: 0, y: 0, width: 1, height: 1))
        view.clipsToBounds = true
        view.isUserInteractionEnabled = false
        bridge?.viewController?.view.insertSubview(view, at: 0)
        volumeView = view
        return view
    }

    private func emitVolume(_ ratio: Float) {
        let step = Int((max(0, min(1, ratio)) * Float(Self.volumeSteps)).rounded())
        guard step != lastEmittedStep else { return }
        lastEmittedStep = step
        notifyListeners("volume", data: ["value": step, "max": Self.volumeSteps])
    }
}
