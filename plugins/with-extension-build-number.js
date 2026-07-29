const {
  withXcodeProjectBeta,
} = require("@bacons/apple-targets/build/with-bacons-xcode");

const EXTENSION_TARGETS = new Set(["ResolutionWidget"]);

module.exports = function withExtensionBuildNumber(config) {
  const buildNumber =
    process.env.EAS_BUILD_IOS_BUILD_NUMBER || config.ios?.buildNumber;

  if (!buildNumber) {
    return config;
  }

  return withXcodeProjectBeta(config, (modConfig) => {
    const project = modConfig.modResults;
    let updatedTargetCount = 0;

    for (const target of project.rootObject.props.targets) {
      const targetName = target.props.productName;
      if (!EXTENSION_TARGETS.has(targetName)) {
        continue;
      }

      target.setBuildSetting("CURRENT_PROJECT_VERSION", String(buildNumber));
      updatedTargetCount += 1;
    }

    if (updatedTargetCount !== EXTENSION_TARGETS.size) {
      throw new Error(
        `Expected to sync ${EXTENSION_TARGETS.size} app extension build number, updated ${updatedTargetCount}.`,
      );
    }

    return modConfig;
  });
};
