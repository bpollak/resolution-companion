# UX improvements: implementation and validation

September 5, 2026 · Local branch `codex/ux-review-improvements` · Base `2988352`

The nine priorities from the [UX review](ux-agent-review-2026-09-05.md) are implemented locally for **1.4.0**. The app and server changes have not been deployed or submitted to a store.

## Changes

| Review priority | Result |
| --- | --- |
| Premium accuracy | Removed the obsolete Pattern discoveries benefit. Quota copy reflects remaining check-ins and the next calendar-month reset. A check-in is explained as one conversation including follow-up messages. |
| Small-version completion | Pending actions offer full completion and an explicit “I did the 2-minute version” alternative. Small-version logging keeps its badge and equal credit; undo works. |
| Tomorrow navigation | Today passes an explicit local-calendar date to Journey, which selects the day and month and scrolls to the details. Future days show a read-only preview. Ordinary tab switches preserve the selected date. |
| Plan approval | Both setup paths lead to an editable review before creating recurring habits. One habit is enough; extras are optional. Identity, action, milestone, weekdays, small version, and anchor are editable. |
| Shorter onboarding | One choice screen offers Coach or direct local setup. The local path needs no AI consent or network. Conversations and draft edits can be resumed. Approval preserves chosen weekdays, including a rest day on the day of setup. |
| Coach recovery | Inline waiting/responding status, Stop, Retry, and a pinned Stop & save control support recovery. Available partial replies are labeled and saved. Stale callbacks cannot replace a stopped reply; retry does not duplicate the prompt. |
| Today focus | Progress statistics are expandable. Repeated framing and date/count rows were removed. Completion controls precede the action’s small-version instructions. |
| Journey adjustments | Journey prioritizes one rhythm, expands the rest on demand, and opens the matching action editor. It names the four-week observation window and uses neutral wording for sparse history. Guidance sits beside milestones. |
| Calendar differentiation | Complete, partial, missed, rest, and shielded days use distinct symbols with a matching legend and accessible date/count labels. History excludes days before the action existed. |

## Safeguards and compatibility

Drafts create no personas, milestones, or actions until approval. Stable draft IDs make approval retryable while preserving other personas and logs. Retry reconciles partially persisted actions even if their milestone write failed, including a habit deselected after the failed attempt. AsyncStorage is not treated as a cross-key database transaction. Habit history starts on approval.

Action and milestone editors prevent deletion of the persona’s last action. The milestone mutator also checks the current stored plan before cascading a deletion.

The local server extraction schema now accepts **1–5 suggestions**. The currently deployed server still returns three; the new client accepts that response and leaves extra suggestions unselected. Server deployment is needed to enable the new proposal-count contract. Legacy stored plans remain supported.

Completed Coach conversations count once. Failed or stopped requests do not consume a check-in, and weekly reviews remain available at the free limit. Existing native tab safeguards and purchase/entitlement behavior remain intact.

## Automated validation

Validated with Node 22 in a resident local source/dependency copy because iCloud offloaded workspace files. Dependency versions were unchanged.

- **40 Jest suites / 278 tests passed**, with Pacific time enforced.
- TypeScript, lint, and static accessibility checks passed.
- Server build and changed-server-file formatting passed.
- Diff whitespace check passed; release-note validation passed for the 1.4.0 draft.

New behavioral coverage includes plan approval and exact schedules, unrelated-data preservation, partial writes and retries, approval timestamps, last-action milestone protection across personas, quota counts at 0/7/9/10, month/year/DST navigation boundaries, Coach stop/retry/late callbacks, and server proposal counts of 1/3/5 with 6 rejected.

Four Maestro flow definitions were updated and syntax-checked. They were not executed in this pass.

## Native validation

A full local EAS iOS simulator compile succeeded. Final JavaScript was then rebuilt as Hermes bytecode against the same native binary and dependencies, ad-hoc signed, reinstalled, and checked again. The actual artifact metadata is **1.4.0 / build 87**. It is a simulator artifact, not an App Store submission build.

Dedicated **iPhone 17** and **iPhone 17e** simulators, both iOS 26.5, used synthetic test data. Existing user simulators and data were preserved.

| Scenario | Observed result |
| --- | --- |
| Local setup | Draft edits survived a full restart. Zero selected habits blocked approval. One selected habit saved without adding Saturday; Today showed a rest day. |
| Daily loop | Journey adjustment opened the matching action. After Saturday was explicitly selected, full completion, undo, and small-version completion worked. Its badge and 1/1 count persisted across updates. |
| Tomorrow | September 6 was selected and brought into view. Preview showed the action, small version, and anchor without completion controls. A manually selected September 8 persisted across ordinary tab switches. |
| Calendar | Dark-mode complete/rest/selected symbols and legend were inspected. Dates before plan approval showed no scheduled actions. |
| Coach | A stopped session saved 875 partial-response characters with no check-in used. A later Stop → Retry → Save run stored one user message and one assistant reply, with no duplicate history. That retried reply completed before Save and used exactly one check-in. Stop & save stayed visible in a horizontal header during streaming. |
| Premium | The obsolete benefit was absent. Native screens showed 10, 9, and 8 remaining check-ins as completed sessions accumulated. No purchase was attempted. |
| AI setup | The first plan proposal failed; the conversation and Retry remained available. Retry succeeded against the live service. Only the first of three suggestions was selected. Approval saved exactly one persona, milestone, and action on Monday/Wednesday/Friday, confirmed in storage and Journey. Saturday remained a rest day. |
| Editor safeguard | Both deletion of the sole action and deletion of its milestone were disabled, with an explanation. |
| Final reinstall | The final bundle reopened the approved weekday-only plan correctly on iPhone 17e. |

## Evidence and artifact

- [Today completion controls](../build/ux-implementation-2026-09-05/03-today-action-visible.png)
- [Tomorrow preview](../build/ux-implementation-2026-09-05/04-tomorrow-preview.png)
- [Calendar symbols](../build/ux-implementation-2026-09-05/05-calendar-symbols.png)
- [Coach retry and pinned header](../build/ux-implementation-2026-09-05/07-coach-retry-sticky-header.png)
- [Milestone deletion protection](../build/ux-implementation-2026-09-05/08-milestone-delete-protection.png)
- [AI-approved rest day after final reinstall](../build/ux-implementation-2026-09-05/09-ai-onboarding-approved-rest-day.png)
- [Saved partial-session evidence](../build/ux-implementation-2026-09-05/coach-partial-save.json) and [retry evidence](../build/ux-implementation-2026-09-05/coach-retry-save.json)
- [Source checksums](../build/ux-implementation-2026-09-05/source-manifest.json) and [implementation patch](../build/ux-implementation-2026-09-05/implementation.patch)

[Verified simulator archive](../build/ios-sim-ux-verified.tar.gz) SHA-256:

`85c7d11f61489d38f390956ddd08e263287abdca2795525aa54a976f62e1352a`

All 39 changed/new source and QA files were checked against the workspace. Git stalled on offloaded metadata in the original checkout, so the final diff and backup patch were produced against a resident copy of the exact starting commit. No commit or push was made.

## Remaining release checks

This was a code and simulator review, not a real-user study. Activation, speed, retention, and conversion improvements have not been measured.

The new server proposal-count contract is tested locally but not deployed. Native AI checks used the existing server. The initial extraction failure recovered on retry; its server-side cause was not established.

Android runtime, physical-device, maximum Dynamic Type, grayscale, VoiceOver/TalkBack, and Store purchase/renewal checks were not run in this pass. Those remain release validation tasks. No website deployment or store submission was performed.
