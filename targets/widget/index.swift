import WidgetKit
import SwiftUI
import AppIntents

// Shared contract with client/lib/widget.ts: the app writes `widgetData` as a
// JSON string into the app-group defaults; the widget's CastVoteIntent writes
// `pendingVotes` back, which the app consumes on next foreground. Keys and
// shapes must stay in sync with WIDGET_DATA_KEY / PENDING_VOTES_KEY there.
let kAppGroup = "group.com.resolutioncompanion.app"
let kWidgetDataKey = "widgetData"
let kPendingVotesKey = "pendingVotes"

// Brand colors (Colors.dark in client/constants/theme.ts)
let brandAccent = Color(red: 0.0, green: 0.851, blue: 1.0)
let brandBackground = Color(red: 0.059, green: 0.059, blue: 0.102)
let brandTextSecondary = Color.white.opacity(0.65)

struct WidgetActionData: Codable {
    var id: String
    var title: String
    var kickstart: String
}

struct WidgetDayPlan: Codable {
    var date: String
    var actions: [WidgetActionData]
}

struct WidgetData: Codable {
    var personaName: String
    var date: String
    var scheduled: Int
    var completed: Int
    var streak: Int
    var isRestDay: Bool
    var copyLine: String
    var nextActionId: String?
    var nextActionTitle: String?
    var nextActionKickstart: String?
    var remainingActions: [WidgetActionData]?
    var dayPlans: [WidgetDayPlan]?
}

func localDateString(_ date: Date = Date()) -> String {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: date)
}

func freshCopy(personaName: String, remaining: Int, date: Date = Date()) -> String {
    let variants = [
        "\(remaining) small \(remaining == 1 ? "vote" : "votes") for \(personaName) today",
        "\(personaName) is one small action away",
        "2 minutes still counts today",
    ]
    let day = Calendar.current.ordinality(of: .day, in: .era, for: date) ?? 0
    return variants[day % variants.count]
}

func loadWidgetData() -> WidgetData? {
    guard
        let raw = UserDefaults(suiteName: kAppGroup)?.string(forKey: kWidgetDataKey),
        let data = raw.data(using: .utf8)
    else { return nil }
    var decoded = try? JSONDecoder().decode(WidgetData.self, from: data)
    // Data written on an earlier day describes yesterday: show a fresh,
    // guilt-free slate rather than yesterday's counts. The identity framing
    // ("any day can be day one") is the brand — never an accusation.
    if let d = decoded, d.date != localDateString() {
        let today = localDateString()
        let plan = d.dayPlans?.first(where: { $0.date == today })
        let actions = plan?.actions ?? []
        let next = actions.first
        decoded = WidgetData(
            personaName: d.personaName,
            date: today,
            scheduled: actions.count,
            completed: 0,
            streak: d.streak,
            isRestDay: actions.isEmpty,
            copyLine: actions.isEmpty
                ? "Rest is part of becoming."
                : freshCopy(personaName: d.personaName, remaining: actions.count),
            nextActionId: next?.id,
            nextActionTitle: next?.title,
            nextActionKickstart: next?.kickstart,
            remainingActions: actions,
            dayPlans: d.dayPlans
        )
    }
    return decoded
}

func saveWidgetData(_ data: WidgetData) {
    guard
        let encoded = try? JSONEncoder().encode(data),
        let str = String(data: encoded, encoding: .utf8)
    else { return }
    UserDefaults(suiteName: kAppGroup)?.set(str, forKey: kWidgetDataKey)
}

@discardableResult
func enqueueVote(
    actionId: String,
    isKickstart: Bool,
    source: String
) -> WidgetData? {
    guard !actionId.isEmpty else { return loadWidgetData() }
    let defaults = UserDefaults(suiteName: kAppGroup)

    var votes: [[String: Any]] = []
    if let raw = defaults?.string(forKey: kPendingVotesKey),
       let data = raw.data(using: .utf8),
       let parsed = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
        votes = parsed
    }
    votes.append([
        "actionId": actionId,
        "date": localDateString(),
        "kind": isKickstart ? "kickstart" : "full",
        "source": source,
    ])
    if let out = try? JSONSerialization.data(withJSONObject: votes),
       let str = String(data: out, encoding: .utf8) {
        defaults?.set(str, forKey: kPendingVotesKey)
    }

    guard var data = loadWidgetData() else { return nil }
    data.completed = min(data.completed + 1, max(data.scheduled, 1))
    data.copyLine = "A vote for \(data.personaName) ✓"
    if var remaining = data.remainingActions {
        remaining.removeAll(where: { $0.id == actionId })
        data.remainingActions = remaining
        let next = remaining.first
        data.nextActionId = next?.id
        data.nextActionTitle = next?.title
        data.nextActionKickstart = next?.kickstart
    } else {
        data.nextActionId = nil
        data.nextActionTitle = nil
        data.nextActionKickstart = nil
    }
    saveWidgetData(data)
    WidgetCenter.shared.reloadAllTimelines()
    return data
}

// MARK: - App Intent (interactive logging without opening the app)

struct CastVoteIntent: AppIntent {
    static var title: LocalizedStringResource = "Cast today's vote"
    static var description = IntentDescription(
        "Log a daily action for Resolution Companion without opening the app."
    )

    @Parameter(title: "Action") var actionId: String
    @Parameter(title: "Kickstart") var isKickstart: Bool

    init() {
        self.actionId = ""
        self.isKickstart = false
    }

    init(actionId: String, isKickstart: Bool) {
        self.actionId = actionId
        self.isKickstart = isKickstart
    }

    func perform() async throws -> some IntentResult {
        guard !actionId.isEmpty else { return .result() }
        enqueueVote(
            actionId: actionId,
            isKickstart: isKickstart,
            source: "widget"
        )
        return .result()
    }
}

// MARK: - Timeline

struct VoteEntry: TimelineEntry {
    let date: Date
    let data: WidgetData?
}

struct VoteProvider: TimelineProvider {
    func placeholder(in context: Context) -> VoteEntry {
        VoteEntry(
            date: Date(),
            data: WidgetData(
                personaName: "Future You",
                date: localDateString(),
                scheduled: 3,
                completed: 1,
                streak: 4,
                isRestDay: false,
                copyLine: "1 of 3 votes cast today",
                nextActionId: "placeholder",
                nextActionTitle: "Write one paragraph",
                nextActionKickstart: "Open the doc",
                remainingActions: [
                    WidgetActionData(
                        id: "placeholder",
                        title: "Write one paragraph",
                        kickstart: "Open the doc"
                    )
                ],
                dayPlans: nil
            )
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (VoteEntry) -> Void) {
        completion(VoteEntry(date: Date(), data: loadWidgetData() ?? placeholder(in: context).data))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<VoteEntry>) -> Void) {
        let entry = VoteEntry(date: Date(), data: loadWidgetData())
        // Refresh at the next local midnight so a new day always gets a
        // fresh ring even if the app is never opened.
        let calendar = Calendar.current
        let nextMidnight = calendar.nextDate(
            after: Date(),
            matching: DateComponents(hour: 0, minute: 0, second: 5),
            matchingPolicy: .nextTime
        ) ?? Date().addingTimeInterval(3600 * 6)
        completion(Timeline(entries: [entry], policy: .after(nextMidnight)))
    }
}

// MARK: - Views

struct ProgressRing: View {
    let completed: Int
    let scheduled: Int
    var lineWidth: CGFloat = 7

    var fraction: Double {
        scheduled > 0 ? min(Double(completed) / Double(scheduled), 1.0) : 0
    }

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.white.opacity(0.12), lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: fraction)
                .stroke(
                    brandAccent,
                    style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
            VStack(spacing: 0) {
                Text("\(completed)/\(max(scheduled, 1))")
                    .font(.system(.subheadline, design: .rounded).weight(.bold))
                    .foregroundStyle(.white)
            }
        }
    }
}

struct SmallVoteView: View {
    let data: WidgetData

    var body: some View {
        VStack(spacing: 6) {
            ProgressRing(completed: data.completed, scheduled: data.scheduled, lineWidth: 6)
                .frame(width: 56, height: 56)
            Text(data.isRestDay ? "Rest is part of becoming" : data.copyLine)
                .font(.system(.caption2, design: .rounded))
                .foregroundStyle(brandTextSecondary)
                .multilineTextAlignment(.center)
                .lineLimit(2)
        }
    }
}

struct MediumVoteView: View {
    let data: WidgetData

    var allDone: Bool {
        data.scheduled > 0 && data.completed >= data.scheduled
    }

    var body: some View {
        HStack(spacing: 14) {
            VStack(spacing: 4) {
                ProgressRing(completed: data.completed, scheduled: data.scheduled)
                    .frame(width: 64, height: 64)
                if data.streak > 1 {
                    Text("\(data.streak)-day streak")
                        .font(.system(.caption2, design: .rounded))
                        .foregroundStyle(brandTextSecondary)
                }
            }
            VStack(alignment: .leading, spacing: 5) {
                Text("Becoming \(data.personaName)")
                    .font(.system(.caption, design: .rounded).weight(.semibold))
                    .foregroundStyle(brandTextSecondary)
                    .lineLimit(1)
                if data.isRestDay {
                    Text("Rest is part of becoming.")
                        .font(.system(.subheadline, design: .rounded).weight(.semibold))
                        .foregroundStyle(.white)
                } else if allDone || data.nextActionId == nil {
                    Text(allDone ? "Every vote cast today ✓" : data.copyLine)
                        .font(.system(.subheadline, design: .rounded).weight(.semibold))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                } else {
                    Text(data.nextActionTitle ?? "")
                        .font(.system(.subheadline, design: .rounded).weight(.semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    HStack(spacing: 8) {
                        Button(intent: CastVoteIntent(actionId: data.nextActionId ?? "", isKickstart: false)) {
                            Label("Done", systemImage: "checkmark")
                                .font(.system(.caption, design: .rounded).weight(.bold))
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(brandAccent)
                        .foregroundStyle(brandBackground)
                        if let kickstart = data.nextActionKickstart, !kickstart.isEmpty {
                            Button(intent: CastVoteIntent(actionId: data.nextActionId ?? "", isKickstart: true)) {
                                Text("2 min: \(kickstart)")
                                    .font(.system(.caption, design: .rounded).weight(.semibold))
                                    .lineLimit(1)
                            }
                            .buttonStyle(.bordered)
                            .tint(brandAccent)
                        }
                    }
                }
            }
            Spacer(minLength: 0)
        }
    }
}

struct LargeVoteView: View {
    let data: WidgetData

    var allDone: Bool {
        data.scheduled > 0 && data.completed >= data.scheduled
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 16) {
                ProgressRing(completed: data.completed, scheduled: data.scheduled, lineWidth: 8)
                    .frame(width: 84, height: 84)
                VStack(alignment: .leading, spacing: 5) {
                    Text("Becoming \(data.personaName)")
                        .font(.system(.headline, design: .rounded).weight(.bold))
                        .foregroundStyle(.white)
                    Text(data.isRestDay ? "Rest is part of becoming." : data.copyLine)
                        .font(.system(.subheadline, design: .rounded))
                        .foregroundStyle(brandTextSecondary)
                        .lineLimit(3)
                    if data.streak > 1 {
                        Label("\(data.streak)-day streak", systemImage: "flame.fill")
                            .font(.system(.caption, design: .rounded).weight(.semibold))
                            .foregroundStyle(brandAccent)
                    }
                }
                Spacer(minLength: 0)
            }

            Divider().overlay(Color.white.opacity(0.12))

            if data.isRestDay {
                Label("Your plan is clear today", systemImage: "moon.stars.fill")
                    .font(.system(.headline, design: .rounded).weight(.semibold))
                    .foregroundStyle(.white)
            } else if allDone || data.nextActionId == nil {
                Label("Every vote cast today", systemImage: "checkmark.seal.fill")
                    .font(.system(.headline, design: .rounded).weight(.semibold))
                    .foregroundStyle(.white)
            } else {
                VStack(alignment: .leading, spacing: 9) {
                    Text("NEXT SMALL VOTE")
                        .font(.system(.caption2, design: .rounded).weight(.bold))
                        .foregroundStyle(brandTextSecondary)
                    Text(data.nextActionTitle ?? "")
                        .font(.system(.title3, design: .rounded).weight(.bold))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                    HStack(spacing: 10) {
                        Button(intent: CastVoteIntent(actionId: data.nextActionId ?? "", isKickstart: false)) {
                            Label("Full vote", systemImage: "checkmark")
                                .font(.system(.subheadline, design: .rounded).weight(.bold))
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(brandAccent)
                        .foregroundStyle(brandBackground)
                        if let kickstart = data.nextActionKickstart, !kickstart.isEmpty {
                            Button(intent: CastVoteIntent(actionId: data.nextActionId ?? "", isKickstart: true)) {
                                Text("2 min: \(kickstart)")
                                    .font(.system(.subheadline, design: .rounded).weight(.semibold))
                                    .lineLimit(1)
                            }
                            .buttonStyle(.bordered)
                            .tint(brandAccent)
                        }
                    }
                }
            }

            Spacer(minLength: 0)

            if let remaining = data.remainingActions, remaining.count > 1 {
                Text("\(remaining.count - 1) more small \(remaining.count - 1 == 1 ? "vote" : "votes") after this")
                    .font(.system(.caption, design: .rounded))
                    .foregroundStyle(brandTextSecondary)
            }
        }
    }
}

struct CircularAccessoryView: View {
    let data: WidgetData

    var identityLabel: String {
        data.personaName.split(separator: " ").last.map(String.init) ?? "You"
    }

    var body: some View {
        Gauge(value: Double(data.completed), in: 0...Double(max(data.scheduled, 1))) {
            Text(identityLabel)
        } currentValueLabel: {
            Text("\(data.completed)/\(max(data.scheduled, 1))")
                .font(.system(.caption2, design: .rounded).weight(.bold))
        }
        .gaugeStyle(.accessoryCircularCapacity)
        .widgetLabel {
            Text(identityLabel)
        }
    }
}

struct EmptyStateView: View {
    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: "location.north.circle")
                .font(.title2)
                .foregroundStyle(brandAccent)
            Text("Open the app to start your journey")
                .font(.system(.caption2, design: .rounded))
                .foregroundStyle(brandTextSecondary)
                .multilineTextAlignment(.center)
        }
    }
}

struct ResolutionWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: VoteEntry

    var body: some View {
        Group {
            if let data = entry.data {
                switch family {
                case .accessoryCircular:
                    CircularAccessoryView(data: data)
                case .systemMedium:
                    MediumVoteView(data: data)
                case .systemLarge:
                    LargeVoteView(data: data)
                default:
                    SmallVoteView(data: data)
                }
            } else {
                EmptyStateView()
            }
        }
        .containerBackground(for: .widget) {
            brandBackground
        }
    }
}

struct ResolutionWidget: Widget {
    let kind: String = "ResolutionWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: VoteProvider()) { entry in
            ResolutionWidgetView(entry: entry)
        }
        .configurationDisplayName("Cast Your Vote")
        .description("Today's ring and your next small action — log it in one tap.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryCircular])
    }
}

@main
struct ResolutionWidgetBundle: WidgetBundle {
    var body: some Widget {
        ResolutionWidget()
    }
}
