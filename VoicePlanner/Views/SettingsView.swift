import SwiftUI
import UniformTypeIdentifiers
import EventKit

struct SettingsView: View {
    @EnvironmentObject private var settings: AppSettings
    @EnvironmentObject private var store: ItemStore
    @EnvironmentObject private var calendar: CalendarService
    @Environment(\.dismiss) private var dismiss
    @State private var exportURL: URL?
    @State private var importing = false
    @State private var message: String?
    @State private var newAlertHours = 1.0

    private let offsetChoices = [10, 30, 60, 120, 240, 1440, 2880]

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Language", selection: $settings.localeId) {
                        ForEach(AppSettings.languages, id: \.id) { Text($0.name).tag($0.id) }
                    }
                    LabeledContent("On-device recognition", value: SpeechRecorder.onDeviceSupported(settings.localeId) ? "Available" : "Not available")
                    Toggle("Allow Apple server recognition", isOn: $settings.allowServerRecognition)
                    Picker("Stop after silence", selection: $settings.autoStopSilenceSec) {
                        Text("Only when I tap Stop").tag(0)
                        Text("5 seconds").tag(5); Text("8 seconds").tag(8); Text("12 seconds").tag(12); Text("20 seconds").tag(20)
                    }
                    Toggle("Keep recording until processed", isOn: $settings.keepAudioUntilProcessed)
                } header: { Text("Listening") } footer: {
                    Text("Speech stays on your iPhone when on-device recognition is available. Server recognition is used only if on-device isn't available for the chosen language and you turn it on — your audio is then sent to Apple. The temporary recording lets you retry a failed transcription; it's deleted after a successful save and never kept long-term. For mixed Hindi-English, English (India) usually works best; choose Hindi for mostly-Hindi speech.")
                }

                Section {
                    Picker("“Next Friday” means", selection: $settings.nextWeekday) {
                        Text("The coming Friday").tag("coming")
                        Text("Friday of next week").tag("following")
                    }
                } header: { Text("Understanding") }

                Section {
                    Stepper("Default duration: \(settings.defaultDurationMin) min", value: $settings.defaultDurationMin, in: 15...480, step: 15)
                    ForEach(offsetChoices, id: \.self) { off in
                        Toggle("Alert \(Fmt.offset(off)) before", isOn: Binding(
                            get: { settings.appointmentAlertsMin.contains(off) },
                            set: { on in
                                var s = Set(settings.appointmentAlertsMin)
                                if on { s.insert(off) } else { s.remove(off) }
                                settings.appointmentAlertsMin = s.sorted(by: >)
                            }))
                    }
                    Picker("Deliver alerts via", selection: $settings.alertDelivery) {
                        ForEach(AlertDelivery.allCases) { Text($0.label).tag($0) }
                    }
                } header: { Text("Appointments") } footer: {
                    Text("Calendar alerts are stored on the event itself (they also show on other devices using that calendar). App notifications come from Voice Planner only. Only one of the two is used, so you won't get duplicates. If writing to Calendar fails, app notifications are used until it succeeds. Alerts whose time has already passed are skipped.")
                }

                Section {
                    LabeledContent("Access", value: calendarStatusText)
                    if calendar.status == .notDetermined || calendar.status == .writeOnly {
                        Button("Allow Calendar access") { Task { await calendar.requestAccess() } }
                    } else if !calendar.hasFullAccess {
                        Button("Open iPhone Settings") { if let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) } }
                    }
                    if calendar.hasFullAccess {
                        Picker("Add appointments to", selection: Binding(get: { settings.calendarId ?? "" }, set: { settings.calendarId = $0.isEmpty ? nil : $0 })) {
                            Text("Default calendar").tag("")
                            ForEach(calendar.writableCalendars(), id: \.calendarIdentifier) { c in
                                Text("\(c.title) (\(c.source.title))").tag(c.calendarIdentifier)
                            }
                        }
                    }
                } header: { Text("Calendar") }

                Section("Confirmations") {
                    Toggle("Read confirmations aloud", isOn: $settings.readBack)
                }

                Section {
                    Button("Export backup (JSON)") { exportBackup() }
                    if let url = exportURL {
                        ShareLink(item: url) { Label("Share \(url.lastPathComponent)", systemImage: "square.and.arrow.up") }
                    }
                    Button("Import backup") { importing = true }
                    if let m = message { Text(m).font(.footnote) }
                } header: { Text("Data") } footer: {
                    Text("\(store.items.count) items stored on this iPhone only. Save the backup to Files/iCloud Drive. Deleting the app deletes its data.")
                }

                Section {
                    NavigationLink("Speech accuracy test") { SpeechTestView() }
                    NavigationLink("Siri, Shortcuts & Action button") { ShortcutsHelpView() }
                }
            }
            .navigationTitle("Settings")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { res in
                do {
                    let url = try res.get()
                    let ok = url.startAccessingSecurityScopedResource(); defer { if ok { url.stopAccessingSecurityScopedResource() } }
                    let items = try ItemStore.decodeBackup(Data(contentsOf: url))
                    let added = try store.merge(items)
                    message = "Imported. \(added) new items. (Calendar events are not recreated automatically — open an appointment and tap Retry if needed.)"
                } catch { message = "Import failed: \(error.localizedDescription)" }
            }
            .onAppear { calendar.refreshStatus() }
        }
    }

    private var calendarStatusText: String {
        switch calendar.status {
        case .fullAccess: "Full access"
        case .writeOnly: "Add-only (can't update events)"
        case .denied: "Denied"
        case .restricted: "Restricted"
        case .notDetermined: "Not asked yet"
        default: "Unknown"
        }
    }

    private func exportBackup() {
        do {
            let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd-HHmm"
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("VoicePlanner-backup-\(f.string(from: Date())).json")
            try store.exportData().write(to: url, options: .atomic)
            exportURL = url
            message = nil
        } catch { message = "Export failed: \(error.localizedDescription)" }
    }
}

struct ShortcutsHelpView: View {
    var body: some View {
        List {
            Section("Ways to start") {
                Text("• Tap the big microphone in the app.")
                Text("• Say “Hey Siri, record in Voice Planner” — opens the app and starts listening.")
                Text("• Say “Hey Siri, add to Voice Planner” — Siri asks what to save and saves it without opening the app. (Siri does that dictation, not the app's recognizer.)")
                Text("• Action button (iPhone 15 Pro and later): Settings › Action Button › Shortcut › Voice Planner › Start listening.")
                Text("• Back Tap: Settings › Accessibility › Touch › Back Tap › choose the “Start listening” shortcut.")
                Text("• Lock Screen / Control Center: add a Shortcuts control for “Start listening”.")
            }
            Section("Not possible on iPhone") {
                Text("No always-on listening, no custom wake word, and no recording from the locked screen without unlocking. These are iOS restrictions.")
            }
        }
        .navigationTitle("Siri & Shortcuts")
    }
}
