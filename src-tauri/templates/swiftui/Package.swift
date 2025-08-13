// swift-tools-version: 6.1

import PackageDescription

let package = Package(
    name: "{{projectName}}",
    platforms: [.iOS(.v15)],
    targets: [
        .executableTarget(
            name: "{{projectName}}",
            path: "Sources"
        ),
    ]
)
