import AppIntents
import WidgetKit

// "Hey Siri, log my kickstart": parameterless voice logging of the next
// pending action. Shares the pendingVotes contract with CastVoteIntent
// (index.swift); the app reconciles queued votes on its next foreground.

// Spoken replies stay short: Siri reads them aloud after every vote.
func loggedDialog(_ after: WidgetData?) -> IntentDialog {
    let remaining = after?.remainingCount ?? 0
    return remaining == 0 ? "Logged. All done today." : "Logged. \(remaining) to go."
}

let setUpDialog: IntentDialog = "Open Resolution Companion to set up your plan."

struct LogKickstartIntent: AppIntent {
    static var title: LocalizedStringResource = "Log my kickstart"
    static var description = IntentDescription(
        "Log the 2-minute version of your next daily action in Resolution Companion."
    )

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let data = loadWidgetData(), data.planIsSet else {
            return .result(dialog: setUpDialog)
        }
        // Same states the widget shows, so Siri never calls a day "rest"
        // when the plan has not started or the widget's schedule ran out.
        switch data.state {
        case .startsLater:
            return .result(dialog: "Your plan starts \(data.startDateText ?? "soon"). Nothing to log yet.")
        case .stale:
            return .result(dialog: "Open Resolution Companion to update today's plan.")
        case .rest:
            return .result(dialog: "Rest day. Nothing to log today.")
        case .done, .pending:
            break
        }
        guard let actionId = data.nextActionId, !actionId.isEmpty else {
            return .result(dialog: "Already done today.")
        }

        let after = enqueueVote(actionId: actionId, isKickstart: true, source: "siri")
        return .result(dialog: loggedDialog(after))
    }
}

struct ResolutionActionEntity: AppEntity, Identifiable {
    static var typeDisplayRepresentation = TypeDisplayRepresentation(
        name: "Resolution Companion action"
    )
    static var defaultQuery = ResolutionActionQuery()

    var id: String
    var title: String

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(title)")
    }
}

struct ResolutionActionQuery: EntityQuery {
    private func availableActions() -> [ResolutionActionEntity] {
        let actions = loadWidgetData()?.remainingActions ?? []
        return actions.map { action in
            ResolutionActionEntity(id: action.id, title: action.title)
        }
    }

    func entities(for identifiers: [String]) async throws -> [ResolutionActionEntity] {
        let ids = Set(identifiers)
        return availableActions().filter { ids.contains($0.id) }
    }

    func suggestedEntities() async throws -> [ResolutionActionEntity] {
        availableActions()
    }
}

struct LogNamedActionIntent: AppIntent {
    static var title: LocalizedStringResource = "Log a planned action"
    static var description = IntentDescription(
        "Mark one of today's Resolution Companion actions complete."
    )

    @Parameter(title: "Action") var action: ResolutionActionEntity

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let before = loadWidgetData(), before.planIsSet else {
            return .result(dialog: setUpDialog)
        }
        let wasPending = before.remainingActions?.contains(where: { $0.id == action.id })
            ?? (before.nextActionId == action.id)
        let after = enqueueVote(actionId: action.id, isKickstart: false, source: "siri")
        if !wasPending {
            return .result(dialog: "Already logged today.")
        }
        return .result(dialog: loggedDialog(after))
    }
}

struct ResolutionShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: LogKickstartIntent(),
            phrases: [
                "Log my kickstart in \(.applicationName)",
                "I did my kickstart in \(.applicationName)",
                "Take my next step in \(.applicationName)",
            ],
            shortTitle: "Log kickstart",
            systemImageName: "checkmark.circle"
        )
        AppShortcut(
            intent: LogNamedActionIntent(),
            phrases: [
                "Mark \(\.$action) done in \(.applicationName)",
                "Log \(\.$action) in \(.applicationName)",
            ],
            shortTitle: "Log an action",
            systemImageName: "checkmark.circle.fill"
        )
    }
}
