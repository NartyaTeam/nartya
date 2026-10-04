import Capacitor
import UIKit

/// Enregistre les plugins natifs (équivalent des `registerPlugin` de MainActivity.java) et porte
/// l'orientation de l'app.
class MainViewController: CAPBridgeViewController {
    /// Comme l'Activity Android : seul le lecteur quitte le portrait.
    private var orientationMask: UIInterfaceOrientationMask = .portrait
    /// Bords protégés des balayages involontaires. Barre d'état et barre d'accueil sont masquées
    /// par SystemBars (appelé par capacitor.js).
    private var immersive = false

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(NartyaProxyPlugin())
        bridge?.registerPluginInstance(NartyaScreenPlugin())
        bridge?.registerPluginInstance(NartyaPlayerPlugin())
        bridge?.registerPluginInstance(NartyaSharePlugin())
    }

    override open var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        orientationMask
    }

    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge {
        immersive ? .all : []
    }

    /// La rotation est demandée tout de suite, sans attendre que l'utilisateur tourne le téléphone.
    func applyOrientation(_ mask: UIInterfaceOrientationMask, immersive: Bool) {
        orientationMask = mask
        self.immersive = immersive
        setNeedsUpdateOfScreenEdgesDeferringSystemGestures()
        if #available(iOS 16.0, *) {
            setNeedsUpdateOfSupportedInterfaceOrientations()
            view.window?.windowScene?.requestGeometryUpdate(.iOS(interfaceOrientations: mask)) { _ in }
        } else {
            // Sens libre : rien à forcer, le capteur décide.
            if mask != .allButUpsideDown {
                let target: UIInterfaceOrientation = mask.contains(.portrait) ? .portrait : .landscapeRight
                UIDevice.current.setValue(target.rawValue, forKey: "orientation")
            }
            UIViewController.attemptRotationToDeviceOrientation()
        }
    }
}
