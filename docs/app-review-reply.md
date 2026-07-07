# App Review reply — resubmission of v1.0

Paste this (edited as you see fit) into "Reply to App Review" on the
submission page when resubmitting, and mirror the key points in the
version's Review Notes.

---

Hello,

Thank you for the detailed feedback. We have addressed both issues in this
new build:

**Guideline 2.1 — App Completeness (In-App Purchase bugs)**

The bugs were caused by our server rejecting purchase validation because it
was not configured with App Store Server API credentials. We have:

- Deployed a new backend with full StoreKit 2 support: purchases are
  validated server-side via the App Store Server API, and renewal/refund
  events are processed via App Store Server Notifications V2 (signed JWS
  with certificate-chain verification).
- Configured the App Store Server API credentials (Issuer ID, Key ID,
  private key) in production.
- Verified both subscription products (com.resolutioncompanion.monthly,
  com.resolutioncompanion.annual) purchase, restore, and renew correctly in
  the sandbox environment.
- Confirmed our Paid Apps Agreement is active.

**Guidelines 5.1.1(i) / 5.1.2(i) — Privacy (third-party AI service)**

The app now obtains explicit user permission before any data is shared with
the AI service:

- Before the first AI interaction (onboarding chat or coaching check-in),
  the app presents a consent screen that discloses exactly what is sent
  (the messages the user types in AI conversations), who receives it
  (OpenAI, the third-party AI service that powers coaching), that
  conversations are not stored on our servers, and that no account is
  created and data is not used for identification or advertising.
- No data is sent to OpenAI unless the user taps "Agree & Continue". If the
  user declines, the app remains fully usable: they receive a ready-made
  starter plan and full habit tracking with no AI features.
- The user can turn AI data sharing on or off at any time in Profile →
  "AI Data Sharing".
- Our privacy policy (https://resolutioncompanion.com/privacy) identifies
  the data sent to OpenAI, how it is collected, and how it is used, in the
  "AI Features & OpenAI" section.
- The App Privacy questionnaire has been updated to match (Device ID and
  user chat content: app functionality only, not linked to identity, not
  used for tracking).

Testing notes: no login is required. Premium can be tested with a sandbox
Apple account. The AI consent screen appears on first launch before any AI
chat begins.

Thank you for your review.
