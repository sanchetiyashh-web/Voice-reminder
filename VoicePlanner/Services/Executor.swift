import Foundation

/// Turns interpreted results into saved items, calendar events and alerts.
/// Rule: nothing is reported as "saved"/"scheduled" until the write succeeded.
@MainActor
final class Executor: ObservableObject {
    struct Line: Identifiable, Hashable {
        let id = UUID()
        var ok: Bool
        var text: String
        var detail: String? = nil
        var itemId: UUID? = nil
    }
    struct Outcome {
        var lines: [Line] = []
        var corrections: [String] = []
        var newDrafts: Int = 0
        var engineFailed = false
        var parseMs: Double = 0
        var allOK: Bool { !engineFailed && lines.allSatisfy { $0.ok } }
        var spoken: String { lines.map { $0.text }.joined(separator: ". ") }
    }
    private struct Snapshot { var id: UUID; var before: PlannerItem? }
    private struct UndoRecord { var label: String; var snapshots: [Snapshot] }

    @Published private(set) var undoLabel: String?
    @Published private(set) var busy = false

    private let store: ItemStore
    private let settings: AppSettings
    private let calendar: CalendarService
    private let notifications: NotificationService
    private let engine: UnderstandingEngine
    private var undoStack: [UndoRecord] = []
    private(set) var lastItemId: UUID?

    init(store: ItemStore, settings: AppSettings, calendar: CalendarService, notifications: NotificationService, engine: UnderstandingEngine) {
        self.store = store; self.settings = settings; self.calendar = calendar; self.notifications = notifications; self.engine = engine
    }

    // MARK: engine context

    func engineInput(_ text: String, lowConfidence: [String] = []) -> UnderstandingEngine.Input {
        let refs = store.items.filter { !$0.isCompleted }.prefix(300).map {
            UnderstandingEngine.ItemRef(id: $0.id.uuidString, title: $0.title, kind: $0.kind.rawValue, date: $0.date, time: $0.time)
        }
        let last = lastItemId ?? store.items.max(by: { $0.updatedAt < $1.updatedAt })?.id
        return engine.makeInput(text: text, context: .init(lastItemId: last?.uuidString, items: Array(refs), lowConfidence: lowConfidence), settings: settings)
    }

    // MARK: main entry

    func process(text: String, lowConfidence: [String] = []) async -> Outcome {
        var out = Outcome()
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return out }
        guard !busy else { out.lines.append(Line(ok: false, text: "Still working on the previous request")); return out }
        busy = true; defer { busy = false }

        let result: ParseResult
        do { result = try engine.parse(engineInput(trimmed, lowConfidence: lowConfidence)) }
        catch {
            out.engineFailed = true
            out.lines.append(Line(ok: false, text: "Couldn't understand that", detail: "\(error.localizedDescription) Your text is kept — edit it or try again."))
            return out
        }
        out.corrections = result.corrections
        out.parseMs = result.ms ?? 0
        if result.items.isEmpty && result.updates.isEmpty {
            out.lines.append(Line(ok: false, text: "Nothing to save", detail: "Only filler words were recognised."))
            return out
        }
        var record = UndoRecord(label: "", snapshots: [])
        for draft in result.items {
            if draft.questions.isEmpty { let l = await save(draft, transcript: trimmed, record: &record); out.lines.append(l) }
            else { let l = keepPending(PendingDraft(id: draft.id, draft: draft, edit: nil, transcript: trimmed, createdAt: Date()), out: &out); out.lines.append(l) }
        }
        for op in result.updates {
            if op.questions.isEmpty { let l = await applyEdit(op, record: &record); out.lines.append(l) }
            else { let l = keepPending(PendingDraft(id: op.id, draft: nil, edit: op, transcript: trimmed, createdAt: Date()), out: &out); out.lines.append(l) }
        }
        pushUndo(record, label: out.lines.first(where: { $0.ok })?.text)
        return out
    }

    private func keepPending(_ p: PendingDraft, out: inout Outcome) -> Line {
        do {
            try store.addDraft(p)
            out.newDrafts += 1
            return Line(ok: true, text: "Needs an answer: \(p.title)", detail: p.questions.first?.prompt)
        } catch {
            return Line(ok: false, text: "Couldn't keep “\(p.title)”", detail: error.localizedDescription)
        }
    }

    /// Answer the first question of a pending draft. Saves it once nothing is missing.
    func answer(_ pending: PendingDraft, questionId: String, text: String) async -> Line? {
        let input = engineInput(text)
        do {
            if var draft = pending.draft {
                draft = try engine.answer(draft, questionId: questionId, text: text, input: input)
                if draft.questions.isEmpty {
                    var rec = UndoRecord(label: "", snapshots: [])
                    let line = await save(draft, transcript: pending.transcript, record: &rec)
                    if line.ok { try? store.removeDraft(pending.id); pushUndo(rec, label: line.text) }
                    return line
                }
                var p = pending; p.draft = draft; try store.replaceDraft(p)
                return nil
            } else if var op = pending.edit {
                op = try engine.answer(op, questionId: questionId, text: text, input: input)
                if op.cancelled == true { try store.removeDraft(pending.id); return Line(ok: true, text: "Left unchanged") }
                if op.questions.isEmpty {
                    var rec = UndoRecord(label: "", snapshots: [])
                    let line = await applyEdit(op, record: &rec)
                    if line.ok { try? store.removeDraft(pending.id); pushUndo(rec, label: line.text) }
                    return line
                }
                var p = pending; p.edit = op; try store.replaceDraft(p)
                return nil
            }
        } catch {
            return Line(ok: false, text: "Couldn't use that answer", detail: error.localizedDescription)
        }
        return nil
    }

    /// Save a pending draft as-is (e.g. a task without a reminder time → undated task).
    func saveAnyway(_ pending: PendingDraft) async -> Line {
        guard var d = pending.draft else { try? store.removeDraft(pending.id); return Line(ok: true, text: "Dismissed") }
        if d.kind == .appointment { return Line(ok: false, text: "An appointment needs a date and time", detail: "Answer the question, or change it to a task.") }
        d.reminder = d.time != nil
        if d.pending?.ampm != nil { d.time = nil; d.reminder = false }
        d.questions = []
        var rec = UndoRecord(label: "", snapshots: [])
        let line = await save(d, transcript: pending.transcript, record: &rec)
        if line.ok { try? store.removeDraft(pending.id); pushUndo(rec, label: line.text) }
        return line
    }

    func discard(_ pending: PendingDraft) { try? store.removeDraft(pending.id) }

    // MARK: save / edit

    private func dedupKey(_ d: DraftItem) -> String {
        let t = d.title.lowercased().filter { $0.isLetter || $0.isNumber }
        return [d.kind.rawValue, t, d.date.map { "\($0.y)-\($0.m)-\($0.d)" } ?? "", d.time.map { "\($0.h):\($0.min)" } ?? ""].joined(separator: "|")
    }

    private func save(_ d: DraftItem, transcript: String, record: inout UndoRecord) async -> Line {
        let key = dedupKey(d)
        if let dup = store.items.first(where: { $0.dedupKey == key && Date().timeIntervalSince($0.createdAt) < 600 }) {
            return Line(ok: true, text: "Already saved: \(dup.title)", detail: dup.whenText, itemId: dup.id)
        }
        var item = PlannerItem(kind: d.kind, title: d.title)
        item.pointers = d.pointers
        item.transcript = d.source.isEmpty ? transcript : d.source
        item.notes = d.notes
        item.date = d.kind == .idea ? nil : d.date
        item.time = d.kind == .idea ? nil : d.time
        item.durationMin = d.kind == .appointment ? (d.durationMin ?? settings.defaultDurationMin) : nil
        item.reminder = d.reminder
        item.alertOffsetsMin = d.alertOffsetsMin
        item.dedupKey = key
        item.calendarState = d.kind == .appointment ? .pending : .notNeeded
        // 1. persist first (so a calendar failure never loses the item)
        do { try store.upsert(item) } catch { return Line(ok: false, text: "Couldn't save “\(d.title)”", detail: error.localizedDescription) }
        record.snapshots.append(Snapshot(id: item.id, before: nil))
        // 2. calendar + alerts
        await sync(&item)
        do { try store.upsert(item) } catch { return Line(ok: false, text: "Saved, but status not updated", detail: error.localizedDescription, itemId: item.id) }
        lastItemId = item.id
        return confirmation(for: item, verb: "Saved")
    }

    private func confirmation(for item: PlannerItem, verb: String) -> Line {
        var detail: [String] = []
        if let w = item.whenText { detail.append(w) }
        if item.kind == .appointment {
            switch item.calendarState {
            case .synced: detail.append("Added to Calendar")
            case .failed, .pending: detail.append("⚠︎ Not in Calendar yet — \(item.calendarError ?? "pending"). Tap the item to retry.")
            case .notNeeded: break
            }
        }
        if let a = item.alertSummary { detail.append(a) }
        detail.append(contentsOf: item.notes.filter { !$0.hasPrefix("Duration") || item.kind == .appointment })
        let calOK = item.kind != .appointment || item.calendarState == .synced
        return Line(ok: calOK, text: "\(verb) \(item.kind.label.lowercased()): \(item.title)", detail: detail.joined(separator: "\n"), itemId: item.id)
    }

    private func applyEdit(_ op: EditOp, record: inout UndoRecord) async -> Line {
        guard let tid = op.targetId.flatMap(UUID.init(uuidString:)), var item = store.item(tid) else {
            return Line(ok: false, text: "Couldn't find the item to change")
        }
        record.snapshots.append(Snapshot(id: item.id, before: item))
        let c = op.changes
        if c.remove == true {
            let line = await delete(item.id, recordInto: nil)
            lastItemId = nil
            return line
        }
        if c.complete == true { item.isCompleted = true }
        if let d = c.date { item.date = d }
        if let t = c.time { item.time = t; if item.date == nil { item.date = DateParts(Date()) } }
        if let dm = c.durationMin { item.durationMin = dm }
        if let s = c.shiftMin, let start = item.startDate {
            let n = start.addingTimeInterval(TimeInterval(s * 60))
            item.date = DateParts(n); if item.time != nil { item.time = TimeParts(n) }
        }
        if item.kind == .task, item.time != nil { item.reminder = true }
        if let start = item.startDate, item.time != nil, start <= Date(), !item.isCompleted {
            record.snapshots.removeLast()
            return Line(ok: false, text: "Not changed: \(Fmt.when(item.date, item.time) ?? "that time") has already passed")
        }
        item.updatedAt = Date()
        if item.kind == .appointment && item.calendarState != .synced { item.calendarState = .pending }
        await sync(&item)
        do { try store.upsert(item) } catch {
            return Line(ok: false, text: "Couldn't save the change", detail: error.localizedDescription)
        }
        lastItemId = item.id
        return confirmation(for: item, verb: c.complete == true ? "Completed" : "Updated")
    }

    // MARK: direct actions from the UI

    func update(_ edited: PlannerItem) async -> Line {
        guard let before = store.item(edited.id) else { return Line(ok: false, text: "Item no longer exists") }
        var item = edited
        item.updatedAt = Date()
        if item.kind == .appointment { item.calendarState = item.calendarState == .synced ? .synced : .pending; if item.durationMin == nil { item.durationMin = settings.defaultDurationMin } }
        await sync(&item)
        do { try store.upsert(item) } catch { return Line(ok: false, text: "Couldn't save", detail: error.localizedDescription) }
        pushUndo(UndoRecord(label: "", snapshots: [Snapshot(id: item.id, before: before)]), label: "Edited \(item.title)")
        lastItemId = item.id
        return confirmation(for: item, verb: "Updated")
    }

    func setCompleted(_ id: UUID, _ done: Bool) async {
        guard var item = store.item(id) else { return }
        let before = item
        item.isCompleted = done; item.updatedAt = Date()
        await sync(&item)
        if (try? store.upsert(item)) != nil {
            pushUndo(UndoRecord(label: "", snapshots: [Snapshot(id: id, before: before)]), label: (done ? "Completed " : "Reopened ") + item.title)
        }
    }

    @discardableResult
    func delete(_ id: UUID, recordInto: Bool? = true) async -> Line {
        guard let item = store.item(id) else { return Line(ok: false, text: "Already deleted") }
        notifications.cancel(item.notificationIds)
        if item.calendarEventId != nil {
            do { try calendar.delete(eventId: item.calendarEventId, item: item) }
            catch { return Line(ok: false, text: "Couldn't remove the Calendar event", detail: "\(error.localizedDescription) Nothing was deleted.") }
        }
        do { try store.remove(id) } catch { return Line(ok: false, text: "Couldn't delete", detail: error.localizedDescription) }
        if recordInto == true { pushUndo(UndoRecord(label: "", snapshots: [Snapshot(id: id, before: item)]), label: "Deleted \(item.title)") }
        return Line(ok: true, text: "Deleted \(item.kind.label.lowercased()): \(item.title)")
    }

    func retrySync(_ id: UUID) async -> Line {
        guard var item = store.item(id) else { return Line(ok: false, text: "Item no longer exists") }
        await sync(&item)
        do { try store.upsert(item) } catch { return Line(ok: false, text: "Couldn't save", detail: error.localizedDescription) }
        return confirmation(for: item, verb: "Synced")
    }

    /// Retries calendar writes that are pending or failed (called when the app becomes active).
    func retryPending() async {
        for item in store.items where item.kind == .appointment && (item.calendarState == .pending || item.calendarState == .failed) && !item.isCompleted {
            if let s = item.startDate, s < Date() { continue }
            _ = await retrySync(item.id)
        }
    }

    // MARK: undo

    private func pushUndo(_ r: UndoRecord, label: String?) {
        guard !r.snapshots.isEmpty else { return }
        var rec = r; rec.label = label ?? "last change"
        undoStack.append(rec)
        if undoStack.count > 20 { undoStack.removeFirst() }
        undoLabel = rec.label
    }

    @discardableResult
    func undo() async -> Line {
        guard let rec = undoStack.popLast() else { return Line(ok: false, text: "Nothing to undo") }
        var problems: [String] = []
        for snap in rec.snapshots.reversed() {
            if let before = snap.before {
                var restored = before
                // the current event (if any) is reused; a deleted one is recreated
                if let cur = store.item(snap.id) { restored.calendarEventId = cur.calendarEventId; notifications.cancel(cur.notificationIds) }
                else { restored.calendarEventId = nil; if restored.kind == .appointment { restored.calendarState = .pending } }
                await sync(&restored)
                do { try store.upsert(restored) } catch { problems.append(error.localizedDescription) }
            } else {
                let l = await delete(snap.id, recordInto: false)
                if !l.ok { problems.append(l.detail ?? l.text) }
            }
        }
        undoLabel = undoStack.last?.label
        return problems.isEmpty ? Line(ok: true, text: "Undone: \(rec.label)") : Line(ok: false, text: "Undo was incomplete", detail: problems.joined(separator: "\n"))
    }

    // MARK: calendar + alerts

    private func sync(_ item: inout PlannerItem) async {
        notifications.cancel(item.notificationIds)
        item.notificationIds = []
        item.alertSummary = nil
        let now = Date()

        // Ideas and tasks never keep a calendar event.
        if item.kind != .appointment, item.calendarEventId != nil {
            try? calendar.delete(eventId: item.calendarEventId, item: item)
            item.calendarEventId = nil
        }

        switch item.kind {
        case .idea:
            item.calendarState = .notNeeded

        case .task:
            item.calendarState = .notNeeded
            guard item.reminder, !item.isCompleted, item.time != nil, let due = item.startDate else { return }
            guard due > now else { item.alertSummary = "Reminder time has passed — no alert scheduled."; return }
            let granted = await notifications.authorizationGranted()
            guard granted else { item.alertSummary = "⚠︎ Notifications are off, so no reminder will appear. Allow them in iPhone Settings › Voice Planner."; return }
            let id = "\(item.id.uuidString)-due"
            do {
                try await notifications.schedule(id: id, title: "Reminder", body: item.title, at: due)
                item.notificationIds = [id]
                item.alertSummary = "Reminder at \(Fmt.time(item.time!))"
            } catch { item.alertSummary = "⚠︎ Reminder not scheduled: \(error.localizedDescription)" }

        case .appointment:
            guard let start = item.startDate, item.time != nil else { item.calendarState = .notNeeded; return }
            if item.isCompleted { return }
            let offsets = Array(Set(item.alertOffsetsMin ?? settings.appointmentAlertsMin)).sorted(by: >)
            let future = offsets.filter { start.addingTimeInterval(-TimeInterval($0 * 60)) > now }
            let skipped = offsets.filter { !future.contains($0) }

            if calendar.status == .notDetermined { await calendar.requestAccess() }
            var calendarOK = false
            do {
                let id = try calendar.upsert(item, calendarId: settings.calendarId,
                                             alarmOffsetsMin: settings.alertDelivery == .calendar ? future : [],
                                             defaultDurationMin: settings.defaultDurationMin)
                item.calendarEventId = id; item.calendarState = .synced; item.calendarError = nil; calendarOK = true
            } catch {
                item.calendarState = .failed; item.calendarError = error.localizedDescription
            }

            // App notifications: either chosen in Settings, or as a fallback while the
            // calendar write is failing. Never both, so alerts are not duplicated.
            var via = settings.alertDelivery == .calendar ? "Calendar" : "app notification"
            if !calendarOK || settings.alertDelivery == .app {
                via = "app notification"
                if !future.isEmpty {
                    let granted = await notifications.authorizationGranted()
                    if granted {
                        for off in future {
                            let id = "\(item.id.uuidString)-a\(off)"
                            if (try? await notifications.schedule(id: id, title: item.title, body: "In \(Fmt.offset(off)) — \(Fmt.time(item.time!))", at: start.addingTimeInterval(-TimeInterval(off * 60)))) != nil {
                                item.notificationIds.append(id)
                            }
                        }
                    } else { item.alertSummary = "⚠︎ Notifications are off and Calendar failed, so no alerts are scheduled."; return }
                }
            }
            var parts: [String] = []
            if !future.isEmpty { parts.append("Alerts (\(via)): " + future.map { Fmt.offset($0) + " before" }.joined(separator: ", ")) }
            if !skipped.isEmpty { parts.append("Skipped (already passed): " + skipped.map { Fmt.offset($0) + " before" }.joined(separator: ", ")) }
            if future.isEmpty { parts.append("No future alerts remain.") }
            item.alertSummary = parts.joined(separator: ". ")
        }
    }
}
