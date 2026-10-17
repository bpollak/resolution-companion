const { withEntitlementsPlist } = require("expo/config-plugins");

const ACCESS_KEY = "com.apple.developer.healthkit.access";

// react-native-health always writes an empty healthkit.access array. Xcode
// automatic signing reads the bare key as a request for Verifiable Health
// Records and refuses to export without enabling that capability on the App
// ID. The app never reads clinical records, so drop the key when it is empty.
// List this plugin before react-native-health in app.json: Expo runs
// entitlement mods in reverse registration order.
module.exports = function withHealthKitAccessCleanup(config) {
  return withEntitlementsPlist(config, (modConfig) => {
    const access = modConfig.modResults[ACCESS_KEY];
    if (Array.isArray(access) && access.length === 0) {
      delete modConfig.modResults[ACCESS_KEY];
    }
    return modConfig;
  });
};
