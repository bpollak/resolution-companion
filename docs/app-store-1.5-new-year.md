# App Store kit: 1.5 New Year release

Everything here is a draft for Brett. Nothing is entered in App Store Connect without his go.
Plan: `docs/plans/2026-09-28-new-year-release.md` (section C).

## 1. Yearly free trial (do before Dec 1)

The app already reads StoreKit's introductory offer and shows the trial on the paywall
(`lib/iap.ts` `formatIntroOfferDuration`). It only needs the offer in App Store Connect:

1. App Store Connect > Resolution: Habit Tracker > Subscriptions > Premium Access > Yearly
   (`com.resolutioncompanion.annual`).
2. Subscription Prices > View all Subscription Pricing > Introductory Offers > Create.
3. Type: Free. Duration: 1 week or 1 month (recommend 1 week for January; shorter trials
   convert while motivation is high). All countries. Start date: Nov 15. No end date.
4. After it's approved, open the paywall on a real device and confirm the trial line appears.

## 2. In-App Event: "New Year, fresh start"

- Event name (30 max): **New Year, Fresh Start**
- Short description (50 max): **Turn your resolution into one small daily habit.**
- Long description (120 max): **Tell Coach your resolution, plan it for January 1, and get one
  small habit with a gentle nudge. Free to start.**
- Badge: Challenge. Event dates: Dec 26 to Jan 15. Publish start: Dec 12 (events can show up
  to 14 days early). Priority: high. Deep link: `resolutioncompanion://today`.
- Needs a 1920x1080 event card image and a 3:4 event details image. Use the Today countdown
  card and the plan review screen from the 1.5 simulator walkthrough.

## 3. Listing copy for the season

- Promotional text (170 max), from Nov 15:
  **Plan your resolution now and start January 1. Coach turns it into one small daily habit,
  with a nudge when you need it. Free to start, no account required.**
- Promotional text from Jan 2:
  **Keep your resolution past February. One small habit a day, a coach when it gets hard, and
  a plan that bends instead of breaks.**
- First screenshot headline: **Keep your resolution past February**
- Second: **Say it in your own words** (onboarding with starters)
- Third: **Start January 1** (plan review with the start choice, then the countdown)
- What's New: use the five `appStoreNotes` in `public/releases.json` for 1.5.0.

Promotional text can change without a new build and does not affect search ranking; the
screenshots and subtitle need the 1.5 submission.

## 4. Timing

| Date | Step | Owner |
|---|---|---|
| Oct 31 | TestFlight build of 1.5 | Claude on Brett's go |
| Nov 15 | Trial live; promotional text switched | Brett in ASC |
| Dec 5 | 1.5 submitted to App Review | Brett's go |
| Dec 12 | In-App Event published (visible from Dec 12, live Dec 26) | Brett in ASC |
| Jan 2 | Promotional text switched to "past February" | Brett in ASC |
