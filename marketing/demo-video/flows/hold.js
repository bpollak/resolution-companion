// Maestro has no sleep command — by design, because artificial waits make
// tests flaky. But this isn't a test: it's a camera. We need the app to sit
// still so a viewer can actually read the screen before the next tap.
//
//   - runScript: { file: hold.js, env: { MS: "3000" } }
const ms = parseInt(MS || "1000", 10);
const end = Date.now() + ms;
while (Date.now() < end) {
  // spin — GraalJS has no blocking sleep primitive exposed to Maestro scripts
}
