import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var store: ItemStore
    @EnvironmentObject private var executor: Executor
    @State private var tab: ItemKind = .task
    @State private var search = ""
    @State private var showCapture = false
    @State private var showSettings = false
    @State private var showCompleted = false
    @State private var toast: Executor.Line?

    private var filtered: [PlannerItem] {
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        return store.items
            .filter { $0.kind == tab }
            .filter { showCompleted || !$0.isCompleted || tab == .idea }
            .filter { q.isEmpty || $0.title.lowercased().contains(q) || $0.transcript.lowercased().contains(q) || $0.pointers.joined(separator: " ").lowercased().contains(q) }
            .sorted { a, b in
                switch tab {
                case .idea: return a.createdAt > b.createdAt
                default:
                    if a.isCompleted != b.isCompleted { return !a.isCompleted }
                    switch (a.startDate, b.startDate) {
                    case let (x?, y?): return x < y
                    case (nil, _?): return false
                    case (_?, nil): return true
                    default: return a.createdAt > b.createdAt
                    }
                }
            }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("View", selection: $tab) {
                    ForEach(ItemKind.allCases) { k in Text(k.plural).tag(k) }
                }
                .pickerStyle(.segmented)
                .padding([.horizontal, .top])

                if let exp = model.signingExpiry, exp.timeIntervalSinceNow < 2 * 86400 {
                    Label("App signature: \(SigningInfo.remainingText(exp)). Open SideStore › Refresh All to keep using the app.", systemImage: "clock.badge.exclamationmark")
                        .font(.footnote)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(10)
                        .background(Color.orange.opacity(0.15))
                }
                if let err = store.loadError {
                    Text(err).font(.footnote).foregroundStyle(.red).padding(.horizontal)
                }
                if !store.drafts.isEmpty {
                    Button { showCapture = true } label: {
                        Label("\(store.drafts.count) item\(store.drafts.count == 1 ? "" : "s") waiting for your answer", systemImage: "questionmark.bubble")
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding()
                    .background(Color.orange.opacity(0.15))
                }

                List {
                    ForEach(filtered) { item in
                        NavigationLink(value: item.id) { ItemRow(item: item) }
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) { Task { toast = await executor.delete(item.id) } } label: { Label("Delete", systemImage: "trash") }
                            }
                            .swipeActions(edge: .leading) {
                                if item.kind != .idea {
                                    Button { Task { await executor.setCompleted(item.id, !item.isCompleted) } } label: {
                                        Label(item.isCompleted ? "Reopen" : "Done", systemImage: item.isCompleted ? "arrow.uturn.left" : "checkmark")
                                    }.tint(.green)
                                }
                            }
                    }
                    if tab != .idea {
                        Toggle("Show completed", isOn: $showCompleted).font(.footnote)
                    }
                }
                .listStyle(.plain)
                .overlay {
                    if filtered.isEmpty {
                        ContentUnavailableView(search.isEmpty ? "No \(tab.plural.lowercased()) yet" : "No matches",
                                               systemImage: tab.symbol,
                                               description: Text(search.isEmpty ? "Tap the microphone and just talk." : "Try another word."))
                    }
                }
            }
            .searchable(text: $search, prompt: "Search")
            .navigationTitle("Voice Planner")
            .navigationDestination(for: UUID.self) { id in ItemDetailView(itemId: id) }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showSettings = true } label: { Image(systemName: "gearshape") }.accessibilityLabel("Settings")
                }
            }
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 8) {
                    if let t = toast {
                        HStack { ResultRow(line: t); Spacer()
                            if executor.undoLabel != nil {
                                Button("Undo") { Task { toast = await executor.undo() } }.buttonStyle(.bordered)
                            }
                        }
                        .padding(10).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12)).padding(.horizontal)
                    }
                    Button { showCapture = true } label: {
                        Image(systemName: "mic.fill").font(.system(size: 34, weight: .bold)).foregroundStyle(.white)
                            .frame(width: 84, height: 84).background(Circle().fill(Color.accentColor)).shadow(radius: 6)
                    }
                    .accessibilityLabel("Start recording")
                }
                .padding(.bottom, 8)
            }
            .sheet(isPresented: $showCapture) { CaptureView(autoStart: true) }
            .sheet(isPresented: $showSettings) { SettingsView() }
            .onChange(of: model.pendingStartListening) { _, v in
                if v { model.pendingStartListening = false; showCapture = true }
            }
            .task(id: toast?.id) {
                guard toast != nil else { return }
                try? await Task.sleep(for: .seconds(6))
                toast = nil
            }
        }
    }
}

struct ItemRow: View {
    let item: PlannerItem
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: item.isCompleted ? "checkmark.circle.fill" : item.kind.symbol)
                .foregroundStyle(item.isCompleted ? Color.green : Color.accentColor)
            VStack(alignment: .leading, spacing: 3) {
                Text(item.title).strikethrough(item.isCompleted).lineLimit(2)
                if let w = item.whenText { Text(w).font(.subheadline).foregroundStyle(.secondary) }
                if item.kind == .idea, item.pointers.count > 1 { Text("\(item.pointers.count) points").font(.caption).foregroundStyle(.secondary) }
                if item.kind == .appointment {
                    switch item.calendarState {
                    case .failed, .pending: Label("Not in Calendar yet", systemImage: "exclamationmark.triangle").font(.caption).foregroundStyle(.orange)
                    default: EmptyView()
                    }
                }
            }
        }
    }
}
