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

        let voteIntent = CastVoteIntent(actionId: actionId, isKickstart: true)
        _ = try await voteIntent.perform()

        let remaining = max(data.scheduled - data.completed - 1, 0)
        let dialog: IntentDialog =
            remaining == 0
            ? "Done — every vote cast today for \(data.personaName)."
            : "Logged — a vote for \(data.personaName). \(remaining) to go."
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
    }
}
