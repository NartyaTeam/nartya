import Capacitor
import UIKit

/// Même surface JS que ScreenPlugin.java. `screen.orientation.lock()` n'a aucun effet dans une
/// WKWebView : l'orientation se pilote depuis le contrôleur natif. `auto` rend la main au capteur.
@objc(NartyaScreenPlugin)
public class NartyaScreenPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NartyaScreenPlugin"
    public let jsName = "NartyaScreen"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setOrientation", returnType: CAPPluginReturnPromise),
    ]

    @objc func setOrientation(_ call: CAPPluginCall) {
        let orientation = call.getString("orientation") ?? "auto"
        DispatchQueue.main.async { [weak self] in
            guard let controller = self?.bridge?.viewController as? MainViewController else {
                call.reject("Contrôleur principal introuvable")
                return
            }
            switch orientation {
            case "landscape":
                // Les deux sens paysage, comme SENSOR_LANDSCAPE sur Android.
                controller.applyOrientation(.landscape, immersive: true)
            case "portrait":
                controller.applyOrientation(.portrait, immersive: false)
            default:
                controller.applyOrientation(.allButUpsideDown, immersive: false)
            }
            call.resolve()
        }
    }
}
