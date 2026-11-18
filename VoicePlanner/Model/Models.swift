import Foundation

// MARK: - Shared value types (mirror the JSON produced by engine/understanding.js)

enum ItemKind: String, Codable, CaseIterable, Identifiable {
    case idea, task, appointment
    var id: String { rawValue }
    var label: String { switch self { case .idea: "Idea"
        case .task: "Task"
        case .appointment: "Appointment" } }
    var plural: String { switch self { case .idea: "Ideas"
        case .task: "Tasks"
        case .appointment: "Appointments" } }
    var symbol: String { switch self { case .idea: "lightbulb"
        case .task: "checkmark.circle"
        case .appointment: "calendar" } }
}

struct DateParts: Codable, Hashable { var y: Int; var m: Int; var d: Int }
struct TimeParts: Codable, Hashable { var h: Int; var min: Int }
struct HourMinute: Codable, Hashable { var h: Int; var min: Int }

struct EngineQuestion: Codable, Hashable, Identifiable {
    var id: String
    var prompt: String
    var options: [String]
}

struct PendingState: Codable, Hashable {
    var ampm: HourMinute?
    var dateOptions: [String]?
    var timeOptions: [String]?
    var vagueDate: String?
    var invalidDate: String?
    var confirmWords: [String]?
    var notMatch: String?
}

/// An interpreted item that has not been saved yet.
struct DraftItem: Codable, Hashable, Identifiable {
    var id: String
    var kind: ItemKind
    var title: String
    var pointers: [String]
    var source: String
    var date: DateParts?
    var time: TimeParts?
    var durationMin: Int?
    var reminder: Bool
    var alertOffsetsMin: [Int]?
    var notes: [String]
    var pending: PendingState?
    var questions: [EngineQuestion]
}

struct EditCandidate: Codable, Hashable { var id: String; var title: String; var label: String? }
struct TargetSnapshot: Codable, Hashable { var date: DateParts?; var time: TimeParts?; var kind: String? }
struct EditChanges: Codable, Hashable {
    var date: DateParts?
    var time: TimeParts?
    var durationMin: Int?
    var shiftMin: Int?
    var remove: Bool?
    var complete: Bool?
}

/// A spoken change to an existing item ("move my dentist appointment to Friday").
struct EditOp: Codable, Hashable, Identifiable {
    var id: String
    var targetId: String?
    var targetTitle: String?
    var candidates: [EditCandidate]
    var changes: EditChanges
    var notes: [String]
    var pending: PendingState?
    var questions: [EngineQuestion]
    var source: String
    var cancelled: Bool?
    var _targetSnapshot: TargetSnapshot?
}

struct ParseResult: Codable {
    var version: String?
    var cleaned: String
    var corrections: [String]
    var items: [DraftItem]
    var updates: [EditOp]
    var ms: Double?
    var error: String?
}

// MARK: - Persisted item

enum SyncState: String, Codable { case notNeeded, pending, synced, failed }

struct PlannerItem: Codable, Hashable, Identifiable {
    var id: UUID
    var kind: ItemKind
    var title: String
    var pointers: [String]
    var transcript: String
    var notes: [String]
    var date: DateParts?
    var time: TimeParts?
    var durationMin: Int?
    var reminder: Bool
    var alertOffsetsMin: [Int]?          // nil → use Settings defaults
    var isCompleted: Bool
    var createdAt: Date
    var updatedAt: Date
    var calendarEventId: String?
    var calendarState: SyncState
    var calendarError: String?
    var notificationIds: [String]
    var alertSummary: String?
    var dedupKey: String

    init(kind: ItemKind, title: String) {
        id = UUID(); self.kind = kind; self.title = title; pointers = []; transcript = ""; notes = []
        reminder = false; isCompleted = false; createdAt = Date(); updatedAt = Date()
        calendarState = .notNeeded; notificationIds = []; dedupKey = ""
    }

    /// Start date/time in the device's current calendar and time zone.
    var startDate: Date? {
        guard let d = date else { return nil }
        var c = DateComponents()
        c.year = d.y; c.month = d.m; c.day = d.d
        c.hour = time?.h ?? 0; c.minute = time?.min ?? 0
        return Calendar.current.date(from: c)
    }

    var whenText: String? { Fmt.when(date, time) }
}

/// Something waiting for the user's answer. Persisted so speech is never lost.
struct PendingDraft: Codable, Hashable, Identifiable {
    var id: String
    var draft: DraftItem?
    var edit: EditOp?
    var transcript: String
    var createdAt: Date
    var questions: [EngineQuestion] { draft?.questions ?? edit?.questions ?? [] }
    var title: String { draft?.title ?? (edit.map { "Change: " + ($0.targetTitle ?? $0.source) } ?? "") }
}

// MARK: - Formatting

enum Fmt {
    static func date(_ d: DateParts) -> String {
        var c = DateComponents(); c.year = d.y; c.month = d.m; c.day = d.d
        guard let dt = Calendar.current.date(from: c) else { return "\(d.d)/\(d.m)/\(d.y)" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_IN")
        let thisYear = Calendar.current.component(.year, from: Date()) == d.y
        f.dateFormat = thisYear ? "EEE d MMM" : "EEE d MMM yyyy"
        return f.string(from: dt)
    }
    static func time(_ t: TimeParts) -> String {
        let h = t.h % 12 == 0 ? 12 : t.h % 12
        return String(format: "%d:%02d %@", h, t.min, t.h < 12 ? "AM" : "PM")
    }
    static func when(_ d: DateParts?, _ t: TimeParts?) -> String? {
        guard let d else { return t.map { time($0) } }
        return date(d) + (t.map { ", " + time($0) } ?? "")
    }
    static func offset(_ min: Int) -> String {
        if min % 1440 == 0 { let d = min / 1440; return d == 1 ? "1 day" : "\(d) days" }
        if min % 60 == 0 { let h = min / 60; return h == 1 ? "1 hour" : "\(h) hours" }
        return "\(min) min"
    }
}

extension DateParts {
    init(_ date: Date) {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
        self.init(y: c.year ?? 2000, m: c.month ?? 1, d: c.day ?? 1)
    }
}
extension TimeParts {
    init(_ date: Date) {
        let c = Calendar.current.dateComponents([.hour, .minute], from: date)
        self.init(h: c.hour ?? 0, min: c.minute ?? 0)
    }
}
