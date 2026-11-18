import SwiftUI

struct ItemDetailView: View {
    let itemId: UUID
    @EnvironmentObject private var store: ItemStore
    @EnvironmentObject private var executor: Executor
    @EnvironmentObject private var settings: AppSettings
    @Environment(\.dismiss) private var dismiss

    @State private var draft: PlannerItem?
    @State private var hasDate = false
    @State private var hasTime = false
    @State private var dateValue = Date()
    @State private var pointersText = ""
    @State private var result: Executor.Line?
    @State private var saving = false

    var body: some View {
        Form {
            if let d = draft {
                Section {
                    TextField("Title", text: bind(\.title), axis: .vertical)
                    Picker("Type", selection: bind(\.kind)) {
                        ForEach(ItemKind.allCases) { Text($0.label).tag($0) }
                    }
                    if d.kind != .idea {
                        Toggle("Completed", isOn: bind(\.isCompleted))
                    }
                }
                if d.kind == .idea {
                    Section("Points (one per line)") {
                        TextEditor(text: $pointersText).frame(minHeight: 120)
                    }
                } else {
                    Section("When") {
                        Toggle("Date", isOn: $hasDate)
                        if hasDate {
                            Toggle("Time", isOn: $hasTime)
                            DatePicker("Starts", selection: $dateValue, displayedComponents: hasTime ? [.date, .hourAndMinute] : [.date])
                        }
                        if d.kind == .task {
                            Toggle("Remind me at that time", isOn: bind(\.reminder))
                                .disabled(!hasTime)
                        }
                        if d.kind == .appointment {
                            Stepper("Duration: \(d.durationMin ?? settings.defaultDurationMin) min",
                                    value: Binding(get: { draft?.durationMin ?? settings.defaultDurationMin }, set: { draft?.durationMin = $0 }),
                                    in: 5...720, step: 15)
                            if d.kind == .appointment && (!hasDate || !hasTime) {
                                Text("An appointment needs a date and a time to go into Calendar.").font(.footnote).foregroundStyle(.orange)
                            }
                        }
                    }
                    if d.kind == .appointment {
                        Section("Calendar & alerts") {
                            LabeledContent("Calendar", value: calendarText(d))
                            if let e = d.calendarError, d.calendarState != .synced { Text(e).font(.footnote).foregroundStyle(.orange) }
                            if let a = d.alertSummary { Text(a).font(.footnote) }
                            Text("Alerts: " + (d.alertOffsetsMin ?? settings.appointmentAlertsMin).sorted(by: >).map { Fmt.offset($0) + " before" }.joined(separator: ", ") + (d.alertOffsetsMin == nil ? " (defaults)" : ""))
                                .font(.footnote).foregroundStyle(.secondary)
                            if d.alertOffsetsMin != nil {
                                Button("Use default alerts") { draft?.alertOffsetsMin = nil }
                            }
                            if d.calendarState != .synced {
                                Button("Retry adding to Calendar") { Task { result = await executor.retrySync(itemId); reload() } }
                            }
                        }
                    } else if let a = d.alertSummary {
                        Section("Reminder") { Text(a).font(.footnote) }
                    }
                }
                if !d.transcript.isEmpty {
                    Section("What you said") { Text(d.transcript).font(.callout).textSelection(.enabled) }
                }
                if !d.notes.isEmpty {
                    Section("Notes") { ForEach(d.notes, id: \.self) { Text($0).font(.footnote) } }
                }
                if let r = result { Section { ResultRow(line: r) } }
                Section {
                    Button("Delete", role: .destructive) {
                        Task { let l = await executor.delete(itemId); if l.ok { dismiss() } else { result = l } }
                    }
                }
            } else {
                Text("This item no longer exists.")
            }
        }
        .navigationTitle(draft?.kind.label ?? "Item")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { Task { await save() } }.disabled(saving || draft == nil)
            }
        }
        .onAppear(perform: reload)
    }

    private func bind<T>(_ kp: WritableKeyPath<PlannerItem, T>) -> Binding<T> {
        Binding(get: { draft![keyPath: kp] }, set: { draft?[keyPath: kp] = $0 })
    }

    private func calendarText(_ d: PlannerItem) -> String {
        switch d.calendarState {
        case .synced: "Added"
        case .pending: "Pending"
        case .failed: "Failed"
        case .notNeeded: "—"
        }
    }

    private func reload() {
        guard let it = store.item(itemId) else { draft = nil; return }
        draft = it
        hasDate = it.date != nil
        hasTime = it.time != nil
        dateValue = it.startDate ?? Date()
        pointersText = it.pointers.joined(separator: "\n")
    }

    private func save() async {
        guard var d = draft else { return }
        saving = true; defer { saving = false }
        d.title = d.title.trimmingCharacters(in: .whitespacesAndNewlines)
        if d.kind == .idea {
            d.pointers = pointersText.split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
            d.date = nil; d.time = nil; d.reminder = false
        } else {
            d.date = hasDate ? DateParts(dateValue) : nil
            d.time = hasDate && hasTime ? TimeParts(dateValue) : nil
            if d.time == nil { d.reminder = false }
            if d.kind == .appointment && (d.date == nil || d.time == nil) {
                result = .init(ok: false, text: "Add a date and time, or change the type to Task.")
                return
            }
            if let s = d.startDate, d.time != nil, s < Date(), !d.isCompleted, d.kind == .appointment {
                result = .init(ok: false, text: "That time has already passed.")
                return
            }
        }
        result = await executor.update(d)
        reload()
    }
}
