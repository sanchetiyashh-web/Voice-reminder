import Foundation

/// JSON-file persistence with atomic writes. Every mutation is written to disk
/// before it is reported as done; if the write fails, memory is rolled back.
@MainActor
final class ItemStore: ObservableObject {
    @Published private(set) var items: [PlannerItem] = []
    @Published private(set) var drafts: [PendingDraft] = []
    @Published private(set) var loadError: String?

    private struct Snapshot: Codable { var version = 1; var items: [PlannerItem]; var drafts: [PendingDraft] }
    private let url: URL

    init(filename: String = "planner.json") {
        let dir = (try? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true))
            ?? FileManager.default.temporaryDirectory
        url = dir.appendingPathComponent(filename)
        load()
    }

    func load() {
        guard FileManager.default.fileExists(atPath: url.path) else { return }
        do {
            let data = try Data(contentsOf: url)
            let snap = try JSONDecoder.planner.decode(Snapshot.self, from: data)
            items = snap.items; drafts = snap.drafts
        } catch {
            // Keep the unreadable file so nothing is lost; start empty in memory.
            let backup = url.deletingPathExtension().appendingPathExtension("corrupt-\(Int(Date().timeIntervalSince1970)).json")
            try? FileManager.default.copyItem(at: url, to: backup)
            loadError = "Saved data could not be read (a copy was kept as \(backup.lastPathComponent)). \(error.localizedDescription)"
        }
    }

    private func persist(items newItems: [PlannerItem], drafts newDrafts: [PendingDraft]) throws {
        let data = try JSONEncoder.planner.encode(Snapshot(items: newItems, drafts: newDrafts))
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        items = newItems; drafts = newDrafts
    }

    func item(_ id: UUID) -> PlannerItem? { items.first { $0.id == id } }

    func upsert(_ item: PlannerItem) throws {
        var copy = items
        if let i = copy.firstIndex(where: { $0.id == item.id }) { copy[i] = item } else { copy.insert(item, at: 0) }
        try persist(items: copy, drafts: drafts)
    }

    func remove(_ id: UUID) throws {
        try persist(items: items.filter { $0.id != id }, drafts: drafts)
    }

    func addDraft(_ d: PendingDraft) throws {
        try persist(items: items, drafts: drafts.filter { $0.id != d.id } + [d])
    }

    func replaceDraft(_ d: PendingDraft) throws {
        var copy = drafts
        if let i = copy.firstIndex(where: { $0.id == d.id }) { copy[i] = d } else { copy.append(d) }
        try persist(items: items, drafts: copy)
    }

    func removeDraft(_ id: String) throws {
        try persist(items: items, drafts: drafts.filter { $0.id != id })
    }

    /// Merge items from a backup (same id → newer `updatedAt` wins).
    func merge(_ incoming: [PlannerItem]) throws -> Int {
        var byId = Dictionary(uniqueKeysWithValues: items.map { ($0.id, $0) })
        var added = 0
        for it in incoming {
            if let cur = byId[it.id] { if it.updatedAt > cur.updatedAt { byId[it.id] = it } }
            else { byId[it.id] = it; added += 1 }
        }
        try persist(items: byId.values.sorted { $0.createdAt > $1.createdAt }, drafts: drafts)
        return added
    }

    func exportData() throws -> Data {
        try JSONEncoder.planner.encode(Snapshot(items: items, drafts: drafts))
    }

    static func decodeBackup(_ data: Data) throws -> [PlannerItem] {
        try JSONDecoder.planner.decode(Snapshot.self, from: data).items
    }
}

extension JSONEncoder {
    static var planner: JSONEncoder {
        let e = JSONEncoder(); e.dateEncodingStrategy = .iso8601; e.outputFormatting = [.prettyPrinted, .sortedKeys]; return e
    }
}
extension JSONDecoder {
    static var planner: JSONDecoder { let d = JSONDecoder(); d.dateDecodingStrategy = .iso8601; return d }
}
