import AppIntents

/// "Hey Siri, record in Voice Planner" / Action button / Back Tap → opens the app and starts listening.
struct StartListeningIntent: AppIntent {
    static let title: LocalizedStringResource = "Start listening"
    static var description: IntentDescription? = IntentDescription("Opens Voice Planner and starts recording.")
    static let openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult {
        AppModel.shared.pendingStartListening = true
        return .result()
    }
}

/// "Hey Siri, add to Voice Planner" → Siri asks what to save, dictates it, and the app
/// saves it in the background. Note: this dictation is done by Siri, not by the app.
struct AddItemIntent: AppIntent {
    static let title: LocalizedStringResource = "Add to Voice Planner"
    static var description: IntentDescription? = IntentDescription("Save an idea, task or appointment from text or Siri dictation.")
    static let openAppWhenRun: Bool = false

    @Parameter(title: "What should I save?", requestValueDialog: "What should I save?")
    var text: String

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let model = AppModel.shared
        let out = await model.executor.process(text: text)
        var msg = out.lines.filter { !$0.text.hasPrefix("Needs an answer") }.map { $0.text }.joined(separator: ". ")
        if out.newDrafts > 0 { msg += (msg.isEmpty ? "" : ". ") + "I need a bit more detail for \(out.newDrafts) item\(out.newDrafts == 1 ? "" : "s") — open Voice Planner to answer." }
        if msg.isEmpty { msg = "Nothing was saved." }
        return .result(dialog: IntentDialog(stringLiteral: msg))
    }
}

struct PlannerShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: StartListeningIntent(),
                    phrases: ["Record in \(.applicationName)", "Start \(.applicationName)", "New note in \(.applicationName)"],
                    shortTitle: "Start listening", systemImageName: "mic.fill")
        AppShortcut(intent: AddItemIntent(),
                    phrases: ["Add to \(.applicationName)", "Save in \(.applicationName)"],
                    shortTitle: "Add item", systemImageName: "plus.circle")
    }
}
