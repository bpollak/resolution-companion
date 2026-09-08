# Onboarding controls review — September 7, 2026

The previous chat placed a full-width Stop button inside the transcript and stacked Preview, Return to plan, and Update plan above the composer. Users had no visible step indicator. The revised flow has two work steps: Talk with Coach, then Review your plan. Welcome explains both; AI consent remains part of getting started.

## Changes

- A persistent, accessible header names the current step and shows a two-part progress track. Progress follows the screen, not message count.
- Preview is a compact header action. Send becomes Stop in the same composer slot during a request. Recovery text and a compact Retry sit together above the composer.
- Preview waits until a message has been sent and is disabled while unsent text remains. Plan extraction also enforces this guard for Retry and consent continuations; typing is disabled during extraction.
- Returning to an unchanged conversation opens its existing draft. If the conversation changed, users choose whether to update or view the current draft. Updates explicitly replace edits. Draft provenance persists across relaunches; older drafts receive neutral choice wording.
- Review keeps one fixed Start button and a date line. Validation replaces the date instead of adding another footer block. Explanatory copy scrolls with the plan.
- Coach's existing prompt now prioritizes completing the handoff once the habit and weekdays are known. It does not ask users to reconfirm known days or offer unsupported monthly schedules. Concrete examples cover ready and missing-schedule cases; the model, API contract, and extraction compatibility remain unchanged.

## Verification

Independent UX review found the pending-input edge case, which was fixed. Final source review found no remaining blocking regression in this scope.

Native iPhone 17e / iOS 26.5 simulator checks covered welcome, consent decline/resume, explicit step labels, Stop and Retry, interrupted conversation restoration, disabled Preview with unsent text, compact recovery above the keyboard, saved review edits, returning to an unchanged draft, the current-draft/update choice, and successful plan regeneration. Review and chat were inspected at normal and accessibility-medium text sizes; the review field and Start footer remained usable with the software keyboard. Invalid identity input displayed a wrapping error in place of the starting date.

TypeScript, lint, static accessibility checks, and 40 Jest suites / 286 tests passed. Three live synthetic chat probes verified complete habit/schedule → Preview, missing days → scheduling question, vague goal → clarification. Final native approval persisted exactly one persona, milestone, and Friday-only action and cleared the draft/transcript. The final bundled Coach reply also directed to Preview without another question. Proof is in `build/onboarding-controls-2026-09-07/`.

This is focused simulator and source verification, not a complete VoiceOver, maximum Dynamic Type, Android, or physical-device audit. Fast successful extraction completed before a manual Stop tap; reply Stop/Retry and the common cancellation code were verified.

The prompt uses explicit examples following [OpenAI's prompt-engineering guidance](https://developers.openai.com/api/docs/guides/prompt-engineering#few-shot-learning). Generated replies remain variable; the UI permits Preview once the user has supplied their direction rather than requiring an exact Coach phrase.
