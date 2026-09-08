# Full-App Regression Plan — Ambient Coach 1.3.6

Date: 2026-08-04
Target: current worktree and the 1.3.6 iOS/Android release artifacts
Platforms: iOS simulator/device, Android emulator/closed-test artifact, production API

## Exit criteria

The regression is complete only when:

1. Every row below has current evidence: pass, fixed and retested, or a named
   external-only limitation with the strongest available verification.
2. Static, unit, integration, privacy, accessibility, server, and release gates
   pass on Node 22 in Pacific time.
3. Clean-install and retained-data journeys pass on both platforms.
4. No confirmed crash, data-loss path, blocked primary action, stale derived
   value, inaccessible control, black screen, first-tap failure, or privacy
   boundary violation remains.
5. Every fix receives a focused regression and the affected end-to-end flow is
   rerun.

Status vocabulary: `PENDING`, `PASS`, `FIXED`, `EXTERNAL`, `FAIL`.

## A. Build and automated gates

| ID  | Test                                 | Evidence required                                | Status |
| --- | ------------------------------------ | ------------------------------------------------ | ------ |
| A01 | Dependency/runtime baseline          | Node 22, lockfile install integrity, Expo Doctor | PASS   |
| A02 | Formatting and TypeScript            | Prettier check and `check:types` exit 0          | PASS   |
| A03 | Lint and accessibility source scan   | Lint 0 errors; accessibility script exit 0       | PASS   |
| A04 | Unit/integration suite               | All Jest suites pass under Pacific TZ            | PASS   |
| A05 | Server production bundle             | `server:build` exit 0 and startup smoke test     | PASS   |
| A06 | iOS/Android release workflow         | Both release checks exit 0                       | PASS   |
| A07 | Native dependency/config consistency | Expo config and native Doctor checks clean       | PASS   |

## B. Installation, onboarding, and lifecycle

| ID  | Test                                                                                     | Platforms                 | Status  |
| --- | ---------------------------------------------------------------------------------------- | ------------------------- | ------- |
| B01 | Clean install opens empty Today without crash or stale state                             | iOS, Android              | PASS    |
| B02 | Intro carousel supports portrait/landscape, back, and large text                         | iOS, Android              | PASS    |
| B03 | Decline AI consent and create starter plan fully offline                                 | iOS, Android              | PASS    |
| B04 | Accept AI consent, stream interview, recover from network failure, create validated plan | iOS, Android              | PASS    |
| B05 | Relaunch, background/foreground, force quit, and retained state                          | iOS, Android              | PASS    |
| B06 | Upgrade/legacy storage loads reflections and existing plan without loss                  | iOS, Android/unit fixture | PASS    |
| B07 | Error boundary/recovery path does not trap the user                                      | iOS, Android              | PASS    |

## C. Today daily loop

| ID  | Test                                                                       | Platforms          | Status  |
| --- | -------------------------------------------------------------------------- | ------------------ | ------- |
| C01 | Signal priority: rest, complete, lapse, pattern/friction, ordinary day     | unit + iOS/Android | PASS    |
| C02 | Compact completion, continuity, and monthly consistency values agree       | iOS, Android       | PASS    |
| C03 | Full and kickstart completion update all derived values immediately        | iOS, Android       | PASS    |
| C04 | Undo completion reverses logs, milestone fill, streak, and consistency     | iOS, Android       | PASS    |
| C05 | Day-complete celebration and optional context appear once per persona/date | iOS, Android       | PASS    |
| C06 | Context save, skip, 200-character bound, factor states, and edit path      | iOS, Android/unit  | PASS    |
| C07 | Secondary recap/witness/persona invitation cards never compete with signal | iOS, Android       | PASS    |
| C08 | Tomorrow preview and schedule changes are date/time-zone correct           | iOS, Android/unit  | PASS    |
| C09 | Tabs respond on first tap; no iOS black screen after repeated switches     | iOS, Android       | PASS    |

## D. Journey, history, and editing

| ID  | Test                                                                            | Platforms                    | Status  |
| --- | ------------------------------------------------------------------------------- | ---------------------------- | ------- |
| D01 | Framing appears before calendar; category thresholds match 28-day history       | unit + iOS/Android           | PASS    |
| D02 | Free shows category overview plus one discovery; Premium shows all/deeper views | iOS, Android                 | EXTERNAL |
| D03 | Discovery minimums and association-only language are enforced                   | unit + iOS/Android           | PASS    |
| D04 | Calendar today/past/future states, day detail, backfill, and undo               | iOS, Android                 | PASS    |
| D05 | Edit context for today and previous seven days; older dates blocked             | iOS, Android                 | PASS    |
| D06 | Milestone fill is completion-only and never penalized by categories             | unit + iOS/Android           | PASS    |
| D07 | Action title, frequency, anchor, and kickstart edits propagate everywhere       | iOS, Android                 | PASS    |
| D08 | Add/delete action limits and deletion cascades are correct                      | unit + iOS/Android           | PASS    |
| D09 | Add/edit/delete milestone limits and cascades are correct                       | unit + iOS/Android           | EXTERNAL |
| D10 | Month/year recaps and witness sharing open, dismiss, and preserve state         | iOS, Android where supported | EXTERNAL |

## E. Coach and adaptive guidance

| ID  | Test                                                                                     | Platforms                  | Status  |
| --- | ---------------------------------------------------------------------------------------- | -------------------------- | ------- |
| E01 | Coach lobby, history, weekly review, direct entry, and micro-note surfaces               | iOS, Android               | PASS    |
| E02 | Contextual sheet opens from every supported origin at lower detent                       | iOS, Android               | PASS    |
| E03 | Sheet expands, keyboard works, scroll remains user-controlled, native dismiss works      | iOS, Android               | PASS    |
| E04 | Local evidence is viewable without consent/network; prompt triggers consent only at send | iOS, Android               | PASS    |
| E05 | Streaming response, offline failure, cancellation, retry, and safety Report              | iOS, Android               | PASS    |
| E06 | Copy, Helpful, and Not helpful work; only aggregate feedback is sent                     | iOS, Android/backend       | PASS    |
| E07 | Save/discard interception and contextual history persistence                             | iOS, Android               | PASS    |
| E08 | Quota counts only after first successful response; weekly review free; Premium unlimited | unit + iOS/Android         | EXTERNAL |
| E09 | Plan tune-up accepts up to five opaque slots and returns one validated recommendation    | unit + production          | PASS    |
| E10 | Preview/cancel/apply paths; only allowed fields change atomically                        | unit + iOS/Android         | PASS    |
| E11 | Malformed, timeout, rate-limit, quota, and server-error paths leave plan unchanged       | unit + iOS/Android/backend | PASS    |
| E12 | Existing single-action clients remain compatible with production endpoint                | production                 | PASS    |

## F. Personas, settings, subscriptions, and destructive flows

| ID  | Test                                                                             | Platforms            | Status  |
| --- | -------------------------------------------------------------------------------- | -------------------- | ------- |
| F01 | Create/switch/delete personas and persona-scoped data isolation                  | iOS, Android/unit    | EXTERNAL |
| F02 | Profile navigation, appearance, coach tone, icons, links, and legal pages        | iOS, Android         | PASS    |
| F03 | AI consent off/on propagates to all AI entry points                              | iOS, Android         | PASS    |
| F04 | Reminder permission, time bucket, reschedule, denial, and simulator fallback     | iOS device + Android | EXTERNAL |
| F05 | Private iCloud backup, explicit restore, disable, and reset exclusion rules      | iOS/unit             | EXTERNAL |
| F06 | Delete My Account & Data wipes local, server, backup, and returns to empty state | iOS, Android/backend | PASS    |
| F07 | Paywall products/prices, selection, cancel, purchase error, and loading state    | iOS, Android         | PASS    |
| F08 | Monthly/annual purchase and restore correctly unlock every Premium gate          | store sandbox/device | EXTERNAL |
| F09 | Android billing unavailable/unsigned-in state is recoverable and non-blocking    | Android              | PASS    |

## G. Platform integrations and cross-cutting quality

| ID  | Test                                                                              | Platforms                      | Status  |
| --- | --------------------------------------------------------------------------------- | ------------------------------ | ------- |
| G01 | Widget data/signature, deep links, Siri/App Shortcuts, and app-group behavior     | iOS/unit/simulator             | EXTERNAL |
| G02 | Health opt-in, permission denial, matching, and iOS-only capability gating        | iOS/unit; Android absence      | EXTERNAL |
| G03 | Android system back, predictive-back setting, edge-to-edge, and keyboard insets   | Android                        | PASS    |
| G04 | Screen-reader labels, focus order, roles, and 44-point targets                    | iOS, Android/source            | PASS    |
| G05 | Largest text sizes, landscape, small/large screens, and clipping                  | iOS, Android                   | PASS    |
| G06 | Light/dark themes, contrast, reduced motion, and pressed feedback                 | iOS, Android                   | PASS    |
| G07 | Offline launch and local-only Today/Journey/context operations                    | iOS, Android                   | PASS    |
| G08 | Rapid taps, repeated tab switches, long lists, and Coach streaming responsiveness | iOS, Android                   | PASS    |
| G09 | Pacific midnight/month boundary/DST calculations                                  | unit + controlled device dates | PASS    |
| G10 | No crash/error logs during complete journeys                                      | iOS console, Android logcat    | PASS    |

## H. Backend, privacy, and release truth

| ID  | Test                                                                             | Evidence required                  | Status   |
| --- | -------------------------------------------------------------------------------- | ---------------------------------- | -------- |
| H01 | Authentication, validation, rate limiting, timeout, and safe errors              | tests + production probes          | PASS     |
| H02 | Plan request excludes notes, dates, identifiers, titles, and persona content     | tests + captured request shape     | PASS     |
| H03 | Telemetry allowlists match and payload remains per-day counts only               | tests + source/server verification | PASS     |
| H04 | AI cost accounting and quota endpoints distinguish operations correctly          | tests + production behavior        | PASS     |
| H05 | Privacy policy accurately describes context, feedback, AI, backups, and deletion | source + live page                 | PASS     |
| H06 | iOS artifact metadata/build and Android artifact metadata/version are correct    | extracted artifacts/provider       | PASS     |
| H07 | App Store Connect and Play states are reported exactly, not inferred from upload | provider evidence                  | EXTERNAL |

## Execution log

Record command output, device identifiers, artifact hashes, screenshots, defects,
fix commits, and retest evidence here as the campaign proceeds.

### 2026-08-04 — automated baseline

- Node 22 formatting and TypeScript: pass.
- Expo lint and static accessibility scan: pass with zero errors.
- Jest under `TZ=America/Los_Angeles`: 35 suites, 242 tests, all pass.
- Expo Doctor: 18/18 checks pass.
- Server production bundle: pass (`server_dist/index.js`, 81.9 KB).
- iOS and Android release workflow checks: pass for version 1.3.5.

### Defects found

| ID   | Defect                                                                                                                                                                                                                   | Fix                                                                                                                                | Retest                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R001 | Two iOS `.xcodeproj` directories caused Expo to select a stale 1.0.4 native project instead of the canonical 1.0.11 project.                                                                                             | Quarantined the exact stale `ResolutionCompanionAI 2.xcodeproj`; canonical project is now the only candidate.                      | Fresh canonical simulator builds pass without the duplicate-project warning.                                                                               |
| R002 | Ordinary Today signals passed unsupported Coach prompt id `get-started`; the sheet silently fell back to origin defaults.                                                                                                | Replaced with the declared `start-today` prompt id.                                                                                | Typecheck and contextual Today sheet path pass.                                                                                                            |
| R003 | Android landscape onboarding clipped the intro title and subtitle out of the viewport.                                                                                                                                   | Added compact-landscape sizing for the intro header, hero, details, pagination, and footer.                                        | Rebuilt preview APK passes the portrait/landscape/portrait accessibility flow.                                                                             |
| R004 | The custom Coach header sat outside the visible iOS lower detent, hiding Close and Save.                                                                                                                                 | Moved the controls into a sticky header inside the sheet scroll surface.                                                           | Final iOS and Android artifact flows expose working Close and Save controls.                                                                               |
| R005 | A newly opened Coach session called `scrollToEnd` with no messages, which could move local evidence and prompts outside the lower detent.                                                                                | Scroll-to-end now runs only after a message or streaming text exists.                                                              | Final iOS and Android contextual Coach flows open with evidence and prompts visible.                                                                       |
| R006 | The interim native sheet header rendered on iOS but not Android, leaving no visible Close/Save controls there.                                                                                                           | Replaced platform-specific native/custom headers with one shared sticky in-sheet header.                                           | Final iOS and Android artifact flows pass.                                                                                                                 |
| R007 | The lobby and in-sheet plan controls shared an accessibility label, allowing automation and assistive targeting to activate the obscured lobby control.                                                                  | Gave the in-sheet request control the unique label `Request a previewed plan adjustment`.                                          | iOS and Android plan-preview flows target the correct control and pass.                                                                                    |
| R008 | A long plan preview could place Keep and Apply underneath the fixed composer because scroll-to-end did not reserve the composer's height.                                                                                | Added safe-area-aware composer clearance to the scroll content and retained a post-layout scroll.                                  | Final iOS artifact passed request, Keep, second request, Apply, atomic update, and Close without a manual scroll.                                          |
| R009 | The live AI-onboarding Maestro flow could hang while waiting for the continuously animated typewriter screen to become static, and its final evidence screenshot could stall after the functional assertions had passed. | Bounded settle time on interview input/send taps and removed the redundant final screenshot.                                       | The exact iOS release completed both streamed interview turns, generated a validated plan, reached Today, and showed no connection error.                  |
| R010 | Milestone Edit was visually present but absent from the iOS accessibility tree because its `Pressable` was nested inside the milestone toggle `Pressable`.                                                               | Replaced the nested interactive structure with sibling milestone-toggle and Edit controls inside a non-interactive card container. | The 1.3.6 release-mode simulator exposes both controls independently; milestone/action edits propagated to Today and Journey and survived a cold relaunch. |
| R011 | History/discovery seed scripts crashed when React Native stored a large AsyncStorage value in its MD5-named sidecar file and left `null` in `manifest.json`.                                                              | Added fixture helpers that read and write both inline and sidecar AsyncStorage values, including the 1,024-byte spill threshold.    | The repaired fixtures seeded 47 completion logs and 14 context days; production UI produced the qualifying association and opened its grounded Coach sheet. |

### 2026-08-04 — cross-platform artifact passes

- Production AAB hash: `caa2a2d17a4a69fa2bda82dd1d42365ba1d9d031ac9d8b3d7471111b950db1a0`.
- Bundletool installed the exact production AAB as a universal APK; version
  code 14 was confirmed on `emulator-5554`.
- iOS and Android clean launch, intro, consent decline, starter-plan creation,
  same-day completion, tab switching, Journey, Coach lobby, and paywall states
  passed.
- No crash was recorded. Play Billing initialization failed on the unsigned-in
  emulator and was handled without blocking the app, as expected.
- iOS live contextual Coach streaming exposed Copy, Helpful, Not helpful, and
  Report controls. Android offline Coach preserved local evidence and showed a
  recoverable error without consuming a successful session.
- The seeded 34-day iOS history produced `Working well` Journey categories and
  a live, free weekly-review response.

### 2026-08-04 — production and provider probes

- Production `/api/plan-tune-up` returned HTTP 200 for both the aggregate
  multi-action contract and the legacy single-action contract; unauthenticated
  and malformed requests returned 401 and 400.
- The live privacy page is dated August 2026 and discloses Daily Context,
  aggregate Helpful/Not helpful counts, and up to five opaque action slots.
- Public App Store lookup reports released version 1.3.3; 1.3.5 is therefore
  above the released version. App Store Connect browser authentication was not
  available for a current review-state read.
- Google Play API reports closed track `alpha` version code 14, release name
  1.3.5, status `completed`.

### 2026-08-05 — final snapshot and interaction retest

- The exact release snapshot at local HEAD `0cacccf46f5eab1c35a99e85dcd5503075c52df3`
  plus the scoped worktree changes passed formatting, typecheck, lint, 35 Jest
  suites / 242 tests, accessibility checks, Expo Doctor 18/18, server build,
  and both release checks on Node 22 in Pacific time.
- A fresh iOS 26.5 simulator release build used production environment values
  and passed the complete plan-preview flow against the production endpoint:
  preview, Keep, preview again, Apply, and sheet dismissal.
- The temporary focused Maestro flow was removed after the successful retest;
  the maintained cross-platform Coach flows retain the regression coverage.

### 2026-08-05 — signed artifacts and submissions

- iOS production IPA: version 1.3.5, app build 82, widget build 82, deep code
  signature valid, SHA-256
  `d120458e5ee2c3b28ff39dcfef43a69f3f6024977c45256aab28203b04b73227`.
- Android production AAB: version 1.3.5, version code 15, JAR signature
  verified, SHA-256
  `d91c019d3ca3d5713056dd9cbd10ffe51de7884ae97ce3adddeac490a20f2000`.
- Apple transporter accepted iOS submission
  `c96b81fc-0518-4330-bb21-a22f2b23f695`; Apple reported that build 82 is
  processing. This confirms upload acceptance, not review availability.
- Google Play submission `1904a4a6-6fae-4b32-af1a-9a6b07c263bb` completed.
  An independent Publishing API read confirms closed track `alpha` contains
  release 1.3.5, version code 15, status `completed`.
- Bundletool installed a universal APK generated from the exact submitted AAB
  on `emulator-5554`; package metadata confirmed version code 15. Clean-install,
  onboarding, starter plan, Today, Journey, Coach, unavailable-store recovery,
  ambient Coach, large-text, and orientation flows passed. The ambient flow was
  corrected to scroll from the evidence card to the following plan control,
  matching the specified evidence-first sheet hierarchy.
- App Store Connect requires a fresh interactive sign-in in the available
  browser, so its post-processing/review state remains an external status
  limitation rather than an inferred success.

### 2026-08-05 — continued completion audit

- The exact iOS release passed live AI onboarding with consent: two streamed
  interview turns, validated plan generation, navigation to Today, and no
  connection error. The generated `Prepared Pathfinder` persona scheduled two
  current-day actions with anchors and kickstart versions.
- A force-quit and direct native relaunch preserved that persona, its actions,
  signal-first Today, Journey framing, and all three tab routes.
- The maintained AI-onboarding flow now bounds settle time around continuous
  typewriter animation instead of waiting indefinitely for a static screen.
- Regression discovered and fixed an inaccessible milestone Edit control. A
  fresh 1.3.6 release-mode simulator build passed first-tap tab switching,
  milestone title/target-date editing, action title/kickstart/anchor editing,
  immediate Today/Journey propagation, and cold-relaunch persistence. Computer
  Use independently confirmed native text-field focus and keyboard behavior;
  the maintained Maestro editor flow now waits for keyboard animation and
  erases each field's full maximum length.
- The signed Android 1.3.6 artifact (version code 16, SHA-256
  `eaf757226fdf05fe766c661aed3f96bfc603b9d1ca93cf261d04e6d578b55cdc`)
  passed milestone/action editing, immediate propagation, cold-relaunch
  persistence, and deliberate first-tap tab switching.
- Both release-mode platforms passed optional daily-context capture with
  Energy-helped and Time-harder states, a saved note, Journey editing, and
  persistence of the edited note. Both also passed completion undo and redo,
  including the immediate 2/2 to 1/2 to 2/2 Today update.
- A local 14-day context fixture produced the qualifying free discovery using
  association-only wording. Its Journey action opened the contextual Coach
  sheet with the exact local evidence attached and no network request.
- The Journey calendar passed past-day selection, backfill, immediate undo,
  selected-day detail, and future-date blocking on iOS and Android. Context
  editing was available for the prior day and absent for a date eight days old
  on both platforms.
- Full completion passed on both artifacts. With a deterministic multi-day
  lapse, the release-mode iOS build promoted the two-minute signal, logged the
  selected action as a kickstart vote, restored 2/2 immediately, and exposed
  the accessible `2-minute vote` badge.
- Error-boundary coverage now proves the release fallback receives the caught
  error, exposes the Resume reset path, returns to child content after reset,
  and emits only the aggregate `client_error` telemetry event.

### 2026-08-05 — hierarchy, contextual origins, and reversibility

- Visual review of Today, Journey, and the contextual Coach sheet found that
  three prompt cards plus plan guidance overloaded the lower sheet and that a
  full-width outlined milestone Coach control competed with milestone content.
  Contextual sessions now show two origin-specific prompts, reserve plan tuning
  for action/lapse/reduce-friction contexts, use one primary tinted prompt, and
  render the Journey milestone entry as a quiet secondary action.
- Fresh release-mode iOS screenshots and Maestro assertions prove milestone and
  action evidence, the two-prompt cap, contextual plan-control visibility, and
  composer clearance. The evidence card remains the first focal surface.
- The declared action and milestone Coach origins were not reachable from the
  product UI. ActionEditor now provides one contextual entry after the editable
  fields, while an expanded milestone provides one local-evidence entry. Both
  routes were exercised in the native sheet.
- Completed action rows already supported full rollback through the whole row
  and exposed the screen-reader hint `Marks this action as not done`. A compact
  visible `Undo` cue was added so reversibility is discoverable without adding
  another card or primary button. Cross-platform undo regression is rerun after
  final artifact generation.
- Touch-to-scroll review confirmed Today, Journey, Coach lobby/history, and
  retained-session lists were already virtualized or opted out of iOS's delayed
  content-touch arbitration. The remaining interactive scroll surfaces now
  also set `delaysContentTouches={false}`: contextual/live Coach, onboarding,
  keyboard-aware editors, recaps, witness, backup, consent, error detail, and
  milestone completion. Appropriate vertical surfaces retain fast deceleration.
  State accuracy is unchanged; this only removes the native wait before drag.
- Action deletion was exercised from 3/5 through 5/5 and back on Android.
  Focused storage tests prove action and milestone cascades delete only linked
  logs/adjustments while preserving unrelated persona data.
- iOS contextual Coach passed live streaming, Copy, Helpful, Not helpful,
  explicit Report confirmation/cancel, Save into history, and Discard. Android
  previously passed grounded evidence and recoverable offline failure.
- Settings passes covered AI consent confirmation, legal/About/version, Play
  Billing unavailable recovery, system back, StoreKit product UI, notification
  simulator fallback, and unsigned iCloud fallback. Physical notification,
  iCloud restore, and paid purchase/restore remain named external rows.
- The Premium year-recap harness exposed an invalid QA assumption: StoreKit
  correctly revoked a locally forged entitlement after verifying an empty
  active-entitlements list. Premium-only purchase/restore and year-recap access
  will not be reported as passed without a store-sandbox entitlement. The
  maintained flow's stale persona-name selector was replaced with a structural
  settings control.
- Free Month in Motion opened, paged, and closed without changing Today state.
  Witness setup persisted `Alex`, updated its local preview, opened the native
  share sheet with the expected identity-framed message, dismissed, and
  returned to Journey. Premium-only annual recap remains store-sandbox evidence.
- The iOS app group contains a live widget snapshot with the persona, completion
  count, remaining action, kickstart, and seven-day schedule. A pending widget
  vote injected while the simulator was shut down was consumed on launch as one
  `completionSource: widget`, `completionKind: kickstart` log and rebuilt the
  snapshot from 1/2 to 2/2. Physical Siri/App Shortcut invocation remains an
  external-only portion of G01.
- Paid-only Journey depth, unlimited Coach, second-persona switching, milestone
  addition, purchase/restore, signed-in iCloud restore, physical notifications,
  physical Health samples, annual recap, and Siri voice invocation are marked
  `EXTERNAL`; their shared logic, free gates, denial/fallback behavior, privacy,
  and unit contracts have current evidence and are not described as store passes.
- The final signed 1.3.6 IPA has matching app/widget build 84 after export, a
  valid deep signature, and SHA-256
  `08b551743c7c25e3716e0e90587f21b4a42db2f493ec0965116e1ac2b95921f7`.
  A build-number synchronizer now writes the next EAS remote number into
  `app.json` before production builds, and a post-build verifier fails if the
  app and widget versions differ.

### Additional defects found

| ID   | Defect                                                                                                                           | Fix                                                                                                              | Retest                                                                                                                        |
| ---- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| R012 | `action` and `milestone` existed in the contextual-origin enum but no product control could open either origin.                 | Added one ActionEditor entry and one expanded-milestone entry; milestone evidence is derived locally from fill. | Release-mode iOS opened both origins with the correct bounded evidence snapshot.                                              |
| R013 | Contextual Coach could present three equally weighted prompts plus plan tuning, and Journey's milestone Coach CTA was too loud. | Capped origin-specific prompts at two, created one subtle primary tier, context-gated plan tuning, demoted CTA.  | Final hierarchy screenshots and focused Maestro flow passed without clipping or a third prompt.                              |
| R014 | Completed rows were reversible but the visible UI relied on users inferring that a green checked row could be tapped.           | Added a compact `Undo` cue inside the existing full-row checkbox target; retained haptic and accessibility hint. | Final iOS and version-code-18 Android regressions passed 2/2 to 1/2 to 2/2; Android also passed while fully offline.          |
| R015 | Several secondary and sheet scroll surfaces retained iOS's default delayed-content-touch arbitration, making a drag feel late. | Standardized immediate touch delivery across interactive ScrollView/FlatList surfaces; retained cancellation.    | Final iOS/Android drag, child-tap, keyboard, tab-switch, Coach, Today, Journey, and long-list flows passed.                   |
| R016 | The iOS archive step warned that the widget's configured build 64 differed from the remotely incremented app build 83.         | Added pre-build EAS-number sync and a post-export app/widget artifact verifier; local config is now next build 84. | Final IPA verified both bundles at 1.3.6 (84), its deep signature passed, and the verifier rejects future mismatches.            |
| R017 | The format gate excluded new `.mjs` release scripts, so lint found two Prettier violations after the ordinary format check passed. | Formatted both scripts and added `.mjs` to the check/write format globs.                                         | Node 22 format, lint, and IPA-verifier reruns pass; the format gate now covers the release scripts directly.                 |
| R018 | Running `server:build` before the format gate made Prettier inspect the generated server bundle and fail on non-source output. | Added generated build directories to `.prettierignore`.                                                         | The format gate passes both before and after `server:build`, while the server bundle retains its separate production check. |

### 2026-08-05 — final responsiveness and destructive-flow closure

- The final Node 22 gate passed formatting, typecheck, lint, 36 Jest suites / 246
  tests in Pacific time, the accessibility scan, Expo Doctor 18/18, server
  production build, and both release checks.
- The exact Android 1.3.6 AAB, version code 18, has SHA-256
  `45773318933587806509ccc0eb465ef8b8de205bb4c46ec3a3af94ce22ac249e`.
  JAR verification completed and Bundletool installed a universal APK generated
  from that AAB on `emulator-5554`; package metadata confirmed version 1.3.6
  (18).
- The exact AAB passed a clean no-AI onboarding, starter-plan creation,
  completion, Journey, Coach, micro-note, profile, and recoverable sideloaded
  Play Billing flow. Android AI consent also reached the first live streamed
  interviewer response; the full two-turn validated-plan flow had already
  passed on the matching iOS release and production API.
- With Wi-Fi and mobile data disabled, a cold launch restored the 2/2 Today
  state, Journey categories, and the optional context card. Immediate drags on
  Today and Journey responded, tab taps remained reliable, and tapping the new
  visible `Undo` cue changed the stored day to 1/2 with the action restored.
- `Delete My Account & Data` displayed its irreversible confirmation, completed
  the server request, returned `Account Deleted — All your data has been deleted
  from this device and our servers`, and a cold relaunch showed the empty
  `Start Your Journey` state. No fatal Android log entry was recorded.
- UI density review now has one dominant Today evidence/signal action, bounded
  contextual prompts, quieter secondary actions, consistent card spacing, and
  a single accent hierarchy. Completed rows expose `Undo` within the existing
  target instead of adding another competing button or card.

### 2026-08-05 — final provider evidence at pause

- EAS iOS submission `c2d7b6ea-7f3c-4c87-92ed-71fecf0a0db2` finished without
  error. Fastlane confirmed successful upload of 1.3.6 build 84 to App Store
  Connect. Because the submission skipped waiting for processing and App Store
  Connect requires a fresh interactive sign-in, processing/review/release state
  remains `EXTERNAL`; it is not inferred from transporter acceptance.
- EAS Android submission `7d08ec28-559a-4553-af85-f2db275d9d78` finished
  without error. A separate Google Play Publishing API read confirmed closed
  track `alpha` contains release 1.3.6, version code 18, status `completed`.
- The campaign resumed after the restart for the final staged-state audit. No
  commit or push has been made.

### 2026-08-05 — post-restart staged-state completion audit

- The preserved artifact hashes still match, and the iOS verifier confirms the
  app and widget are both 1.3.6 build 84.
- An isolated copy of the exact staged source state received a fresh Node 22
  `npm ci`. Format, typecheck, lint, 36 Jest suites / 246 tests in Pacific time,
  accessibility, server build, Expo Doctor 18/18, both release checks, and the
  signed-IPA verifier pass.
- The final gate rerun found and fixed R017 and R018: `.mjs` scripts are now
  covered by formatting, and generated build directories no longer make the
  source-format result depend on gate order.
- All 71 matrix rows have evidence: 60 `PASS`, 11 explicitly bounded
  `EXTERNAL`, zero `PENDING`, and zero `FAIL`. The external rows are limited to
  paid-store entitlements, physical-device services, private iCloud/Siri/Health
  conditions, and authenticated provider state; none conceals a known code bug.
- The scoped release change set is staged. Unrelated marketing/ASO assets,
  screenshots, copy experiments, and iCloud duplicate files remain unstaged.
  No commit or push has been made.
