import Foundation
import WhisperKit

/// On-device Whisper (via WhisperKit / Core ML) for languages Apple's recognizer
/// doesn't support — Marathi — and for auto-detected mixed speech.
///
/// * The model is downloaded once from Hugging Face (argmaxinc/whisperkit-coreml) after
///   the user taps Download. No audio or text is ever uploaded; transcription is local.
/// * Transcription happens after recording stops (no live text).
@MainActor
final class WhisperService: ObservableObject {
    enum State: Equatable { case notDownloaded, downloading(Double), downloaded, loading, ready, failed(String) }

    struct ModelOption: Identifiable, Hashable {
        let id: String
        let name: String
        let sizeMB: Int
        let note: String
    }

    static let models: [ModelOption] = [
        .init(id: "openai_whisper-large-v3-v20240930_547MB", name: "Large v3 — best accuracy", sizeMB: 547,
              note: "Slower. The first preparation after download can take a few minutes. Best on iPhone 13 or newer."),
        .init(id: "openai_whisper-small_216MB", name: "Small — faster", sizeMB: 216,
              note: "Quicker and lighter, but noticeably less accurate for Marathi.")
    ]

    /// Speech-language ids that are transcribed with Whisper instead of Apple.
    static func usesWhisper(_ localeId: String) -> Bool { localeId == "mr-IN" || localeId == "auto" }
    /// Whisper language code ("mr"), or nil to auto-detect.
    static func whisperLanguage(_ localeId: String) -> String? { localeId == "mr-IN" ? "mr" : nil }

    enum WhisperError: LocalizedError {
        case notDownloaded, noAudio, empty
        var errorDescription: String? {
            switch self {
            case .notDownloaded: "The Marathi speech model isn't downloaded yet. Open Settings › Marathi & mixed speech › Download."
            case .noAudio: "No recording was found to transcribe."
            case .empty: "No words were recognised in the recording."
            }
        }
    }

    @Published private(set) var state: State = .notDownloaded
    @Published var selectedModel: String {
        didSet {
            UserDefaults.standard.set(selectedModel, forKey: "whisperModel")
            if selectedModel != loadedVariant { pipe = nil; loadedVariant = nil }
            refresh()
        }
    }
    @Published private(set) var lastTranscribeSeconds: Double?

    private var pipe: WhisperKit?
    private var loadedVariant: String?
    private var isLoading = false
    private let base: URL

    init() {
        selectedModel = UserDefaults.standard.string(forKey: "whisperModel") ?? Self.models[0].id
        let support = (try? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true))
            ?? FileManager.default.temporaryDirectory
        base = support.appendingPathComponent("whisper", isDirectory: true)
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        var b = base
        var rv = URLResourceValues(); rv.isExcludedFromBackup = true
        try? b.setResourceValues(rv)
        refresh()
    }

    var selectedOption: ModelOption { Self.models.first { $0.id == selectedModel } ?? Self.models[0] }

    // Stored relative to `base`, because the app's container path can change between installs.
    private var folderKey: String { "whisperFolder." + selectedModel }

    var modelFolder: URL? {
        guard let rel = UserDefaults.standard.string(forKey: folderKey) else { return nil }
        let url = base.appendingPathComponent(rel, isDirectory: true)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    var isDownloaded: Bool { modelFolder != nil }

    func refresh() {
        if pipe != nil && loadedVariant == selectedModel { state = .ready; return }
        if case .downloading = state { return }
        if case .loading = state { return }
        state = isDownloaded ? .downloaded : .notDownloaded
    }

    func download() async {
        if case .downloading = state { return }
        state = .downloading(0)
        do {
            let url = try await WhisperKit.download(variant: selectedModel, downloadBase: base, progressCallback: { [weak self] progress in
                let f = progress.fractionCompleted
                Task { @MainActor in
                    guard let self, case .downloading = self.state else { return }
                    self.state = .downloading(f)
                }
            })
            let basePath = base.standardizedFileURL.path
            var rel = url.standardizedFileURL.path
            if rel.hasPrefix(basePath) { rel = String(rel.dropFirst(basePath.count)) }
            rel = rel.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            UserDefaults.standard.set(rel, forKey: folderKey)
            state = .downloaded
        } catch {
            state = .failed("Download failed: \(error.localizedDescription). Check Wi-Fi and free space, then try again.")
        }
    }

    /// Loads (and on first use, compiles/prewarms) the model.
    @discardableResult
    func load() async throws -> WhisperKit {
        // Only one load at a time (warm-up and transcription can both ask for the model).
        while isLoading { try await Task.sleep(nanoseconds: 200_000_000) }
        if let pipe, loadedVariant == selectedModel { return pipe }
        guard let folder = modelFolder else { throw WhisperError.notDownloaded }
        isLoading = true
        defer { isLoading = false }
        state = .loading
        do {
            let config = WhisperKitConfig(model: selectedModel, modelFolder: folder.path, verbose: false, prewarm: true, load: true, download: false)
            let p = try await WhisperKit(config)
            pipe = p
            loadedVariant = selectedModel
            state = .ready
            return p
        } catch {
            state = .failed("Couldn't prepare the model: \(error.localizedDescription)")
            throw error
        }
    }

    func transcribe(fileURL: URL?, language: String?) async throws -> String {
        guard let fileURL, FileManager.default.fileExists(atPath: fileURL.path) else { throw WhisperError.noAudio }
        let p = try await load()
        let started = Date()
        let options = DecodingOptions(task: .transcribe,
                                      language: language,
                                      temperatureFallbackCount: 3,
                                      usePrefillPrompt: language != nil,
                                      detectLanguage: language == nil,
                                      skipSpecialTokens: true,
                                      withoutTimestamps: true)
        let results = try await p.transcribe(audioPath: fileURL.path, decodeOptions: options)
        lastTranscribeSeconds = Date().timeIntervalSince(started)
        var text = results.map { $0.text }.joined(separator: " ")
        // Whisper sometimes emits markers like [Music] / (applause) for non-speech.
        text = text.replacingOccurrences(of: "\\[[^\\]]*\\]|\\([^)]*\\)|<\\|[^|]*\\|>", with: " ", options: .regularExpression)
        text = text.components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ")
        guard !text.isEmpty else { throw WhisperError.empty }
        return text
    }

    func deleteModel() {
        pipe = nil; loadedVariant = nil
        if let f = modelFolder { try? FileManager.default.removeItem(at: f) }
        UserDefaults.standard.removeObject(forKey: folderKey)
        state = .notDownloaded
    }

    func unload() { pipe = nil; loadedVariant = nil; refresh() }
}
