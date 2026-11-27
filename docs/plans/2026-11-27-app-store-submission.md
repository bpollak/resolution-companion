# Submit Resolution Companion 1.7.0 (113)

Date: 2026-11-27
Accepted intent: Brett explicitly requested "Submit the latest build for review
by Apple" after upload status and version were confirmed. This authorizes the
submission and its normal release-status bookkeeping.

## Source and scope

- Latest uploaded build: 1.7.0 (113), Apple processing state VALID. The local
  app and widget both match 1.7.0 (113); IPA SHA-256:
  `be444157f85601c9741db163958939350329c9a46576df399d6c7a6855911005`.
- Source: release/1.7.0 at `0747539a694f3d701784aa30e56d2e1b1796603a`,
  based on merged 1.7.0 implementation PR #40. No rebuild or replacement of
  another version in review is needed.
- Use the headless `asc` App Manager key. Run submit --dry-run first, inspect
  the exact target and payload, then perform the explicitly requested real
  submission. Preserve the existing automatic-release-after-approval policy.
- Use the factual 1.7.0 appStoreNotes from public/releases.json. Retain the
  existing listing name, description, subtitle, screenshots, prices, and
  availability. Add reviewer instructions for the core free flows; do not
  publish the optional store-copy draft as part of submission.

## Verification and bookkeeping

Read back the version's review state, attached build, release type, What's New,
and review submission. Distinguish Waiting for Review from public availability.
Only after Apple confirms submission, mark 1.7.0 submitted (not released) in
public/releases.json and publish that factual status through the repository's
review/CI/deployment workflow. Do not announce unreleased features as available.

Existing 1.7.0 validation is documented in
docs/plans/2026-11-27-native-regression.md. Its known flaky Coach close timing
and physical-device limitations are not represented as newly tested here.
No new native compilation, purchase, price, or unrelated metadata work is planned.
