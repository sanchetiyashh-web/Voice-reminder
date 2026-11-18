import SwiftUI
import UserNotifications

@MainActor
final class AppModel: ObservableObject {
    static let shared = AppModel()

    let settings = AppSettings()
    let store = ItemStore()
    let calendar = CalendarService()
    let notifications = NotificationService()
    let engine = UnderstandingEngine()
    let speaker = Speaker()
    let whisper = WhisperService()
    lazy var executor = Executor(store: store, settings: settings, calendar: calendar, notifications: notifications, engine: engine)

    /// Set by the "Start listening" Siri/Shortcuts intent; the UI opens the recorder.
    @Published var pendingStartListening = false

    /// Words that help the recognizer (names and titles you already use).
    func contextualStrings() -> [String] {
        var words = Set<String>()
        for it in store.items.prefix(200) {
            for w in it.title.split(separator: " ") where w.count > 2 && w.first?.isUppercase == true { words.insert(String(w)) }
        }
        return ["appointment", "remind me", "day after tomorrow", "next Monday", "reschedule"] + Array(words)
    }
}

@main
struct VoicePlannerApp: App {
    @StateObject private var model = AppModel.shared
    @Environment(\.scenePhase) private var phase

    init() {
        UNUserNotificationCenter.current().delegate = AppModel.shared.notifications
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(model)
                .environmentObject(model.store)
                .environmentObject(model.settings)
                .environmentObject(model.executor)
                .environmentObject(model.calendar)
                .environmentObject(model.whisper)
                .onChange(of: phase) { _, p in
                    if p == .active {
                        model.calendar.refreshStatus()
                        Task { await model.executor.retryPending() }
                    }
                }
        }
    }
}
