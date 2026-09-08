# Ambient Coach coordinated release

## Customer-facing release notes

Resolution Companion now helps you interpret the day without turning progress into a grade. Today leads with one timely, on-device signal, and Journey groups actions as Working well, Still forming, or Worth simplifying based on scheduled history.

After a completed day, you can optionally record what helped or made things harder. With enough saved context, the app can surface careful associations such as time pressure appearing on harder days. It never claims that a factor caused an outcome.

Coach conversations can now open over Today or Journey, so you keep your place while asking about the evidence in front of you. Coach responses include Copy, Helpful, Not helpful, and the existing explicit safety-report option. Suggested plan changes are limited to schedule, routine anchor, and two-minute version, and are never applied without a field-by-field preview and confirmation.

## Privacy disclosure notes

- Daily context, notes, discoveries, Coach history, feedback selections, and plan-adjustment records remain local and persona-scoped. They are included only in the existing optional private iCloud backup.
- Signal selection, categories, evidence cards, and factor discoveries are computed on-device and require no AI consent or network access.
- Contextual Coach requests follow the existing AI-consent flow.
- Plan tune-up requests contain at most five opaque slots, editable plan fields, and bounded 28-day aggregate counts. They exclude notes, reflections, dates, device identifiers, local IDs, titles, persona name, and persona description.
- Aggregate telemetry records per-day event counts only. It contains no prompt, response, factor value, origin, or session trace.

## Post-release aggregate review

Review at 7 and 14 days:

- context saves / completed days
- contextual prompts / Coach sheet opens
- saved contextual sessions / contextual prompts
- discovery opens
- applied plan adjustments / plan previews

Do not add user-level analytics to answer these questions.

## Device regression matrix

- Clean install: signal-first Today, no black screen, and first-tap tab switching.
- Completion: save context, skip context, edit today, and add/edit context on each of the prior seven days including a missed day.
- Contextual Coach from Today and Journey: lower and expanded detents, native dismissal, keyboard, streaming, user-controlled scrolling, save/discard, consent, offline error, and exhausted free allowance.
- Journey: free category overview plus one discovery; Premium eight-week view, weekday view, all discoveries, memory, and unlimited sessions.
- Plan adjustment: before/after preview, cancel, confirm, malformed response, service error, and no mutation before confirmation.
- Accessibility: large text without clipped actions, meaningful screen-reader labels and selected states, portrait/landscape layout, and 44-point or larger primary targets.
- Platforms: iOS simulator regression and Android preview regression, including contextual sheet behavior and no iOS tab black-screen regression.
