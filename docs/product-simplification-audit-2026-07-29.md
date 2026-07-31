# Product Simplification Audit

**Date:** July 29, 2026
**Decision:** The next product pass is subtractive. Existing data and
capabilities remain intact, but the primary experience returns to one loop:

> Choose who you are becoming, act today, see the evidence, and ask for help
> when you are stuck.

## Product rule

Each tab gets one job:

- **Today:** act
- **Journey:** see progress
- **Coach:** get help

If a surface does not directly support that job, it moves behind progressive
disclosure or leaves the primary interface.

## Keep, merge, hide, remove

| Current surface                                                                | Decision     | Simplified treatment                                                                                    |
| ------------------------------------------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------- |
| Becoming identity                                                              | Keep         | The quiet header on Today and Journey                                                                   |
| Today's actions                                                                | Keep         | The primary content on Today                                                                            |
| Today completion ring                                                          | Keep         | One finishable daily measure                                                                            |
| Completion celebration                                                         | Keep         | The single reward moment after the last action                                                          |
| Action notes                                                                   | Keep         | Optional after completion                                                                               |
| Streak, shield, and monthly score on Today                                     | Hide         | Evidence remains in storage and calendar calculations; no competing score beside today's work           |
| Recap, witness, observation, second-persona, and beat-last-week cards on Today | Hide         | Do not interrupt the daily task list                                                                    |
| Daily Context card on Today                                                    | Hide         | Context remains available from a selected day in Journey                                                |
| Tomorrow preview on Today                                                      | Hide         | The calendar remains the planning surface                                                               |
| Milestones                                                                     | Keep         | The main progress model on Journey                                                                      |
| Calendar and seven-day backfill                                                | Keep         | Secondary evidence and correction surface                                                               |
| Story Archive + Evidence Timeline                                              | Merge        | One **Your Story** destination based on the chronological evidence timeline, including monthly chapters |
| Annual story                                                                   | Hide         | Preserve the route and data; do not make it a separate Journey tool                                     |
| Trusted witness                                                                | Move         | Treat as a sharing preference in Profile, not a Journey destination                                     |
| Journey consistency ring and streak/shield stat row                            | Hide         | Milestones and the calendar already show progress                                                       |
| Context patterns panel                                                         | Hide         | Preserve the analysis for coaching and future progressive disclosure                                    |
| Momentum hero on Coach                                                         | Hide         | Coaching begins with the user's need, not another score                                                 |
| Weekly Review + Monthly Check-in + Plan Tune-Up sections                       | Merge        | One primary conversation with two compact suggested starts: review the week or adjust the plan          |
| Coaching article                                                               | Hide         | It competes with the coaching action                                                                    |
| Past sessions                                                                  | Keep         | A short history below the primary conversation                                                          |
| Subscription allowance                                                         | Keep quietly | A short line near the conversation CTA, with upgrade only near the limit                                |

## Simplified screen sketches

### Today

```text
TODAY                                      ⚙
Becoming
The person I chose

                 1 / 3
                  Today

Today's actions
┌─────────────────────────────────────────┐
│ Action                                  │
│ Small version                           │
│                         Mark complete   │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│ Action                                  │
│                         Mark complete   │
└─────────────────────────────────────────┘

[After the final action: one completion card]
```

### Journey

```text
JOURNEY                                    ⚙
Becoming The person I chose

┌─────────────────────────────────────────┐
│ Your Story                              │
│ Notes, milestones, comebacks, chapters  │
└─────────────────────────────────────────┘

Milestones
● Current milestone                 8 / 21
○ Next milestone

Calendar
        July 2026
  S  M  T  W  T  F  S
```

### Coach

```text
COACH
What do you need help with?
Talk through what is working, what feels hard, or what to change.

┌─────────────────────────────────────────┐
│ Start a conversation                  → │
└─────────────────────────────────────────┘

[Review my week]   [Adjust my plan]

Past conversations
July 27
July 20
```

## Acceptance criteria

- A returning user reaches today's first action without passing a recap,
  promotion, score explanation, or secondary input.
- Today presents one progress measure: completed actions out of scheduled
  actions.
- Journey presents one story destination, milestones, and the calendar.
- Coach presents one dominant action and no score dashboard.
- Existing logs, context, recaps, plan adjustments, subscriptions, and routes
  remain valid.
- No schema or persistence migration is required.
