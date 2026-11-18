import SwiftUI

@MainActor
final class CaptureModel: ObservableObject {
    enum Phase: Equatable { case idle, listening, processing, asking, done, failed }

    @Published var phase: Phase = .idle
    @Published var text = ""
    @Published var lines: [Executor.Line] = []
    @Published var corrections: [String] = []
    @Published var status = ""
    @Published var answerText = ""
    @Published var answeringByVoice = false
    @Published var timing: String?
    let recorder = SpeechRecorder()
    private var app: AppModel { AppModel.shared }

    init() {
        recorder.onAutoStop = { [weak self] in Task { await self?.stop() } }
    }

    func start(forAnswer: Bool = false) async {
        answeringByVoice = forAnswer
        if !forAnswer { lines = []; corrections = []; text = ""; timing = nil }
        phase = .listening
        let s = app.settings
        await recorder.start(localeId: s.localeId, allowServer: s.allowServerRecognition,
                             contextualStrings: app.contextualStrings(),
                             silenceSec: forAnswer ? 3 : s.autoStopSilenceSec,
                             keepAudio: s.keepAudioUntilProcessed && !forAnswer)
        if let msg = recorder.failureMessage {
            phase = .failed; status = msg; answeringByVoice = false
        }
    }

    func stop() async {
        guard recorder.state == .listening else { return }
        let t = await recorder.stop()
        if answeringByVoice {
            answeringByVoice = false
            answerText = t
            phase = .asking
            if !t.isEmpty { await answer(t) }
            return
        }
        text = t
        if t.trimmingCharacters(in: .whitespaces).isEmpty {
            phase = .failed
            status = recorder.audioFileURL != nil
                ? "I didn't catch any words. Your recording is kept — tap Retry transcription, speak again, or type."
                : "I didn't catch any words. Speak again or type."
            return
        }
        await process()
    }

    func process() async {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        phase = .processing
        status = "Understanding…"
        let started = Date()
        let out = await app.executor.process(text: t, lowConfidence: recorder.lowConfidenceWords)
        lines.append(contentsOf: out.lines)
        corrections = out.corrections
        var timingParts: [String] = []
        if let a = recorder.stopTappedAt, let b = recorder.finalResultAt { timingParts.append(String(format: "speech final %.1fs after stop", b.timeIntervalSince(a))) }
        timingParts.append(String(format: "understand+save %.2fs", Date().timeIntervalSince(started)))
        timing = timingParts.joined(separator: " · ")
        if out.engineFailed {
            phase = .failed; status = "Not saved. Your text is kept below — edit it and tap Save text."
            return
        }
        if out.allOK { recorder.discardAudio() }
        phase = app.store.drafts.isEmpty ? .done : .asking
        status = phase == .done ? (out.allOK ? "Done" : "Done, with problems — see below") : "I need a bit more information"
        if app.settings.readBack { app.speaker.say(out.spoken, localeId: "en-IN") }
    }

    func answer(_ value: String) async {
        guard let p = app.store.drafts.first, let q = p.questions.first else { return }
        let v = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !v.isEmpty else { return }
        answerText = ""
        if let line = await app.executor.answer(p, questionId: q.id, text: v) {
            lines.append(line)
            if app.settings.readBack { app.speaker.say(line.text, localeId: "en-IN") }
        }
        phase = app.store.drafts.isEmpty ? .done : .asking
        status = phase == .done ? "Done" : "I need a bit more information"
    }

    func saveAnyway() async {
        guard let p = app.store.drafts.first else { return }
        lines.append(await app.executor.saveAnyway(p))
        phase = app.store.drafts.isEmpty ? .done : .asking
    }

    func discardDraft() {
        guard let p = app.store.drafts.first else { return }
        app.executor.discard(p)
        lines.append(.init(ok: true, text: "Discarded: \(p.title)"))
        phase = app.store.drafts.isEmpty ? .done : .asking
    }

    func retryTranscription() async {
        phase = .processing; status = "Transcribing the kept recording…"
        do {
            text = try await recorder.transcribeKeptAudio(localeId: app.settings.localeId, allowServer: app.settings.allowServerRecognition)
            recorder.clearFailure()
            if text.isEmpty { phase = .failed; status = "Still no words recognised. Type instead." } else { await process() }
        } catch {
            phase = .failed; status = "Retry failed: \(error.localizedDescription). Type instead."
        }
    }

    /// Undo what this recording saved, then re-interpret the (edited) text.
    func redo() async {
        // one recording = one undo record
        if lines.contains(where: { $0.ok && $0.itemId != nil }) { _ = await app.executor.undo() }
        lines = []
        await process()
    }

    func undoLast() async { lines.append(await app.executor.undo()) }

    func close() {
        recorder.cancel()
        recorder.discardAudio()
    }
}

struct CaptureView: View {
    var autoStart: Bool
    @StateObject private var m = CaptureModel()
    @EnvironmentObject private var store: ItemStore
    @EnvironmentObject private var executor: Executor
    @Environment(\.dismiss) private var dismiss
    @FocusState private var textFocused: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    StatusHeader(phase: m.phase, status: m.status, recorder: m.recorder, answering: m.answeringByVoice)

                    if m.phase == .listening && !m.answeringByVoice {
                        LiveTranscript(recorder: m.recorder)
                    } else if m.phase != .listening {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Transcript (you can edit)").font(.caption).foregroundStyle(.secondary)
                            TextEditor(text: $m.text)
                                .focused($textFocused)
                                .frame(minHeight: 90)
                                .padding(6)
                                .background(RoundedRectangle(cornerRadius: 10).stroke(.quaternary))
                            HStack {
                                Button(m.lines.contains(where: { $0.ok }) ? "Redo with this text" : "Save text") {
                                    textFocused = false
                                    Task {
                                        if m.lines.contains(where: { $0.ok }) { await m.redo() } else { await m.process() }
                                    }
                                }
                                .buttonStyle(.borderedProminent)
                                .disabled(m.text.trimmingCharacters(in: .whitespaces).isEmpty || m.phase == .processing)
                                if m.phase == .failed && m.recorder.audioFileURL != nil {
                                    Button("Retry transcription") { Task { await m.retryTranscription() } }.buttonStyle(.bordered)
                                }
                            }
                        }
                    }

                    if !m.corrections.isEmpty {
                        Label("Corrections applied: " + m.corrections.joined(separator: "; "), systemImage: "arrow.uturn.backward")
                            .font(.footnote).foregroundStyle(.secondary)
                    }

                    if let p = store.drafts.first, let q = p.questions.first, m.phase != .listening || m.answeringByVoice {
                        QuestionCard(pending: p, question: q, answerText: $m.answerText, listening: m.answeringByVoice,
                                     onAnswer: { v in Task { await m.answer(v) } },
                                     onVoice: { Task { m.answeringByVoice ? await m.stop() : await m.start(forAnswer: true) } },
                                     onSaveAnyway: { Task { await m.saveAnyway() } },
                                     onDiscard: { m.discardDraft() })
                    }

                    ForEach(m.lines) { line in ResultRow(line: line) }

                    if let t = m.timing { Text(t).font(.caption2).foregroundStyle(.tertiary) }

                    if m.lines.contains(where: { $0.ok }), executor.undoLabel != nil {
                        Button { Task { await m.undoLast() } } label: { Label("Undo", systemImage: "arrow.uturn.backward") }
                            .buttonStyle(.bordered)
                    }
                }
                .padding()
            }
            .safeAreaInset(edge: .bottom) {
                HStack(spacing: 24) {
                    if m.phase == .listening && !m.answeringByVoice {
                        Button { Task { await m.stop() } } label: {
                            Label("Stop", systemImage: "stop.fill").font(.title3.bold()).frame(maxWidth: .infinity).padding()
                        }
                        .buttonStyle(.borderedProminent).tint(.red)
                    } else if m.phase != .processing {
                        Button { Task { await m.start() } } label: {
                            Label(m.lines.isEmpty ? "Speak" : "Speak again", systemImage: "mic.fill").font(.title3.bold()).frame(maxWidth: .infinity).padding()
                        }
                        .buttonStyle(.borderedProminent)
                        Button { textFocused = true } label: { Label("Type", systemImage: "keyboard").padding() }
                            .buttonStyle(.bordered)
                    }
                }
                .padding(.horizontal).padding(.bottom, 8)
                .background(.bar)
            }
            .navigationTitle("Capture")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { m.close(); dismiss() } }
            }
            .task {
                if autoStart && store.drafts.isEmpty { await m.start() }
                else if !store.drafts.isEmpty { m.phase = .asking; m.status = "I need a bit more information" }
            }
        }
        .interactiveDismissDisabled(m.phase == .listening || m.phase == .processing)
    }
}

private struct StatusHeader: View {
    let phase: CaptureModel.Phase
    let status: String
    @ObservedObject var recorder: SpeechRecorder
    let answering: Bool

    var body: some View {
        HStack(spacing: 10) {
            switch phase {
            case .listening:
                Image(systemName: "waveform").symbolEffect(.variableColor.iterative).foregroundStyle(.red)
                VStack(alignment: .leading) {
                    Text(answering ? "Listening for your answer…" : "Listening… take your time").font(.headline)
                    Text(recorder.onDevice ? "On-device recognition" : "Apple server recognition (you allowed this)").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                LevelBar(level: recorder.level)
            case .processing:
                ProgressView(); Text(status.isEmpty ? "Working…" : status).font(.headline)
            case .asking:
                Image(systemName: "questionmark.bubble.fill").foregroundStyle(.orange); Text(status).font(.headline)
            case .done:
                Image(systemName: "checkmark.circle.fill").foregroundStyle(.green); Text(status).font(.headline)
            case .failed:
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.red)
                Text(status).font(.subheadline)
            case .idle:
                Image(systemName: "mic").foregroundStyle(.secondary); Text("Tap Speak, or type below").font(.headline)
            }
        }
    }
}

private struct LevelBar: View {
    let level: Float
    var body: some View {
        GeometryReader { g in
            Capsule().fill(.quaternary)
                .overlay(alignment: .leading) { Capsule().fill(.red).frame(width: g.size.width * CGFloat(min(1, level * 8))) }
        }
        .frame(width: 60, height: 6)
    }
}

private struct LiveTranscript: View {
    @ObservedObject var recorder: SpeechRecorder
    var body: some View {
        (Text(recorder.committed + (recorder.committed.isEmpty ? "" : " ")) + Text(recorder.partial).foregroundColor(.secondary))
            .font(.title3)
            .frame(maxWidth: .infinity, minHeight: 120, alignment: .topLeading)
            .padding()
            .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground)))
            .overlay(alignment: .topLeading) {
                if recorder.transcript.isEmpty { Text("Start speaking…").foregroundStyle(.tertiary).padding() }
            }
    }
}

private struct QuestionCard: View {
    let pending: PendingDraft
    let question: EngineQuestion
    @Binding var answerText: String
    let listening: Bool
    let onAnswer: (String) -> Void
    let onVoice: () -> Void
    let onSaveAnyway: () -> Void
    let onDiscard: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(pending.title).font(.caption).foregroundStyle(.secondary)
            Text(question.prompt).font(.headline)
            if !question.options.isEmpty {
                FlowButtons(options: question.options, onTap: onAnswer)
            }
            HStack {
                TextField("Type an answer, e.g. 4:30 PM or Friday", text: $answerText)
                    .textFieldStyle(.roundedBorder)
                    .onSubmit { onAnswer(answerText) }
                Button { onVoice() } label: { Image(systemName: listening ? "stop.circle.fill" : "mic.circle.fill").font(.title) }
                    .tint(listening ? .red : .accentColor)
            }
            HStack {
                if pending.draft?.kind != .appointment, pending.draft != nil {
                    Button("Save without this") { onSaveAnyway() }.font(.footnote)
                }
                Spacer()
                Button("Discard", role: .destructive) { onDiscard() }.font(.footnote)
            }
        }
        .padding()
        .background(RoundedRectangle(cornerRadius: 12).fill(Color.orange.opacity(0.12)))
    }
}

private struct FlowButtons: View {
    let options: [String]
    let onTap: (String) -> Void
    var body: some View {
        VStack(alignment: .leading) {
            ForEach(options, id: \.self) { o in
                Button(o) { onTap(o) }.buttonStyle(.bordered)
            }
        }
    }
}

struct ResultRow: View {
    let line: Executor.Line
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: line.ok ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                .foregroundStyle(line.ok ? .green : .orange)
            VStack(alignment: .leading, spacing: 2) {
                Text(line.text).font(.body.weight(.medium))
                if let d = line.detail, !d.isEmpty { Text(d).font(.footnote).foregroundStyle(.secondary) }
            }
        }
    }
}
