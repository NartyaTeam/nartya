// swift-tools-version: 5.9
import PackageDescription

// Sans Capacitor ni UIKit : se compile et se teste sur le Mac (`swift test`).
let package = Package(
    name: "NartyaNative",
    platforms: [.iOS(.v15), .macOS(.v13)],
    products: [
        .library(name: "NartyaProxyCore", targets: ["NartyaProxyCore"])
    ],
    targets: [
        .target(name: "NartyaProxyCore"),
        .testTarget(name: "NartyaProxyCoreTests", dependencies: ["NartyaProxyCore"])
    ]
)
