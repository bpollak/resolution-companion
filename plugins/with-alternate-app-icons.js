const fs = require("fs");
const path = require("path");
const {
  IOSConfig,
  withDangerousMod,
  withXcodeProject,
} = require("expo/config-plugins");

const ICON_NAME = "AuroraIcon";
const ICON_SOURCE = "assets/icon.png";

module.exports = function withAlternateAppIcons(config) {
  config = withDangerousMod(config, [
    "ios",
    async (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const source = path.join(projectRoot, ICON_SOURCE);
      if (!fs.existsSync(source)) {
        throw new Error(`Alternate app icon is missing: ${source}`);
      }

      const sourceRoot = IOSConfig.Paths.getSourceRoot(projectRoot);
      const iconSet = path.join(
        sourceRoot,
        "Images.xcassets",
        `${ICON_NAME}.appiconset`,
      );
      fs.mkdirSync(iconSet, { recursive: true });
      fs.copyFileSync(source, path.join(iconSet, `${ICON_NAME}.png`));
      fs.writeFileSync(
        path.join(iconSet, "Contents.json"),
        `${JSON.stringify(
          {
            images: [
              {
                filename: `${ICON_NAME}.png`,
                idiom: "universal",
                platform: "ios",
                size: "1024x1024",
              },
            ],
            info: { author: "expo", version: 1 },
          },
          null,
          2,
        )}\n`,
      );
      return modConfig;
    },
  ]);

  return withXcodeProject(config, (modConfig) => {
    const project = modConfig.modResults;
    const [, target] = IOSConfig.Target.findFirstNativeTarget(project);
    const configurations = IOSConfig.XcodeUtils.getBuildConfigurationsForListId(
      project,
      target.buildConfigurationList,
    );
    for (const [, buildConfiguration] of configurations) {
      buildConfiguration.buildSettings.ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES =
        ICON_NAME;
    }
    return modConfig;
  });
};
