import SwiftUI

/// On-device evaluation: read reference sentences aloud, then compare what the recognizer
/// heard (word error rate, latency) separately from what the engine understood.
/// Nothing here is saved to your planner.
struct SpeechTestView: View {
    struct Result: Identifiable {
        let id = UUID()
        let reference: String
        let heard: String
        let wer: Double
        let latency: Double?
        let understood: String
    }

    static let phrases: [String] = [
        "Remind me to call the supplier tomorrow at 11 AM",
        "I have a dentist appointment day after tomorrow at 3 PM",
        "I have an idea we should convert product A into product B change the packaging and test it with existing customers",
        "Meeting with Rahul next Monday at 4 PM",
        "I have a meeting on Tuesday sorry Wednesday at 4 PM",
        "Remind me to pay the electricity bill in 15 days at 10 AM",
        "Dinner with Priya on 25 December at 4 PM",
        "Kal subah 10 baje mujhe supplier ko call karna yaad dilana",
        "Parson shaam 5 baje dentist ka appointment hai",
        "Remind me to buy groceries tomorrow at 6 PM and I have a meeting with the bank on Monday at 10 AM",
        // Marathi (choose Marathi · Whisper first)
        "उद्या सकाळी दहा वाजता सप्लायरला कॉल करायचा आहे आठवण करून दे",
        "परवा संध्याकाळी पाच वाजता डेंटिस्टची अपॉइंटमेंट आहे",
        "पुढच्या सोमवारी दुपारी तीन वाजता बँकेत मीटिंग आहे",
        "Udya sakali 9 vajta Rahul la call karaycha aahe"
    ]

    @StateObject private var recorder = SpeechRecorder()
    @EnvironmentObject private var settings: AppSettings
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var whisper: WhisperService
    @State private var transcribing = false
    @State private var current: String?
    @State private var results: [Result] = []
    @State private var pauseNote = true

    var body: some View {
        List {
            Section {
                Text("Tap a sentence, read it naturally (pauses, your normal accent), then tap it again to stop. Language: \(settings.localeId)\(WhisperService.usesWhisper(settings.localeId) ? " (Whisper)" : " (Apple)"). Try each phrase in a quiet room and with background noise. Number words vs digits (दहा vs 10) count as errors in WER even when the meaning is right.")
                    .font(.footnote)
                Toggle("Pause 2–3 s in the middle of each sentence", isOn: $pauseNote).font(.footnote)
            }
            Section("Phrases") {
                ForEach(Self.phrases, id: \.self) { p in
                    Button {
                        Task { await toggle(p) }
                    } label: {
                        HStack {
                            Text(p).foregroundStyle(.primary)
                            Spacer()
                            if current == p { Image(systemName: "stop.circle.fill").foregroundStyle(.red) }
                        }
                    }
                    .disabled(current != nil && current != p)
                }
            }
            if current != nil {
                Section("Hearing") { Text(recorder.recognizing ? (recorder.transcript.isEmpty ? "…" : recorder.transcript) : "Recording… (Whisper transcribes after you stop)") }
            }
            if transcribing { Section { HStack { ProgressView(); Text("Transcribing with Whisper…") } } }
            if let msg = recorder.failureMessage { Section { Text(msg).foregroundStyle(.red) } }
            if !results.isEmpty {
                Section("Results") {
                    let avg = results.map(\.wer).reduce(0, +) / Double(results.count)
                    Text(String(format: "Average word error rate: %.0f%% over %d recordings", avg * 100, results.count)).bold()
                    ForEach(results) { r in
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Said: \(r.reference)").font(.caption)
                            Text("Heard: \(r.heard)").font(.caption).foregroundStyle(.secondary)
                            Text(String(format: "WER %.0f%%", r.wer * 100) + (r.latency.map { String(format: " · text ready %.1fs after stop", $0) } ?? "")).font(.caption2)
                            Text("Understood: \(r.understood)").font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                    ShareLink(item: csv()) { Label("Share results (CSV text)", systemImage: "square.and.arrow.up") }
                }
            }
        }
        .navigationTitle("Speech test")
        .onDisappear { recorder.cancel(); recorder.discardAudio() }
    }

    private func toggle(_ phrase: String) async {
        if current == phrase {
            var heard = await recorder.stop()
            current = nil
            var latency: Double? = nil
            if WhisperService.usesWhisper(settings.localeId) {
                transcribing = true
                heard = (try? await whisper.transcribe(fileURL: recorder.audioFileURL, language: WhisperService.whisperLanguage(settings.localeId))) ?? ""
                latency = whisper.lastTranscribeSeconds
                transcribing = false
            } else if let a = recorder.stopTappedAt, let b = recorder.finalResultAt {
                latency = b.timeIntervalSince(a)
            }
            recorder.discardAudio()
            results.insert(Result(reference: phrase, heard: heard, wer: Self.wer(phrase, heard), latency: latency, understood: understand(heard)), at: 0)
        } else {
            let useWhisper = WhisperService.usesWhisper(settings.localeId)
            if useWhisper && !whisper.isDownloaded { return }
            current = phrase
            await recorder.start(localeId: settings.localeId, allowServer: settings.allowServerRecognition,
                                 contextualStrings: model.contextualStrings(), silenceSec: 0, keepAudio: useWhisper,
                                 recognize: !useWhisper)
            if recorder.isFailed { current = nil }
        }
    }

    private func understand(_ text: String) -> String {
        guard !text.isEmpty else { return "—" }
        let input = model.executor.engineInput(text)
        guard let r = try? model.engine.parse(input) else { return "engine error" }
        let items = r.items.map { "\($0.kind.label): \($0.title)" + (Fmt.when($0.date, $0.time).map { " — \($0)" } ?? "") + ($0.questions.isEmpty ? "" : " [asks: \($0.questions.map(\.id).joined(separator: ","))]") }
        let edits = r.updates.map { "Edit → \($0.targetTitle ?? "?")" }
        return (items + edits).joined(separator: " | ") + String(format: " (%.0f ms)", r.ms ?? 0)
    }

    static func normalize(_ s: String) -> [String] {
        s.lowercased()
            .replacingOccurrences(of: "a.m.", with: "am").replacingOccurrences(of: "p.m.", with: "pm")
            .components(separatedBy: CharacterSet.alphanumerics.inverted).filter { !$0.isEmpty }
    }

    /// Word error rate = word-level edit distance / reference length.
    static func wer(_ ref: String, _ hyp: String) -> Double {
        let r = normalize(ref), h = normalize(hyp)
        guard !r.isEmpty else { return h.isEmpty ? 0 : 1 }
        var prev = Array(0...h.count)
        for i in 1...r.count {
            var cur = [i] + Array(repeating: 0, count: h.count)
            for j in stride(from: 1, through: h.count, by: 1) {
                cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r[i - 1] == h[j - 1] ? 0 : 1))
            }
            prev = cur
        }
        return Double(prev[h.count]) / Double(r.count)
    }

    private func csv() -> String {
        var s = "language,reference,heard,wer,latency_s,understood\n"
        for r in results {
            func q(_ x: String) -> String { "\"" + x.replacingOccurrences(of: "\"", with: "\"\"") + "\"" }
            s += [settings.localeId, q(r.reference), q(r.heard), String(format: "%.3f", r.wer), r.latency.map { String(format: "%.2f", $0) } ?? "", q(r.understood)].joined(separator: ",") + "\n"
        }
        return s
    }
}
