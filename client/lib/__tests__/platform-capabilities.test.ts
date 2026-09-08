import { getPlatformCapabilities } from "@/lib/platform-capabilities";

describe("platform capabilities", () => {
  it("keeps Apple-only integrations on iOS", () => {
    expect(getPlatformCapabilities("ios")).toEqual(
      expect.objectContaining({
        storeName: "App Store",
        supportsHealthAutoComplete: true,
        supportsPrivateCloudBackup: true,
        supportsHomeScreenWidget: true,
        supportsAlternateAppIcons: true,
      }),
    );
  });

  it("exposes the shared Android product without Apple-only features", () => {
    expect(getPlatformCapabilities("android")).toEqual(
      expect.objectContaining({
        storeName: "Google Play",
        supportsHealthAutoComplete: false,
        supportsPrivateCloudBackup: false,
        supportsHomeScreenWidget: false,
        supportsAlternateAppIcons: false,
      }),
    );
  });
});
