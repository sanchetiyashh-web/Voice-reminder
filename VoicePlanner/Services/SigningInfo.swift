import Foundation

/// Reads when this install's signature expires (free Apple ID = 7 days) from the
/// provisioning profile that Sideloadly / SideStore / AltStore / Xcode embed in the app.
enum SigningInfo {
    static func expirationDate() -> Date? {
        guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
              let data = try? Data(contentsOf: url),
              let text = String(data: data, encoding: .isoLatin1),      // the profile is CMS-signed; the plist inside is plain XML
              let start = text.range(of: "<?xml"),
              let end = text.range(of: "</plist>") else { return nil }
        let xml = String(text[start.lowerBound..<end.upperBound])
        guard let plist = try? PropertyListSerialization.propertyList(from: Data(xml.utf8), options: [], format: nil) as? [String: Any] else { return nil }
        return plist["ExpirationDate"] as? Date
    }

    static func remainingText(_ exp: Date) -> String {
        let hours = Int(exp.timeIntervalSinceNow / 3600)
        if hours < 0 { return "expired" }
        if hours < 48 { return "\(hours) h left" }
        return "\(hours / 24) days left"
    }
}
