# Title II Accessibility Technical Audit

**Audited:** July 18, 2026

**Artifact:** Resolution Companion iOS simulator build **1.0.9**

**Device:** iPhone 16 Pro simulator, iOS 18.0

**Technical baseline:** WCAG 2.1 Level AA

## Outcome

The application has completed a code and simulator conformance pass against
the mobile-app technical standard used by the ADA Title II web and mobile-app
rule: **WCAG 2.1 Level AA**. The final 1.0.9 artifact passed its dedicated
accessibility regression at iOS's largest accessibility text size with
Increased Contrast and Reduce Motion enabled, in portrait and landscape.

This is an engineering conformance record, not a legal opinion or a third-party
accessibility certification. Title II directly governs state and local
government services; whether a privately published consumer app is legally in
scope depends on how a covered public entity offers or uses it. A release used
to deliver a covered public service should also receive a manual assistive-
technology review by qualified testers.

## Implemented conformance controls

| WCAG 2.1 criterion                    | Application control and evidence                                                                                                                                                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1.1 Non-text Content                | Decorative artwork is hidden from the accessibility tree. Meaningful icons are included in the accessible name of their control or paired with text.                                                                                                    |
| 1.3.1 Info and Relationships          | Buttons, tabs, links, switches, form fields, progress indicators, alerts, and modal dialogs expose native roles and relationships.                                                                                                                      |
| 1.3.4 Orientation                     | `app.json` uses `orientation: default`; the compiled Info.plist includes portrait, upside-down portrait, landscape-left, and landscape-right. The accessibility simulator flow rotates the live onboarding experience and verifies continued operation. |
| 1.4.3 Contrast (Minimum)              | Light-theme semantic colors were replaced with darker accessible values. Jest tests calculate contrast for primary/secondary text, links, accent text, buttons, success, warning, and error states in both themes.                                      |
| 1.4.4 Resize Text                     | Shared text permits Dynamic Type up to a 2.0 multiplier. The exact artifact passed at iOS `accessibility-extra-extra-extra-large`; onboarding, consent, and primary actions remained readable and reachable.                                            |
| 1.4.10 Reflow                         | The empty Today state and onboarding/consent surfaces scroll when content grows. The largest-text regression traverses the complete intro and consent path without loss of function.                                                                    |
| 1.4.11 Non-text Contrast              | Interactive borders, selected-tab state, progress visuals, status colors, and button foregrounds use tested semantic theme tokens.                                                                                                                      |
| 2.1.1 Keyboard                        | Interactive application controls use native React Native `Pressable`, `TextInput`, and `Switch` primitives rather than gesture-only custom hit areas.                                                                                                   |
| 2.3.3 Animation from Interactions     | The application respects the platform Reduce Motion setting; the artifact regression passed with Reduce Motion enabled.                                                                                                                                 |
| 2.4.3 Focus Order                     | Screen reading order follows visual source order; modal dialogs isolate their content with `accessibilityViewIsModal`.                                                                                                                                  |
| 2.4.4 / 2.4.6 Link Purpose and Labels | Small icon-only controls and navigation actions have explicit, purpose-specific accessible names.                                                                                                                                                       |
| 2.5.3 Label in Name                   | Accessible names retain the visible action wording, including Continue, Save, Close, plan names, action titles, and tab names.                                                                                                                          |
| 3.3.2 Labels or Instructions          | Every `TextInput` and `Switch` has an accessible label; selection and disabled state are exposed.                                                                                                                                                       |
| 4.1.2 Name, Role, Value               | A repository gate checks every `Pressable`, `AnimatedPressable`, `TextInput`, `Switch`, and modal for required semantics. Dynamic completion, selection, expansion, and disabled states are announced through native accessibility state.               |
| 4.1.3 Status Messages                 | Toasts use an alert/live-region role and `AccessibilityInfo.announceForAccessibility`, so completion and error status does not depend on visual observation.                                                                                            |

## Verification record

| Check                                | Result                                                              |
| ------------------------------------ | ------------------------------------------------------------------- |
| Accessibility source gate            | Pass — `npm run check:a11y`                                         |
| WCAG contrast unit tests             | Pass — included in 13 suites / 150 tests                            |
| Compiled orientation declarations    | Pass — all four iPhone orientations present                         |
| Largest accessibility text           | Pass — onboarding entry, carousel, and consent actions reachable    |
| Increased Contrast                   | Pass — dedicated simulator flow                                     |
| Reduce Motion                        | Pass — dedicated simulator flow                                     |
| Portrait and landscape               | Pass — live artifact rotated and remained operable                  |
| Core clean-install regression        | Pass — onboarding through paywall                                   |
| Seeded-history engagement regression | Pass — milestone, Coach, reward, and preferences                    |
| Native App Group regression          | Pass — widget kickstart reconciled and announced as a 2-minute vote |

Screenshots are retained under the ignored
`build/accessibility-evidence-1.0.9/` directory, and the exact extracted app is
under `build/ios-sim-1.0.9-a11y-final/`.

## Manual release matrix

Automated UI traversal uses the same iOS accessibility hierarchy that
assistive technologies consume, but it cannot judge speech clarity or the
quality of a person's end-to-end experience. Before procurement or deployment
by a covered public entity, manually smoke-test the release with:

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
