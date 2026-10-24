import WidgetKit
import SwiftUI
import AppIntents
import UserNotifications

// Shared contract with client/lib/widget.ts: the app writes `widgetData` as a
// JSON string into the app-group defaults; the widget's CastVoteIntent writes
// `pendingVotes` back, which the app consumes on next foreground. Keys and
// shapes must stay in sync with WIDGET_DATA_KEY / PENDING_VOTES_KEY there.
let kAppGroup = "group.com.resolutioncompanion.app"
let kWidgetDataKey = "widgetData"
let kPendingVotesKey = "pendingVotes"

// Asset-catalog colors carry light and dark variants matching
// client/constants/theme.ts (generated from expo-target.config.js).
let brandAccent = Color("$accent")
let brandBackground = Color("$widgetBackground")

struct WidgetActionData: Codable, Hashable {
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
    // Written by builds before the redesign. Still decoded so an old
    // snapshot parses, but no longer shown.
    var copyLine: String?
    var nextActionId: String?
    var nextActionTitle: String?
    var nextActionKickstart: String?
    var remainingActions: [WidgetActionData]?
    var dayPlans: [WidgetDayPlan]?
    // Added with the redesign; optional so older snapshots still decode.
    var hasPlan: Bool?
    var planDay: Int?
    var shieldUsed: Bool?
    var progressLine: String?
    // Local YYYY-MM-DD the plan starts; later than `date` for a plan set up
    // ahead of time. Absent in snapshots from builds before it was written.
    var planStart: String?
    // Set only by the widget's own rollover, never by the app: today is past
    // the seven-day plan the app last wrote, so the schedule is unknown.
    var isStale: Bool?

    // Older snapshots predate hasPlan and were only written with a plan.
    var planIsSet: Bool { hasPlan ?? true }

    /// A plan set up ahead of time (for January 1) has nothing scheduled
    /// before its start, which must not read as a rest day. Keys are
    /// YYYY-MM-DD, so string order is date order.
    var startsLater: Bool {
        guard let start = planStart else { return false }
        return date < start
    }

    var state: DayState {
        if startsLater { return .startsLater }
        if isStale ?? false { return .stale }
        if isRestDay { return .rest }
        if allDone || nextActionId == nil { return .done }
        return .pending
    }

    /// "Jan 1", in the person's locale.
    var startDateText: String? {
        guard let start = planStart, let day = dateFromKey(start) else { return nil }
        return day.formatted(.dateTime.month(.abbreviated).day())
    }

    var startsText: String {
        startDateText.map { "Starts \($0)" } ?? "Starts soon"
    }

    /// The first habit of the plan, when the start falls inside the saved
    /// seven-day plan.
    var firstPlannedTitle: String? {
        guard let start = planStart else { return nil }
        return dayPlans?
            .filter { $0.date >= start && !$0.actions.isEmpty }
            .min(by: { $0.date < $1.date })?
            .actions.first?.title
    }

    /// Headline for every state except a pending habit.
    var stateHeadline: String {
        switch state {
        case .startsLater: return startsText
        case .stale: return "Open to update"
        case .rest: return "Rest day"
        case .done, .pending: return "Done today"
        }
    }

    /// Second line under the headline, nil when there is nothing true to say.
    var stateCaption: String? {
        switch state {
        case .startsLater:
            return personaName.isEmpty ? nil : "Becoming \(personaName)"
        case .stale:
            return "Today's plan needs the app"
        case .rest, .done, .pending:
            return streakText
        }
    }

    var allDone: Bool { scheduled > 0 && completed >= scheduled }

    var remainingCount: Int { max(scheduled - completed, 0) }

    /// Today's streak wording: "12-day streak", "Protected", or "Day N".
    var streakText: String? {
        streakPhrase(streak: streak, shieldUsed: shieldUsed ?? false, planDay: planDay)
    }

    /// The app's line when present; rebuilt only for snapshots that lack it.
    var displayProgressLine: String {
        if let line = progressLine, !line.isEmpty { return line }
        if isRestDay { return streakText ?? "" }
        return makeProgressLine(
            completed: completed,
            scheduled: scheduled,
            streak: streak,
            shieldUsed: shieldUsed ?? false,
            planDay: planDay
        )
    }

    /// Today's habits in plan order, each with whether it is still pending.
    /// Falls back to the pending list for snapshots without a day plan.
    var todayRows: [HabitRow] {
        let pending = remainingActions ?? []
        let pendingIds = Set(pending.map { $0.id })
        guard let plan = dayPlans?.first(where: { $0.date == date }), !plan.actions.isEmpty else {
            return pending.map { HabitRow(action: $0, pending: true) }
        }
        return plan.actions.map { HabitRow(action: $0, pending: pendingIds.contains($0.id)) }
    }
}

enum DayState {
    case startsLater, stale, rest, done, pending
}

struct HabitRow: Identifiable {
    let action: WidgetActionData
    let pending: Bool
    var id: String { action.id }
}

// Mirrors buildTodayProgressLine in client/lib/today-layout.ts (without the
// month percentage) so a line rebuilt here after a tap or at midnight reads
// exactly like the one the app writes.
func streakPhrase(streak: Int, shieldUsed: Bool, planDay: Int?) -> String? {
    if streak > 0 {
        return shieldUsed ? "\(streak)-day streak (protected)" : "\(streak)-day streak"
    }
    if shieldUsed { return "Protected" }
    if let planDay { return "Day \(planDay)" }
    return nil
}

func makeProgressLine(
    completed: Int,
    scheduled: Int,
    streak: Int,
    shieldUsed: Bool,
    planDay: Int?
) -> String {
    [
        "\(completed)/\(scheduled) done",
        streakPhrase(streak: streak, shieldUsed: shieldUsed, planDay: planDay),
    ]
    .compactMap { $0 }
    .joined(separator: " · ")
}

// Gregorian and POSIX so the key matches the app's YYYY-MM-DD even when the
// person's calendar is Buddhist or Japanese; otherwise every load would look
// like a new day. Built per call because intents can run concurrently and a
// shared formatter is not thread-safe.
func makeDateKeyFormatter() -> DateFormatter {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = .current
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter
}

func localDateString(_ date: Date = Date()) -> String {
    makeDateKeyFormatter().string(from: date)
}

func dateFromKey(_ key: String) -> Date? {
    makeDateKeyFormatter().date(from: key)
}

func daysBetween(_ fromKey: String, _ toKey: String) -> Int? {
    guard
        let from = dateFromKey(fromKey),
        let to = dateFromKey(toKey)
    else { return nil }
    let calendar = Calendar.current
    return calendar.dateComponents(
        [.day],
        from: calendar.startOfDay(for: from),
        to: calendar.startOfDay(for: to)
    ).day
}

/// A snapshot from an earlier day describes yesterday: rebuild today from
/// the seven-day plan instead of showing stale counts.
func rolledOver(_ d: WidgetData, to today: String) -> WidgetData {
    let actions = d.dayPlans?.first(where: { $0.date == today })?.actions ?? []
    let elapsed = daysBetween(d.date, today) ?? 0
    // The app writes seven days ahead. Past that, an empty day means "not
    // known", not "rest day", so the widget asks to be opened instead.
    let planHorizonEnd = d.dayPlans?.map(\.date).max()
    let beyondHorizon = planHorizonEnd.map { today > $0 } ?? (elapsed >= 7)

    // The streak survives only if the saved day was finished (or a rest day)
    // and every day since was a rest day in the plan. Otherwise the app may
    // have broken or shield-protected it, which the widget cannot know, so it
    // shows the plan day until the app syncs rather than claim a streak.
    let savedDayHeld = d.isRestDay || d.allDone
    let gapDaysRested = elapsed >= 1 && (1..<elapsed).allSatisfy { offset in
        guard let gap = Calendar.current.date(
            byAdding: .day,
            value: offset,
            to: dateFromKey(d.date) ?? Date()
        ) else { return false }
        let key = localDateString(gap)
        guard let plan = d.dayPlans?.first(where: { $0.date == key }) else { return false }
        return plan.actions.isEmpty
    }
    let keepStreak = savedDayHeld && gapDaysRested
    let streak = keepStreak ? d.streak : 0
    let shieldUsed = keepStreak ? (d.shieldUsed ?? false) : false
    // Counting from the real start keeps a future-start plan at Day 1 on its
    // first day; adding elapsed days to the clamped pre-start Day 1 would
    // read "Day 5" on January 1 for a plan saved December 28.
    let planDay = d.planStart
        .flatMap { daysBetween($0, today) }
        .map { max(1, $0 + 1) }
        ?? d.planDay.map { $0 + max(elapsed, 0) }
    let isRestDay = actions.isEmpty
    let next = actions.first

    var data = d
    data.date = today
    data.scheduled = actions.count
    data.completed = 0
    data.streak = streak
    data.shieldUsed = shieldUsed
    data.planDay = planDay
    data.isRestDay = isRestDay
    data.nextActionId = next?.id
    data.nextActionTitle = next?.title
    data.nextActionKickstart = next?.kickstart
    data.remainingActions = actions
    // Sticky until the app writes a fresh snapshot, because a Siri vote can
    // save this rolled-over copy with today's date.
    data.isStale = (d.isStale ?? false) || beyondHorizon
    data.progressLine = isRestDay
        ? (streakPhrase(streak: streak, shieldUsed: shieldUsed, planDay: planDay) ?? "")
        : makeProgressLine(
            completed: 0,
            scheduled: actions.count,
            streak: streak,
            shieldUsed: shieldUsed,
            planDay: planDay
        )
    return data
}

func loadWidgetData() -> WidgetData? {
    guard
        let raw = UserDefaults(suiteName: kAppGroup)?.string(forKey: kWidgetDataKey),
        let data = raw.data(using: .utf8),
        let decoded = try? JSONDecoder().decode(WidgetData.self, from: data)
    else { return nil }
    let today = localDateString()
    if decoded.planIsSet && decoded.date != today {
        return rolledOver(decoded, to: today)
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
/// The app reschedules reminders only when it next opens, so a habit voted
/// here would still buzz at its own reminder time. Removes today's pending
/// habit reminders whose habits are all voted (a combined slot stays until
/// every habit in it is). Matches the `habit-reminder` data that
/// client/lib/notifications.ts schedules; expo stores a local
/// notification's data directly in userInfo.
func clearVotedHabitReminders() async {
    let today = localDateString()
    let defaults = UserDefaults(suiteName: kAppGroup)
    guard let raw = defaults?.string(forKey: kPendingVotesKey),
          let data = raw.data(using: .utf8),
          let votes = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
    else { return }
    let voted = Set(votes.compactMap { vote -> String? in
        vote["date"] as? String == today ? vote["actionId"] as? String : nil
    })
    guard !voted.isEmpty else { return }

    let center = UNUserNotificationCenter.current()
    let ids = await center.pendingNotificationRequests().compactMap { request -> String? in
        let info = request.content.userInfo
        guard info["type"] as? String == "habit-reminder",
              info["dateKey"] as? String == today,
              let actionIds = info["actionIds"] as? [String],
              !actionIds.isEmpty,
              actionIds.allSatisfy(voted.contains)
        else { return nil }
        return request.identifier
    }
    if !ids.isEmpty {
        center.removePendingNotificationRequests(withIdentifiers: ids)
    }
}

func enqueueVote(
    actionId: String,
    isKickstart: Bool,
    source: String
) -> WidgetData? {
    guard !actionId.isEmpty else { return loadWidgetData() }
    let defaults = UserDefaults(suiteName: kAppGroup)

    // The vote is always queued (the app dedupes per action and day), but
    // the optimistic count below only moves when this tap actually cleared a
    // pending action, so a quick double tap cannot overcount.
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
    var removed = false
    if var remaining = data.remainingActions {
        let before = remaining.count
        remaining.removeAll(where: { $0.id == actionId })
        removed = remaining.count < before
        data.remainingActions = remaining
        let next = remaining.first
        data.nextActionId = next?.id
        data.nextActionTitle = next?.title
        data.nextActionKickstart = next?.kickstart
    } else if data.nextActionId == actionId {
        removed = true
        data.nextActionId = nil
        data.nextActionTitle = nil
        data.nextActionKickstart = nil
    }
    if removed {
        data.completed = min(data.completed + 1, data.scheduled)
        // The app counts today into the streak once the day is complete.
        if data.allDone {
            data.streak += 1
        }
        data.progressLine = makeProgressLine(
            completed: data.completed,
            scheduled: data.scheduled,
            streak: data.streak,
            shieldUsed: data.shieldUsed ?? false,
            planDay: data.planDay
        )
    }
    saveWidgetData(data)
    WidgetCenter.shared.reloadAllTimelines()
    return data
}

// MARK: - App Intent (interactive logging without opening the app)

struct CastVoteIntent: AppIntent {
    static var title: LocalizedStringResource = "Complete today's action"
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
        await clearVotedHabitReminders()
        return .result()
    }
}

// MARK: - Timeline

struct VoteEntry: TimelineEntry {
    let date: Date
    let data: WidgetData?
}

// Gallery and placeholder content shaped like a real day, so the preview
// shows what the widget will actually look like.
enum SampleData {
    static let walk = WidgetActionData(id: "sample-walk", title: "Walk 10 minutes", kickstart: "Put on your shoes")
    static let stretch = WidgetActionData(id: "sample-stretch", title: "Stretch before bed", kickstart: "One stretch")
    static let read = WidgetActionData(id: "sample-read", title: "Read 5 pages", kickstart: "Open the book")

    static func day(
        actions: [WidgetActionData],
        pending: [WidgetActionData],
        streak: Int = 5,
        planDay: Int = 9,
        hasPlan: Bool = true,
        planStart: String? = nil,
        isStale: Bool? = nil
    ) -> WidgetData {
        let today = localDateString()
        let completed = actions.count - pending.count
        let next = pending.first
        let isRestDay = actions.isEmpty
        return WidgetData(
            personaName: "Steady Walker",
            date: today,
            scheduled: actions.count,
            completed: completed,
            streak: streak,
            isRestDay: isRestDay,
            copyLine: nil,
            nextActionId: next?.id,
            nextActionTitle: next?.title,
            nextActionKickstart: next?.kickstart,
            remainingActions: pending,
            dayPlans: [WidgetDayPlan(date: today, actions: actions)],
            hasPlan: hasPlan,
            planDay: planDay,
            shieldUsed: false,
            progressLine: isRestDay
                ? streakPhrase(streak: streak, shieldUsed: false, planDay: planDay)
                : makeProgressLine(
                    completed: completed,
                    scheduled: actions.count,
                    streak: streak,
                    shieldUsed: false,
                    planDay: planDay
                ),
            planStart: planStart,
            isStale: isStale
        )
    }

    /// "Walk 10 minutes", "1/2 done · 5-day streak"
    static let pending = day(actions: [stretch, walk], pending: [walk])
    static let threeHabits = day(actions: [walk, stretch, read], pending: [walk, read])
    static let allDone = day(actions: [stretch, walk], pending: [], streak: 6)
    static let restDay = day(actions: [], pending: [])
    static let firstDay = day(actions: [walk], pending: [walk], streak: 0, planDay: 1)
    static let startsLater = day(
        actions: [],
        pending: [],
        streak: 0,
        planDay: 1,
        planStart: localDateString(Calendar.current.date(byAdding: .day, value: 3, to: Date()) ?? Date())
    )
    static let stale = day(actions: [], pending: [], streak: 0, isStale: true)
    static let noPlan = WidgetData(
        personaName: "",
        date: localDateString(),
        scheduled: 0,
        completed: 0,
        streak: 0,
        isRestDay: false,
        hasPlan: false
    )
}

struct VoteProvider: TimelineProvider {
    func placeholder(in context: Context) -> VoteEntry {
        VoteEntry(date: Date(), data: SampleData.pending)
    }

    func getSnapshot(in context: Context, completion: @escaping (VoteEntry) -> Void) {
        // The gallery shows the sample day until a plan exists, so the
        // preview is never the set-up prompt.
        let saved = loadWidgetData()
        let data = (context.isPreview && saved?.planIsSet != true) ? SampleData.pending : saved
        completion(VoteEntry(date: Date(), data: data ?? SampleData.pending))
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

// MARK: - Shared pieces

struct ProgressRing: View {
    let completed: Int
    let scheduled: Int
    var lineWidth: CGFloat = 4

    var fraction: Double {
        scheduled > 0 ? min(Double(completed) / Double(scheduled), 1.0) : 0
    }

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.primary.opacity(0.15), lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: fraction)
                .stroke(
                    brandAccent,
                    style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .widgetAccentable()
        }
        .accessibilityElement()
        .accessibilityLabel("\(completed) of \(scheduled) done")
    }
}

/// The one accent element on medium and large: a 44pt+ circular check that
/// logs the habit without opening the app.
struct CheckButton: View {
    @Environment(\.widgetRenderingMode) var renderingMode
    let actionId: String
    let title: String
    var size: CGFloat = 48

    var body: some View {
        Button(intent: CastVoteIntent(actionId: actionId, isKickstart: false)) {
            ZStack {
                if renderingMode == .fullColor {
                    Circle().fill(brandAccent)
                    // The background color is white in light and black in
                    // dark, the contrasting ink on each accent variant.
                    Image(systemName: "checkmark")
                        .font(.system(size: size * 0.4, weight: .bold))
                        .foregroundStyle(brandBackground)
                } else {
                    // Tinted and clear modes recolor everything, so a filled
                    // circle with dark ink would lose its glyph; draw an
                    // outline in the system's tint instead.
                    Circle().strokeBorder(lineWidth: 2)
                    Image(systemName: "checkmark")
                        .font(.system(size: size * 0.4, weight: .bold))
                }
            }
            .frame(width: size, height: size)
            .widgetAccentable()
            .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Mark complete")
        .accessibilityHint(title)
    }
}

/// Secondary text link that logs the 2-minute version.
struct KickstartLink: View {
    let actionId: String
    let kickstart: String

    var body: some View {
        Button(intent: CastVoteIntent(actionId: actionId, isKickstart: true)) {
            Text("2-minute version")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .underline()
                .frame(minHeight: 28, alignment: .leading)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Log the 2-minute version: \(kickstart)")
    }
}

/// Static marker for a finished habit or day; not tappable. A bare check, no
/// circle: the filled accent circle is the tappable CheckButton, and a
/// circled check here read as the same control.
struct DoneMark: View {
    var size: CGFloat = 22

    var body: some View {
        Image(systemName: "checkmark")
            .font(.system(size: size * 0.7, weight: .bold))
            .foregroundStyle(.secondary)
            .frame(width: size, height: size)
            .accessibilityLabel("Done")
    }
}

struct NoPlanView: View {
    /// Medium has room to spare vertically; pinned to the top the one line
    /// left an empty band below it.
    var centered = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Open to set up your plan")
                .font(.headline)
                .foregroundStyle(.primary)
            if !centered { Spacer(minLength: 0) }
        }
        .frame(
            maxWidth: .infinity,
            maxHeight: .infinity,
            alignment: centered ? .leading : .topLeading
        )
    }
}

/// Trailing glyph for every state except a pending habit.
struct StateIcon: View {
    let state: DayState
    var size: CGFloat = 22

    var body: some View {
        switch state {
        case .done, .pending:
            DoneMark(size: size)
        case .rest:
            symbol("moon.fill")
        case .startsLater:
            symbol("calendar")
        case .stale:
            symbol("arrow.clockwise")
        }
    }

    // Drawn at about DoneMark's glyph size so every trailing state icon
    // matches optically.
    func symbol(_ name: String) -> some View {
        Image(systemName: name)
            .font(.system(size: size * 0.68))
            .foregroundStyle(.secondary)
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

/// Headline and caption for every state except a pending habit.
struct DayStateHeadline: View {
    let data: WidgetData

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(data.stateHeadline)
                .font(.headline)
                .foregroundStyle(.primary)
                .lineLimit(2)
            if let caption = data.stateCaption {
                Text(caption)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
    }
}

// MARK: - Home screen

struct SmallVoteView: View {
    let data: WidgetData

    var body: some View {
        let pending = data.state == .pending
        // Headline pinned top, caption pinned bottom: the small tile is
        // square, so splitting the two fills it evenly at any text length.
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .top, spacing: 6) {
                Text(pending ? (data.nextActionTitle ?? "") : data.stateHeadline)
                    .font(.headline)
                    .foregroundStyle(.primary)
                    .lineLimit(3)
                    .minimumScaleFactor(0.9)
                Spacer(minLength: 0)
                if pending {
                    ProgressRing(completed: data.completed, scheduled: data.scheduled, lineWidth: 3.5)
                        .frame(width: 22, height: 22)
                } else {
                    StateIcon(state: data.state, size: 22)
                }
            }
            Spacer(minLength: 0)
            Text(pending ? data.displayProgressLine : (data.stateCaption ?? ""))
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct MediumVoteView: View {
    let data: WidgetData

    var hasKickstart: Bool {
        !(data.nextActionKickstart ?? "").isEmpty && data.nextActionId != nil
    }

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            if data.state == .pending {
                VStack(alignment: .leading, spacing: 4) {
                    Text(data.nextActionTitle ?? "")
                        .font(.headline)
                        .foregroundStyle(.primary)
                        .lineLimit(2)
                    Text(data.displayProgressLine)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    if hasKickstart, let kickstart = data.nextActionKickstart,
                       let id = data.nextActionId {
                        KickstartLink(actionId: id, kickstart: kickstart)
                    }
                }
                // The link's 28pt tap frame centers its text, leaving blank
                // space under the underline; matching it on top keeps the
                // visible text centered beside the check.
                .padding(.top, hasKickstart ? 5 : 0)
                Spacer(minLength: 0)
                CheckButton(
                    actionId: data.nextActionId ?? "",
                    title: data.nextActionTitle ?? "",
                    size: 52
                )
            } else {
                DayStateHeadline(data: data)
                Spacer(minLength: 0)
                StateIcon(state: data.state, size: 44)
            }
        }
        // Fill the content area so the block is centered vertically in the
        // widget rather than placed at its intrinsic height.
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

struct LargeVoteView: View {
    let data: WidgetData

    // Up to three rows. When there are more, pending habits come first so
    // the rows shown are the ones still worth a tap.
    var rows: [HabitRow] {
        let all = data.todayRows
        if all.count <= 3 { return all }
        return Array((all.filter { $0.pending } + all.filter { !$0.pending }).prefix(3))
    }

    var firstPendingId: String? { rows.first(where: { $0.pending })?.id }

    var showsRows: Bool {
        (data.state == .pending || data.state == .done) && !rows.isEmpty
    }

    /// Under the centered headline. Before the start the header already
    /// names the persona, so the first habit is the more useful line.
    var centeredCaption: String? {
        if data.state == .startsLater {
            return data.firstPlannedTitle.map { "First up: \($0)" }
        }
        return data.stateCaption
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Becoming \(data.personaName)")
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)

            if showsRows {
                VStack(alignment: .leading, spacing: 2) {
                    Text(data.allDone ? "Done today" : data.displayProgressLine)
                        .font(data.allDone ? .headline : .subheadline)
                        .foregroundStyle(data.allDone ? HierarchicalShapeStyle.primary : .secondary)
                        .lineLimit(1)
                    if data.allDone, let streak = data.streakText {
                        Text(streak)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }

                VStack(alignment: .leading, spacing: 10) {
                    ForEach(rows) { row in
                        HStack(alignment: .center, spacing: 12) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(row.action.title)
                                    .font(.headline)
                                    .foregroundStyle(row.pending ? HierarchicalShapeStyle.primary : .secondary)
                                    .lineLimit(2)
                                if row.pending, row.action.id == firstPendingId, !row.action.kickstart.isEmpty {
                                    KickstartLink(actionId: row.action.id, kickstart: row.action.kickstart)
                                }
                            }
                            Spacer(minLength: 0)
                            if row.pending {
                                CheckButton(actionId: row.action.id, title: row.action.title, size: 46)
                            } else {
                                DoneMark(size: 28)
                                    .frame(width: 46, height: 46)
                            }
                        }
                    }
                }

                // A checklist reads top-down like Reminders; the rows stay
                // under their header and the slack goes below.
                Spacer(minLength: 0)
            } else {
                // Nothing to list: a lone header line over an empty tile read
                // as unfinished, so the state sits centered in the space.
                Spacer(minLength: 0)
                VStack(spacing: 8) {
                    StateIcon(state: data.state, size: 44)
                    Text(data.stateHeadline)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(.primary)
                    if let caption = centeredCaption {
                        Text(caption)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                }
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

// MARK: - Lock Screen

struct CircularAccessoryView: View {
    let data: WidgetData

    func glyph(_ name: String, label: String) -> some View {
        ZStack {
            AccessoryWidgetBackground()
            Image(systemName: name)
                .font(.title3)
        }
        .accessibilityElement()
        .accessibilityLabel(label)
    }

    var body: some View {
        if !data.planIsSet {
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: "plus")
                    .font(.title3.weight(.semibold))
            }
            .accessibilityLabel("Set up your plan")
        } else if data.state == .startsLater {
            glyph("calendar", label: data.startsText)
        } else if data.state == .stale {
            glyph("arrow.clockwise", label: "Open to update")
        } else if data.state == .rest {
            glyph("moon.fill", label: "Rest day")
        } else {
            Gauge(value: Double(data.completed), in: 0...Double(max(data.scheduled, 1))) {
                Text("Today")
            } currentValueLabel: {
                if data.allDone {
                    Image(systemName: "checkmark")
                        .font(.body.weight(.bold))
                } else {
                    Text("\(data.completed)/\(data.scheduled)")
                        .font(.caption.weight(.bold))
                }
            }
            .gaugeStyle(.accessoryCircularCapacity)
            .widgetAccentable()
            .accessibilityLabel(data.allDone ? "Done today" : "\(data.completed) of \(data.scheduled) done")
        }
    }
}

struct RectangularAccessoryView: View {
    let data: WidgetData

    @ViewBuilder
    var summary: some View {
        VStack(alignment: .leading, spacing: 1) {
            if !data.planIsSet {
                Text("Resolution Companion")
                    .font(.headline)
                Text("Open to set up your plan")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else if data.state != .pending {
                Text(data.stateHeadline)
                    .font(.headline)
                    .lineLimit(1)
                if let caption = data.stateCaption {
                    Text(caption)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            } else {
                // No leading circle: this widget opens Today rather than
                // logging, so a checkbox glyph promised a tap it can't keep.
                Text(data.nextActionTitle ?? "")
                    .font(.headline)
                    .lineLimit(1)
                Text(data.displayProgressLine)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    var body: some View {
        // Deliberately not a check-off button: Lock Screen widgets get brushed
        // in pockets and on raise-to-wake, and a vote the user did not cast
        // breaks the honest streak. Tapping opens Today via the widget URL.
        summary
    }
}

struct InlineAccessoryView: View {
    let data: WidgetData

    var text: String {
        if !data.planIsSet { return "Set up your plan" }
        switch data.state {
        case .startsLater, .stale, .rest:
            return data.stateHeadline
        case .done:
            return "\(data.completed)/\(data.scheduled) · Done today"
        case .pending:
            return "\(data.completed)/\(data.scheduled) · \(data.nextActionTitle ?? "")"
        }
    }

    var body: some View {
        Text(text)
    }
}

// MARK: - Root

struct ResolutionWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: VoteEntry

    var isAccessory: Bool {
        family == .accessoryCircular || family == .accessoryRectangular || family == .accessoryInline
    }

    @ViewBuilder
    var content: some View {
        let data = entry.data ?? SampleData.noPlan
        switch family {
        case .accessoryCircular:
            CircularAccessoryView(data: data)
        case .accessoryRectangular:
            RectangularAccessoryView(data: data)
        case .accessoryInline:
            InlineAccessoryView(data: data)
        default:
            if !data.planIsSet {
                NoPlanView(centered: family == .systemMedium)
            } else {
                switch family {
                case .systemMedium:
                    MediumVoteView(data: data)
                case .systemLarge:
                    LargeVoteView(data: data)
                default:
                    SmallVoteView(data: data)
                }
            }
        }
    }

    var body: some View {
        content
            .containerBackground(for: .widget) {
                // Lock Screen families draw on the wallpaper; a fill there
                // would read as a solid black or white tile.
                if isAccessory { Color.clear } else { brandBackground }
            }
            // Body taps (outside the intent buttons) open the app on Today
            .widgetURL(URL(string: "resolutioncompanion://today"))
    }
}

struct ResolutionWidget: Widget {
    let kind: String = "ResolutionWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: VoteProvider()) { entry in
            ResolutionWidgetView(entry: entry)
        }
        .configurationDisplayName("Take the Next Step")
        .description("See today's habit and check it off in one tap.")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .systemLarge,
            .accessoryCircular,
            .accessoryRectangular,
            .accessoryInline,
        ])
    }
}

@main
struct ResolutionWidgetBundle: WidgetBundle {
    var body: some Widget {
        ResolutionWidget()
    }
}

// MARK: - Previews

#Preview("Small", as: .systemSmall) {
    ResolutionWidget()
} timeline: {
    VoteEntry(date: .now, data: SampleData.pending)
    VoteEntry(date: .now, data: SampleData.firstDay)
    VoteEntry(date: .now, data: SampleData.allDone)
    VoteEntry(date: .now, data: SampleData.restDay)
    VoteEntry(date: .now, data: SampleData.startsLater)
    VoteEntry(date: .now, data: SampleData.stale)
    VoteEntry(date: .now, data: SampleData.noPlan)
}

#Preview("Medium", as: .systemMedium) {
    ResolutionWidget()
} timeline: {
    VoteEntry(date: .now, data: SampleData.pending)
    VoteEntry(date: .now, data: SampleData.allDone)
    VoteEntry(date: .now, data: SampleData.restDay)
    VoteEntry(date: .now, data: SampleData.startsLater)
    VoteEntry(date: .now, data: SampleData.stale)
    VoteEntry(date: .now, data: SampleData.noPlan)
}

#Preview("Large", as: .systemLarge) {
    ResolutionWidget()
} timeline: {
    VoteEntry(date: .now, data: SampleData.threeHabits)
    VoteEntry(date: .now, data: SampleData.allDone)
    VoteEntry(date: .now, data: SampleData.restDay)
    VoteEntry(date: .now, data: SampleData.startsLater)
}

#Preview("Circular", as: .accessoryCircular) {
    ResolutionWidget()
} timeline: {
    VoteEntry(date: .now, data: SampleData.pending)
    VoteEntry(date: .now, data: SampleData.allDone)
    VoteEntry(date: .now, data: SampleData.restDay)
}

#Preview("Rectangular", as: .accessoryRectangular) {
    ResolutionWidget()
} timeline: {
    VoteEntry(date: .now, data: SampleData.pending)
    VoteEntry(date: .now, data: SampleData.allDone)
    VoteEntry(date: .now, data: SampleData.startsLater)
    VoteEntry(date: .now, data: SampleData.stale)
}

#Preview("Inline", as: .accessoryInline) {
    ResolutionWidget()
} timeline: {
    VoteEntry(date: .now, data: SampleData.pending)
    VoteEntry(date: .now, data: SampleData.restDay)
}
