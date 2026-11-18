import Foundation
import Speech
import AVFoundation

/// Thread-safe hand-off from the real-time audio thread to the recognizer and temp file.
final class AudioSink: @unchecked Sendable {
    private let lock = NSLock()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var file: AVAudioFile?
    var onLevel: (@Sendable (Float) -> Void)?

    func setRequest(_ r: SFSpeechAudioBufferRecognitionRequest?) { lock.lock(); request = r; lock.unlock() }
    func setFile(_ f: AVAudioFile?) { lock.lock(); file = f; lock.unlock() }

    func append(_ buffer: AVAudioPCMBuffer) {
        lock.lock(); let r = request; let f = file; lock.unlock()
        r?.append(buffer)
        try? f?.write(from: buffer)
        if let ch = buffer.floatChannelData?[0], buffer.frameLength > 0 {
            var sum: Float = 0
            let n = Int(buffer.frameLength)
            for i in 0..<n { sum += ch[i] * ch[i] }
            onLevel?(sqrt(sum / Float(n)))
        }
    }
}

/// Live speech-to-text with Apple's Speech framework.
///
/// * The app decides when to stop (tap, or a long configurable silence), so normal
///   thinking pauses don't end the recording. If the recognizer finishes a segment on
///   its own (pause or per-request limit), a new request is chained and text is appended.
/// * On-device recognition is required unless the user consented to server recognition.
/// * The recording is kept in a temp file until processed, so a failed transcription
///   can be retried instead of losing what was said.
@MainActor
final class SpeechRecorder: ObservableObject {
    enum State: Equatable { case idle, starting, listening, finishing, failed(String) }

    @Published private(set) var state: State = .idle
    @Published private(set) var committed = ""
    @Published private(set) var partial = ""
    @Published private(set) var level: Float = 0
    @Published private(set) var onDevice = false

    var transcript: String { [committed, partial].filter { !$0.isEmpty }.joined(separator: " ") }
    private(set) var lowConfidenceWords: [String] = []
    private(set) var audioFileURL: URL?
    private(set) var stopTappedAt: Date?
    private(set) var finalResultAt: Date?
    /// Called when recording should stop by itself (long silence, interruption).
    var onAutoStop: (() -> Void)?

    private let engine = AVAudioEngine()
    private let sink = AudioSink()
    private var recognizer: SFSpeechRecognizer?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var generation = 0
    private var stopping = false
    private var stopContinuation: CheckedContinuation<Void, Never>?
    private var lastActivity = Date()
    private var silenceTimer: Timer?
    private var silenceLimit: TimeInterval = 0
    private var consecutiveErrors = 0
    private var allowServer = false
    private var contextual: [String] = []
    private var interruptionObserver: NSObjectProtocol?

    var isFailed: Bool { if case .failed = state { return true }; return false }
    var failureMessage: String? { if case .failed(let m) = state { return m }; return nil }

    static func requestPermissions() async -> (mic: Bool, speech: Bool) {
        let speech: Bool = await withCheckedContinuation { c in
            SFSpeechRecognizer.requestAuthorization { c.resume(returning: $0 == .authorized) }
        }
        let mic = await AVAudioApplication.requestRecordPermission()
        return (mic, speech)
    }

    static func onDeviceSupported(_ localeId: String) -> Bool {
        SFSpeechRecognizer(locale: Locale(identifier: localeId))?.supportsOnDeviceRecognition ?? false
    }

    func start(localeId: String, allowServer: Bool, contextualStrings: [String], silenceSec: Int, keepAudio: Bool) async {
        switch state { case .idle, .failed: break; default: return }
        state = .starting
        committed = ""; partial = ""; lowConfidenceWords = []; level = 0
        stopTappedAt = nil; finalResultAt = nil; consecutiveErrors = 0
        discardAudio()

        let perms = await Self.requestPermissions()
        guard perms.mic else { return fail("Microphone access is off. Turn it on in Settings › Voice Planner, or type instead.") }
        guard perms.speech else { return fail("Speech Recognition access is off. Turn it on in Settings › Voice Planner, or type instead.") }
        guard let rec = SFSpeechRecognizer(locale: Locale(identifier: localeId)) else {
            return fail("Speech recognition doesn't support \(localeId) on this iPhone. Choose another language in Settings, or type.")
        }
        guard rec.isAvailable else { return fail("Speech recognition is unavailable right now. Type instead, or try again.") }
        if !rec.supportsOnDeviceRecognition && !allowServer {
            return fail("On-device recognition isn't available for this language on this iPhone. You can allow Apple server recognition in Settings (audio is sent to Apple), switch language, or type.")
        }
        rec.queue = OperationQueue.main
        recognizer = rec
        self.allowServer = allowServer
        contextual = Array(contextualStrings.prefix(100))
        onDevice = rec.supportsOnDeviceRecognition

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .measurement, options: [.duckOthers, .defaultToSpeaker])
            try session.setActive(true, options: .notifyOthersOnDeactivation)
            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            guard format.sampleRate > 0, format.channelCount > 0 else { return fail("No microphone input is available.") }
            if keepAudio {
                let url = FileManager.default.temporaryDirectory.appendingPathComponent("capture-\(UUID().uuidString).caf")
                let file = try AVAudioFile(forWriting: url, settings: format.settings)
                sink.setFile(file); audioFileURL = url
            }
            sink.onLevel = { [weak self] v in
                Task { @MainActor in
                    guard let self else { return }
                    self.level = v
                    if v > 0.03 { self.lastActivity = Date() }
                }
            }
            startRequest()
            input.removeTap(onBus: 0)
            let s = sink
            input.installTap(onBus: 0, bufferSize: 2048, format: format) { buffer, _ in s.append(buffer) }
            engine.prepare()
            try engine.start()
        } catch {
            teardownAudio()
            return fail("Couldn't start the microphone: \(error.localizedDescription)")
        }

        interruptionObserver = NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.onAutoStop?() }
        }
        lastActivity = Date()
        silenceLimit = TimeInterval(silenceSec)
        silenceTimer?.invalidate()
        silenceTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.state == .listening, self.silenceLimit > 0 else { return }
                if Date().timeIntervalSince(self.lastActivity) > self.silenceLimit && !self.transcript.isEmpty { self.onAutoStop?() }
            }
        }
        state = .listening
    }

    private func startRequest() {
        guard let recognizer else { return }
        generation += 1
        let gen = generation
        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        // Always stay on-device when the language supports it; Apple's servers are used only
        // when on-device isn't available AND the user has allowed it in Settings.
        req.requiresOnDeviceRecognition = recognizer.supportsOnDeviceRecognition
        req.addsPunctuation = true
        req.taskHint = .dictation
        req.contextualStrings = contextual
        request = req
        sink.setRequest(req)
        task = recognizer.recognitionTask(with: req) { [weak self] result, error in
            // recognizer.queue is .main
            MainActor.assumeIsolated { self?.handle(result: result, error: error, generation: gen) }
        }
    }

    private func handle(result: SFSpeechRecognitionResult?, error: Error?, generation gen: Int) {
        guard gen == generation else { return }
        if let r = result {
            let text = r.bestTranscription.formattedString
            if text != partial { partial = text; lastActivity = Date() }
            if r.isFinal {
                for seg in r.bestTranscription.segments where seg.confidence > 0 && seg.confidence < 0.4 {
                    let w = seg.substring.trimmingCharacters(in: .punctuationCharacters)
                    if w.count > 2, w.first?.isUppercase == true { lowConfidenceWords.append(w) }
                }
                consecutiveErrors = 0
            }
        }
        let ended = (result?.isFinal ?? false) || error != nil
        guard ended else { return }
        commitPartial()
        if stopping { finishStop(); return }
        // Recognizer ended a segment by itself while the user is still talking/thinking.
        if error != nil { consecutiveErrors += 1 }
        if consecutiveErrors >= 4 {
            let kept = audioFileURL != nil ? " Your recording was kept — tap Retry transcription." : ""
            stopEngineOnly()
            fail("Speech recognition stopped unexpectedly (\(error?.localizedDescription ?? "unknown error")).\(kept)")
            return
        }
        startRequest()
    }

    private func commitPartial() {
        let p = partial.trimmingCharacters(in: .whitespaces)
        if !p.isEmpty { committed = committed.isEmpty ? p : committed + " " + p }
        partial = ""
    }

    /// Stops recording and waits (max 3 s) for the final transcription.
    @discardableResult
    func stop() async -> String {
        guard state == .listening else { return transcript }
        stopping = true
        state = .finishing
        stopTappedAt = Date()
        silenceTimer?.invalidate()
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        sink.setRequest(nil)
        sink.setFile(nil)            // closes the temp file
        await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
            stopContinuation = c
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
                MainActor.assumeIsolated { self?.finishStop() }
            }
        }
        return transcript
    }

    private func finishStop() {
        guard let c = stopContinuation else { return }
        stopContinuation = nil
        commitPartial()
        generation += 1          // ignore late callbacks
        task?.cancel(); task = nil; request = nil
        finalResultAt = Date()
        teardownAudio()
        stopping = false
        state = .idle
        c.resume()
    }

    func cancel() {
        guard state == .listening || state == .starting else { return }
        generation += 1
        silenceTimer?.invalidate()
        task?.cancel(); task = nil
        stopEngineOnly()
        state = .idle
    }

    private func stopEngineOnly() {
        silenceTimer?.invalidate()
        if engine.isRunning { engine.stop() }
        engine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        sink.setRequest(nil); sink.setFile(nil)
        teardownAudio()
    }

    private func teardownAudio() {
        if let o = interruptionObserver { NotificationCenter.default.removeObserver(o); interruptionObserver = nil }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func fail(_ message: String) { state = .failed(message) }

    func clearFailure() { if isFailed { state = .idle } }

    /// Deletes the temporary recording (called after a successful save, or when dismissed).
    func discardAudio() {
        if let url = audioFileURL { try? FileManager.default.removeItem(at: url) }
        audioFileURL = nil
    }

    /// Re-transcribes the kept temporary recording (after a live failure).
    func transcribeKeptAudio(localeId: String, allowServer: Bool) async throws -> String {
        guard let url = audioFileURL else { throw NSError(domain: "VoicePlanner", code: 1, userInfo: [NSLocalizedDescriptionKey: "No recording was kept."]) }
        guard let rec = SFSpeechRecognizer(locale: Locale(identifier: localeId)), rec.isAvailable else {
            throw NSError(domain: "VoicePlanner", code: 2, userInfo: [NSLocalizedDescriptionKey: "Speech recognition is unavailable."])
        }
        if !rec.supportsOnDeviceRecognition && !allowServer {
            throw NSError(domain: "VoicePlanner", code: 3, userInfo: [NSLocalizedDescriptionKey: "On-device recognition isn't available for this language."])
        }
        let req = SFSpeechURLRecognitionRequest(url: url)
        req.requiresOnDeviceRecognition = rec.supportsOnDeviceRecognition
        req.addsPunctuation = true
        req.taskHint = .dictation
        rec.queue = OperationQueue.main
        return try await withCheckedThrowingContinuation { c in
            var done = false
            _ = rec.recognitionTask(with: req) { result, error in
                if done { return }
                if let error { done = true; c.resume(throwing: error); return }
                if let result, result.isFinal { done = true; c.resume(returning: result.bestTranscription.formattedString) }
            }
        }
    }
}
