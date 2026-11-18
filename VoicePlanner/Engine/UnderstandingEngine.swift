import Foundation
import JavaScriptCore

/// Runs engine/understanding.js on-device with Apple's JavaScriptCore.
/// No network access: JavaScriptCore contexts have no fetch/XHR.
@MainActor
final class UnderstandingEngine {
    struct Now: Codable { var y: Int; var m: Int; var d: Int; var h: Int; var min: Int }
    struct Settings: Codable { var defaultDurationMin: Int; var nextWeekday: String }
    struct ItemRef: Codable { var id: String; var title: String; var kind: String; var date: DateParts?; var time: TimeParts? }
    struct Context: Codable { var lastItemId: String?; var items: [ItemRef]; var lowConfidence: [String] }
    struct Input: Codable { var text: String; var now: Now; var settings: Settings; var context: Context }

    enum EngineError: LocalizedError {
        case notLoaded(String), failed(String)
        var errorDescription: String? {
            switch self { case .notLoaded(let s): "Understanding engine not loaded: \(s)"
        case .failed(let s): "Understanding failed: \(s)" }
        }
    }

    private let ctx: JSContext
    private var lastException: String?
    private(set) var loadError: String?

    init() {
        ctx = JSContext()!
        ctx.exceptionHandler = { [weak self] _, exc in
            let msg = exc?.toString() ?? "unknown"
            MainActor.assumeIsolated { self?.lastException = msg }
        }
        if let url = Bundle.main.url(forResource: "understanding", withExtension: "js"),
           let src = try? String(contentsOf: url, encoding: .utf8) {
            ctx.evaluateScript(src, withSourceURL: url)
            if ctx.objectForKeyedSubscript("VP")?.isUndefined ?? true { loadError = lastException ?? "VP not defined" }
        } else {
            loadError = "understanding.js missing from app bundle"
        }
    }

    static func now(_ date: Date = Date()) -> Now {
        let c = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        return Now(y: c.year!, m: c.month!, d: c.day!, h: c.hour!, min: c.minute!)
    }

    func makeInput(text: String, context: Context, settings: AppSettings) -> Input {
        Input(text: text, now: Self.now(), settings: Settings(defaultDurationMin: settings.defaultDurationMin, nextWeekday: settings.nextWeekday), context: context)
    }

    func parse(_ input: Input) throws -> ParseResult {
        let json = try String(decoding: JSONEncoder().encode(input), as: UTF8.self)
        let out = try call("parseJSON", [json])
        let result = try JSONDecoder().decode(ParseResult.self, from: Data(out.utf8))
        if let e = result.error { throw EngineError.failed(e) }
        return result
    }

    func answer<T: Codable>(_ obj: T, questionId: String, text: String, input: Input) throws -> T {
        let objJSON = try String(decoding: JSONEncoder().encode(obj), as: UTF8.self)
        let inJSON = try String(decoding: JSONEncoder().encode(input), as: UTF8.self)
        let out = try call("answerJSON", [objJSON, questionId, text, inJSON])
        if let err = try? JSONDecoder().decode([String: String].self, from: Data(out.utf8)), let e = err["error"] { throw EngineError.failed(e) }
        return try JSONDecoder().decode(T.self, from: Data(out.utf8))
    }

    private func call(_ fn: String, _ args: [Any]) throws -> String {
        if let loadError { throw EngineError.notLoaded(loadError) }
        lastException = nil
        guard let f = ctx.objectForKeyedSubscript("VP")?.objectForKeyedSubscript(fn), !f.isUndefined,
              let r = f.call(withArguments: args), let s = r.toString() else {
            throw EngineError.failed(lastException ?? "no result")
        }
        if let e = lastException { throw EngineError.failed(e) }
        return s
    }
}
