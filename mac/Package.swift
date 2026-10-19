// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "TempoMac",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(name: "TempoMac", path: "Sources/TempoMac")
    ]
)
