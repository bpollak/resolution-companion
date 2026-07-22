// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const eslintPluginPrettierRecommended = require("eslint-plugin-prettier/recommended");

module.exports = defineConfig([
  expoConfig,
  eslintPluginPrettierRecommended,
  {
    // Generated bundles are large minified files; linting them makes the
    // standard Expo command appear hung without checking any authored code.
    ignores: [
      "dist/**",
      "server_dist/**",
      "static-build/**",
      "build/**",
      "attached_assets/**",
      "appstore-screenshots/**",
      // Finder conflict copies are not part of the Jest or application source set.
      "**/*.test 2.ts",
      // Standalone Remotion project with its own deps and toolchain
      "marketing/**",
    ],
  },
]);
