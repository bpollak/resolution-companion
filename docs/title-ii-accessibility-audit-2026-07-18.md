# Title II Accessibility Technical Audit

**Audited:** July 18, 2026

**Artifact:** Resolution Companion iOS simulator build **1.0.11**

**Device:** iPhone 16 Pro simulator, iOS 18.0

**Technical baseline:** WCAG 2.1 Level AA

## Outcome

The application has completed a code and simulator conformance pass against
the mobile-app technical standard used by the ADA Title II web and mobile-app
rule: **WCAG 2.1 Level AA**. The exact 1.0.11 artifact passed dedicated
regressions at iOS's largest accessibility text size with Increased Contrast
and Reduce Motion enabled, in portrait and landscape. The exercised surfaces
include onboarding, consent, core navigation, milestone proposal, contextual
paywalls, witness settings, private backup, second-persona invitation, and the
annual recap. The newly completed Violet accent and native Aurora app-icon
controls were also traversed at maximum text with named switch state.

This is an engineering conformance record, not a legal opinion or a third-party
accessibility certification. Title II directly governs state and local
government services; whether a privately published consumer app is legally in
scope depends on how a covered public entity offers or uses it. A release used
to deliver a covered public service should also receive a manual assistive-
technology review by qualified testers.

## Implemented conformance controls

| WCAG 2.1 criterion | Application control and evidence |
| --- | --- |
| 1.1.1 Non-text Content | Decorative artwork is hidden from the accessibility tree. Meaningful icons are included in the control name or paired with text. Annual-recap image cards expose complete generated descriptions rather than forcing a screen reader through decorative text layers. |
| 1.3.1 Info and Relationships | Buttons, tabs, links, switches, form fields, progress indicators, alerts, images, and modal dialogs expose native roles and state. |
| 1.3.4 Orientation | `app.json` uses `orientation: default`; the compiled Info.plist declares all four iPhone orientations. The live onboarding experience was rotated to landscape and back without losing function. |
| 1.4.3 Contrast (Minimum) | Semantic color tests cover primary/secondary text, links, accent text, buttons, success, warning, and error states in both themes. The website rating link uses existing contrast-safe text tokens. |
| 1.4.4 Resize Text | Shared text supports Dynamic Type up to a 2.0 multiplier. The artifact passed at `accessibility-extra-extra-extra-large`; actions remained reachable through scrolling. Fixed-format share images cap internal typography to preserve the exported composition while exposing the full equivalent content as one semantic image label. |
| 1.4.10 Reflow | Empty, onboarding, consent, profile, witness, backup, proposal, invitation, recap, and paywall content scrolls when enlarged. Maximum-text regressions traversed the complete actions without clipping away functionality. |
| 1.4.11 Non-text Contrast | Interactive borders, selected tabs, progress visuals, status colors, and button foregrounds use tested semantic theme tokens. Increased Contrast was enabled in the final artifact regressions. |
| 2.1.1 Keyboard | Controls use native React Native `Pressable`, `TextInput`, and `Switch` primitives rather than gesture-only custom hit areas. |
| 2.3.3 Animation from Interactions | The application observes Reduce Motion; all maximum-text flows passed with the system preference enabled. |
| 2.4.3 Focus Order | Source order follows visual reading order; modal content is isolated with `accessibilityViewIsModal`. Composite proposal and recap content exposes intentional semantic grouping. |
| 2.4.4 / 2.4.6 Link Purpose and Labels | Icon-only controls and navigation actions have explicit purpose-specific names, including close, dismiss, share, profile, and tabs. |
| 2.5.3 Label in Name | Accessible names retain visible action wording. Native tests assert real semantic labels such as “Add next milestone: …” and “Explore another journey.” |
| 3.3.2 Labels or Instructions | Every `TextInput` and `Switch` has an accessible label; selection and disabled state are exposed. Witness and backup forms were traversed at maximum text. |
| 4.1.2 Name, Role, Value | A repository gate checks every `Pressable`, `AnimatedPressable`, `TextInput`, `Switch`, and modal for required semantics. Completion, selection, expansion, and disabled state use native accessibility state. |
| 4.1.3 Status Messages | Toasts use an alert/live-region role and `AccessibilityInfo.announceForAccessibility`, so completion and error status does not depend on visual observation. |

## Verification record

| Check | Result |
| --- | --- |
| Accessibility source gate | Pass — `npm run check:a11y` |
| WCAG contrast/unit coverage | Pass — included in 19 suites / 169 tests |
| Compiled orientation declarations | Pass — all four iPhone orientations present |
| Maximum accessibility text | Pass — core, roadmap, witness, backup, and recap actions reachable |
| Increased Contrast | Pass — final dedicated simulator flows |
| Reduce Motion | Pass — final dedicated simulator flows |
| Portrait and landscape | Pass — live artifact rotated and remained operable |
| Core clean-install regression | Pass — onboarding through paywall |
| Roadmap completion regression | Pass — milestone proposal and second-persona flow |
| Later-bet regression | Pass — witness, iCloud fail-safe, and annual gate |
| Premium annual recap | Pass — swipe/share cards with semantic image descriptions |
| Seeded engagement | Pass — live Coach response, reward, and preference |
| Earned cosmetic controls | Pass — contrast-safe accent and native app-icon switches reachable and operable at maximum text |
| Native App Group regression | Pass — widget kickstart reconciled and announced as a 2-minute vote |

During the annual-recap max-text review, the initial fixed share-card layout
showed overlap. The implementation was changed to cap only the typography
inside that fixed-size exported graphic and add a full semantic image label;
the rebuilt artifact then passed the same regression. This is retained as
evidence that the test was defect-seeking rather than a checklist assertion.

Screenshots are retained under `build/accessibility-evidence-1.0.11-final/`, and the
exact extracted app is under `build/ios-sim-1.0.11-final/`.

## Manual release matrix

Automated traversal uses the iOS accessibility hierarchy that assistive
technologies consume, but it cannot judge speech clarity or the quality of a
person's end-to-end experience. Before procurement or deployment by a covered
public entity, manually smoke-test the release with:

- VoiceOver reading order, announcements, escape gesture, and rotor navigation;
- Switch Control scanning and activation;
- external keyboard Tab/Shift-Tab traversal and activation;
- Voice Control by visible label;
- Zoom at 200% and the supported Dynamic Type range on a physical iPhone;
- representative low-vision, motor, and cognitive-disability users.

Any accessibility issue reported through the feedback channel should be
treated as a release-blocking defect when it prevents access to a core flow.

## Authoritative references

- [U.S. Department of Justice — Fact Sheet: New Rule on the Accessibility of Web Content and Mobile Apps Provided by State and Local Governments](https://www.ada.gov/resources/2024-03-08-web-rule/)
- [W3C Recommendation — Web Content Accessibility Guidelines (WCAG) 2.1](https://www.w3.org/TR/WCAG21/)
