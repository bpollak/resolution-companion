# AI Coach onboarding review — September 6, 2026

The onboarding flow now has one entry through AI Coach: consent, a short conversation, a readable plan preview, and explicit approval. The review focused on the full first-use experience, including interruptions, editing, and a plan whose first scheduled day is several days away.

## Findings and implemented changes

| Finding | Change |
| --- | --- |
| Two setup paths made the first decision unnecessary. | Removed the manual starter path and all “Continue without AI” fallbacks. Existing manual drafts cannot bypass Coach; previously saved plans remain intact. |
| Declining consent previously created a manual plan. | “Not now” pauses setup without enabling AI or creating a plan. The introduction explains that initial setup needs a connection and AI permission; tracking can continue with AI disabled afterward. |
| Coach declared readiness based on message count. | The conversation now asks about the chosen habit and suitable days or routine before declaring readiness. Preview remains available as an optional early draft. |
| A live conversation confused the full habit with its easier backup and asked for an unsupported start date. | Tightened the instructions to preserve the full action, keep the small version separate, and let the selected weekdays determine the first day. A subsequent live response preserved one page, one sentence, and Friday only. |
| Plan review opened as a long form. | It now shows the identity, selected action, days, milestone, small version, and anchor as a summary. Editing is optional; additional ideas stay collapsed. Start and the first scheduled date stay visible below the scroll area. |
| Returning from Coach could regenerate a draft and lose edits. | “Return to my plan” opens the existing draft. “Update plan from conversation” explicitly states that it replaces the draft and edits. |
| Removing the last habit or omitting days left unclear recovery. | Removing the last habit reveals the choices and explains the requirement. Validation opens and scrolls to the incomplete habit; invalid data is not saved. |
| Interruptions could leave an unanswered message without Retry. | Stop, back navigation, and returning during a reply preserve the conversation and restore Retry. Drafts and conversations survive app relaunch. |
| A Friday plan saved Sunday landed among competing rest-day and tomorrow prompts. | Today shows one clear plan-ready card with Friday's date and action. Its link opens that exact date in Journey. The general Journey return button says “Go to Today.” |

## Verification

Manually exercised the native iPhone 17e simulator on iOS 26.5 with synthetic reading-habit data:

- Created an unfinished manual draft in the prior build, updated the app, and verified that onboarding offered only Coach.
- Declined consent, verified paused setup, then agreed and started the conversation.
- Stopped a response, relaunched, and retried the saved message.
- Generated a Friday-only plan with one page as the full action and one sentence as the backup.
- Inspected the readable preview and fixed Start footer, including with the software keyboard visible.
- Deselected the last habit, recovered it, removed all days, and verified that Start revealed the invalid schedule rather than saving.
- Edited the action and anchor, returned to Coach, interrupted a refinement, and verified Retry and retained edits.
- Relaunched with the draft and confirmed the edited summary restored without regenerating it.
- Approved exactly one habit. Readback confirmed one persona, one milestone, one action, Friday only, the edited anchor, and a cleared onboarding draft.
- Followed the first-day link to Friday, September 11: Journey displayed one scheduled action, its small version, and the edited anchor.

Typecheck, lint, accessibility static checks, and all **40 test suites / 286 tests** pass. Date tests cover Friday-only plans, today's schedule, daylight-saving boundaries, year rollover, and empty schedules. The five updated Maestro flows were checked for valid YAML; they were not executed. Manual simulator actions supplied the native walkthrough evidence.

This was not a comprehensive VoiceOver, maximum Dynamic Type, Android, or physical-device review.

## API compatibility

The current live API requires at least three proposed benchmarks. A request emphasizing only one proposal repeatedly returned HTTP 500 with missing root fields after the server substituted an empty object for an empty model response. Those logs do not establish why the model returned no content.

A compatible request asking for three to five candidate proposals, with the user's chosen habit first and other ideas optional, returned HTTP 200 in 5.2 seconds and then passed the native flow. Only the first proposal is selected by default; approval saved exactly one action. No production server deployment was needed. The locally prepared server change allowing one to five proposals was not deployed. Explicit empty-response diagnostics are a follow-up.

## Evidence

- [Restored edited plan](../build/ai-onboarding-followup/restored-edited-plan.png)
- [Interrupted refinement recovery](../build/ai-onboarding-followup/interrupted-refinement-retry.png)
- [First-day Today screen](../build/ai-onboarding-followup/first-day-today.png)
- [First-day calendar](../build/ai-onboarding-followup/first-day-journey.png)
- [Saved-plan readback](../build/ai-onboarding-followup/persistence-proof.json)
- [Source checksums](../build/ai-onboarding-followup/source-manifest.json)

Released to TestFlight as **1.4.0 (91)**. Apple reports `VALID` and `IN_BETA_TESTING` for the existing Team (Expo) group. See [the release record](testflight-1.4.0-91.md).
