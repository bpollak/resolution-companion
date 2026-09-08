# Website refresh — September 8, 2026

The approved website refresh retains the app's charcoal and cyan identity, adds a cyan outline around the header icon, and places one switchable app screen on a light slate hero panel. Shared CSS, JavaScript, navigation, and footer styling now cover home, release notes, support, privacy, and terms.

The release history includes Apple's verified September 8 release of 1.4.0 and its six published notes. Both the release content and sidebar are rendered from `public/releases.json`. `app.json`'s version is synchronized to that released version to satisfy the repository's release check; this website release does not build or upload a native app.

Original full policy bodies, effective dates, historical release entries, video/transcript, and support FAQ answers are preserved. The existing Web3Forms submission handler is restored for production. Search metadata and canonical URLs are retained; homepage metadata describes the new copy, and FAQ/rating structured data for content no longer displayed on the homepage is removed. Shared asset URLs carry a revision query to refresh cached styles and scripts.

Validation: release check and Apple release sync; typecheck, lint, formatting, and server production build; five pages at 1440, 1024, 768, 390, and 320 px; 41 internal URLs and anchors; keyboard screen selection, menus, and disclosures; exact policy/history/FAQ text comparisons. Feedback success was exercised with an intercepted Web3Forms response, with no real message sent. The API and database behavior remain unchanged.

Deployment follows the existing GitHub `main` → Railway `app` service path. The unrelated app work in the original checkout was not included.
