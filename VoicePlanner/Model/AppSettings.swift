import Foundation

enum AlertDelivery: String, Codable, CaseIterable, Identifiable {
    case calendar, app
    var id: String { rawValue }
    var label: String { self == .calendar ? "Calendar alerts" : "App notifications" }
}

/// User preferences, stored in UserDefaults.
@MainActor
final class AppSettings: ObservableObject {
    private let d = UserDefaults.standard

    @Published var localeId: String { didSet { d.set(localeId, forKey: "localeId") } }
    /// Off by default: speech stays on the iPhone. Turning it on is the user's consent
    /// to let Apple's servers transcribe when on-device recognition isn't available.
    @Published var allowServerRecognition: Bool { didSet { d.set(allowServerRecognition, forKey: "allowServer") } }
    /// Seconds of silence before recording stops by itself (0 = only stop when I tap).
    @Published var autoStopSilenceSec: Int { didSet { d.set(autoStopSilenceSec, forKey: "autoStop") } }
    /// Keep the current recording in a temporary file until it is processed, so a failed
    /// transcription can be retried. Deleted right after a successful save.
    @Published var keepAudioUntilProcessed: Bool { didSet { d.set(keepAudioUntilProcessed, forKey: "keepAudio") } }
    @Published var defaultDurationMin: Int { didSet { d.set(defaultDurationMin, forKey: "duration") } }
    @Published var appointmentAlertsMin: [Int] { didSet { d.set(appointmentAlertsMin, forKey: "alerts") } }
    @Published var alertDelivery: AlertDelivery { didSet { d.set(alertDelivery.rawValue, forKey: "delivery") } }
    @Published var calendarId: String? { didSet { d.set(calendarId, forKey: "calendarId") } }
    @Published var readBack: Bool { didSet { d.set(readBack, forKey: "readBack") } }
    /// "coming" = "next Friday" means the first Friday after today; "following" = Friday of next week.
    @Published var nextWeekday: String { didSet { d.set(nextWeekday, forKey: "nextWeekday") } }

    init() {
        localeId = d.string(forKey: "localeId") ?? "en-IN"
        allowServerRecognition = d.object(forKey: "allowServer") as? Bool ?? false
        autoStopSilenceSec = d.object(forKey: "autoStop") as? Int ?? 8
        keepAudioUntilProcessed = d.object(forKey: "keepAudio") as? Bool ?? true
        defaultDurationMin = d.object(forKey: "duration") as? Int ?? 60
        appointmentAlertsMin = d.array(forKey: "alerts") as? [Int] ?? [1440, 240]
        alertDelivery = AlertDelivery(rawValue: d.string(forKey: "delivery") ?? "") ?? .calendar
        calendarId = d.string(forKey: "calendarId")
        readBack = d.object(forKey: "readBack") as? Bool ?? false
        nextWeekday = d.string(forKey: "nextWeekday") ?? "coming"
    }

    static let languages: [(id: String, name: String)] = [
        ("en-IN", "English (India)"), ("hi-IN", "Hindi (हिन्दी)"), ("mr-IN", "Marathi (मराठी)"), ("en-US", "English (US)"), ("en-GB", "English (UK)")
    ]
}
