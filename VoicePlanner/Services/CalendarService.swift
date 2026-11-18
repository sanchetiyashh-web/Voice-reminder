import Foundation
import EventKit

/// Writes appointments into the iPhone Calendar with EventKit.
/// Full access is requested (not write-only) because rescheduling needs to read
/// the existing event back and update it instead of creating a duplicate.
@MainActor
final class CalendarService: ObservableObject {
    let store = EKEventStore()
    @Published private(set) var status: EKAuthorizationStatus = EKEventStore.authorizationStatus(for: .event)

    enum CalError: LocalizedError {
        case noAccess, noCalendar, noStartTime
        var errorDescription: String? {
            switch self {
            case .noAccess: "Calendar access is off. Allow it in Settings › Voice Planner › Calendars (Full Access)."
            case .noCalendar: "No writable calendar found. Pick one in Voice Planner Settings."
            case .noStartTime: "The appointment has no date and time."
            }
        }
    }

    var hasFullAccess: Bool { status == .fullAccess }

    func refreshStatus() { status = EKEventStore.authorizationStatus(for: .event) }

    @discardableResult
    func requestAccess() async -> Bool {
        let ok = (try? await store.requestFullAccessToEvents()) ?? false
        refreshStatus()
        return ok
    }

    func writableCalendars() -> [EKCalendar] {
        guard hasFullAccess else { return [] }
        return store.calendars(for: .event).filter { $0.allowsContentModifications }.sorted { $0.title < $1.title }
    }

    private func marker(_ item: PlannerItem) -> URL? { URL(string: "voiceplanner://item/\(item.id.uuidString)") }

    private func existingEvent(for item: PlannerItem, near start: Date) -> EKEvent? {
        if let id = item.calendarEventId, let ev = store.event(withIdentifier: id) { return ev }
        // Fallback: identifiers can change after a calendar sync — find our own event by its marker URL.
        let cal = Calendar.current
        guard let from = cal.date(byAdding: .day, value: -90, to: start), let to = cal.date(byAdding: .day, value: 90, to: start) else { return nil }
        let pred = store.predicateForEvents(withStart: from, end: to, calendars: nil)
        let m = marker(item)
        return store.events(matching: pred).first { $0.url == m }
    }

    /// Creates or updates the event for this item. Returns its identifier.
    func upsert(_ item: PlannerItem, calendarId: String?, alarmOffsetsMin: [Int], defaultDurationMin: Int) throws -> String {
        guard hasFullAccess else { throw CalError.noAccess }
        guard let start = item.startDate, item.time != nil else { throw CalError.noStartTime }
        let existing = existingEvent(for: item, near: start)
        let ev = existing ?? EKEvent(eventStore: store)
        ev.title = item.title
        ev.startDate = start
        ev.endDate = start.addingTimeInterval(TimeInterval((item.durationMin ?? defaultDurationMin) * 60))
        ev.isAllDay = false
        ev.url = marker(item)
        var notes = "Added by Voice Planner."
        if !item.transcript.isEmpty { notes += "\nYou said: “\(item.transcript)”" }
        ev.notes = notes
        if existing == nil {
            let chosen = calendarId.flatMap { store.calendar(withIdentifier: $0) }
            guard let cal = (chosen?.allowsContentModifications == true ? chosen : nil) ?? store.defaultCalendarForNewEvents else { throw CalError.noCalendar }
            ev.calendar = cal
        }
        ev.alarms = alarmOffsetsMin.map { EKAlarm(relativeOffset: TimeInterval(-$0 * 60)) }
        try store.save(ev, span: .thisEvent, commit: true)
        return ev.eventIdentifier
    }

    func delete(eventId: String?, item: PlannerItem) throws {
        guard hasFullAccess else { throw CalError.noAccess }
        let ev = eventId.flatMap { store.event(withIdentifier: $0) } ?? item.startDate.flatMap { existingEvent(for: item, near: $0) }
        if let ev { try store.remove(ev, span: .thisEvent, commit: true) }
    }
}
