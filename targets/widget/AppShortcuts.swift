import AppIntents
import WidgetKit

// "Hey Siri, log my kickstart" — parameterless voice logging of the next
// pending action. Shares the pendingVotes contract with CastVoteIntent
// (index.swift); the app reconciles queued votes on its next foreground.

struct LogKickstartIntent: AppIntent {
    static var title: LocalizedStringResource = "Log my kickstart"
    static var description = IntentDescription(
        "Log the 2-minute version of your next daily action in Resolution Companion."
    )

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let data = loadWidgetData() else {
            return .result(
                dialog: "Open Resolution Companion first to set up your plan."
            )
        }
        if data.isRestDay {
            return .result(
                dialog: "Nothing scheduled today — rest is part of becoming."
            )
        }
        guard let actionId = data.nextActionId, !actionId.isEmpty else {
            return .result(
                dialog: "Every vote is already cast today. Nicely done."
            )
        }

        enqueueVote(actionId: actionId, isKickstart: true, source: "siri")

        let remaining = max(data.scheduled - data.completed - 1, 0)
        let dialog: IntentDialog =
            remaining == 0
            ? "Done — every vote cast today for \(data.personaName)."
            : "Logged — a vote for \(data.personaName). \(remaining) to go."
        return .result(dialog: dialog)
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
        guard let before = loadWidgetData() else {
            return .result(
                dialog: "Open Resolution Companion first to set up your plan."
            )
        }
        enqueueVote(actionId: action.id, isKickstart: false, source: "siri")
        let remaining = max(before.scheduled - before.completed - 1, 0)
        let dialog: IntentDialog = remaining == 0
            ? "Done — every vote cast today for \(before.personaName)."
            : "Logged \(action.title) — \(remaining) to go."
        return .result(dialog: dialog)
    }
}

struct ResolutionShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: LogKickstartIntent(),
            phrases: [
                "Log my kickstart in \(.applicationName)",
                "I did my kickstart in \(.applicationName)",
                "Cast my vote in \(.applicationName)",
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
