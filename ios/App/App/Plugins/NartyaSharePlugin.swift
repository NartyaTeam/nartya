import Capacitor
import UIKit

/// Même surface JS que SharePlugin.java. Un lien universel (discord.gg…) ouvre directement l'app
/// concernée, là où la vue Safari intégrée resterait dans Nartya.
@objc(NartyaSharePlugin)
public class NartyaSharePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NartyaSharePlugin"
    public let jsName = "NartyaShare"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "openUrl", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise),
    ]

    @objc func openUrl(_ call: CAPPluginCall) {
        guard let value = call.getString("url"), let url = URL(string: value),
              let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http" else {
            // Jamais de schéma arbitraire venu d'une annonce ou d'une API.
            call.reject("Seuls les liens web sont autorisés")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url) { opened in
                if opened { call.resolve() } else { call.reject("Aucun navigateur disponible") }
            }
        }
    }

    @objc func share(_ call: CAPPluginCall) {
        let text = call.getString("text") ?? ""
        let link = call.getString("url").flatMap(URL.init(string:))
        var items: [Any] = []
        if !text.isEmpty { items.append(text) }
        if let link { items.append(link) }
        guard !items.isEmpty else {
            call.reject("Rien à partager")
            return
        }
        DispatchQueue.main.async {
            guard let controller = self.bridge?.viewController else {
                call.reject("Contrôleur principal introuvable")
                return
            }
            let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
            if let subject = call.getString("title"), !subject.isEmpty {
                sheet.setValue(subject, forKey: "subject")
            }
            // iPad : la feuille est un popover, elle exige une ancre sous peine de plantage.
            if let popover = sheet.popoverPresentationController {
                popover.sourceView = controller.view
                popover.sourceRect = CGRect(x: controller.view.bounds.midX, y: controller.view.bounds.midY, width: 0, height: 0)
                popover.permittedArrowDirections = []
            }
            controller.present(sheet, animated: true)
            call.resolve()
        }
    }
}
