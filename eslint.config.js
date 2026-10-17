// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const eslintPluginPrettierRecommended = require("eslint-plugin-prettier/recommended");

module.exports = defineConfig([
  expoConfig,
  eslintPluginPrettierRecommended,
  {
    files: ["client/**/*.{ts,tsx}"],
    ignores: ["client/constants/theme.ts", "client/**/__tests__/**"],
    rules: {
      // Accent tints must follow the active theme; derive them with
      // withAlpha(theme.accent, a) from client/lib/color.ts.
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/rgba\\(\\s*0\\s*,\\s*217\\s*,\\s*255/]",
          message:
            "Use withAlpha(theme.accent, alpha) instead of a hardcoded cyan tint.",
        },
        {
          // `${theme.accent}1A`-style suffixes break on any non-#RRGGBB
          // color. Limited to member expressions (theme.x, frame.color) so
          // plain number templates like `${hours}00` stay legal.
          selector:
            "TemplateLiteral[quasis.length=2][quasis.0.value.raw=''][quasis.1.value.raw=/^[0-9a-fA-F]{2}$/][expressions.0.type='MemberExpression']",
          message:
            "Use withAlpha(color, alpha) instead of appending a hex alpha suffix.",
        },
      ],
    },
  },
  {
    // Generated bundles are large minified files; linting them makes the
    // standard Expo command appear hung without checking any authored code.
    ignores: [
      // Nested worktrees have their own source roots and dependency installs.
      ".claude/worktrees/**",
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
