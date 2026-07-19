/* eslint-disable import/first -- native bridge mocks must be installed before the module under test */
const mockNative = {
  supportsAlternateIcons: jest.fn(() => true),
  getAlternateIconName: jest.fn<() => string | null>(() => null),
  setAlternateIconName: jest.fn<(name: string | null) => Promise<boolean>>(
    async () => true,
  ),
};

jest.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => mockNative,
}));

jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));

import {
  getAppIconStyle,
  setAppIconStyle,
  supportsAlternateAppIcons,
} from "@/lib/app-icon";

describe("alternate app icon", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNative.supportsAlternateIcons.mockReturnValue(true);
    mockNative.getAlternateIconName.mockReturnValue(null);
    mockNative.setAlternateIconName.mockResolvedValue(true);
  });

  it("maps the native alternate icon name to the earned Aurora style", () => {
    mockNative.getAlternateIconName.mockReturnValue("AuroraIcon");

    expect(supportsAlternateAppIcons()).toBe(true);
    expect(getAppIconStyle()).toBe("aurora");
  });

  it("maps the default style to a null native icon name", async () => {
    await expect(setAppIconStyle("default")).resolves.toBe(true);
    expect(mockNative.setAlternateIconName).toHaveBeenCalledWith(null);
  });

  it("maps Aurora to the configured asset-catalog name", async () => {
    await expect(setAppIconStyle("aurora")).resolves.toBe(true);
    expect(mockNative.setAlternateIconName).toHaveBeenCalledWith("AuroraIcon");
  });

  it("fails safely when the operating system does not support alternate icons", async () => {
    mockNative.supportsAlternateIcons.mockReturnValue(false);

    await expect(setAppIconStyle("aurora")).resolves.toBe(false);
    expect(mockNative.setAlternateIconName).not.toHaveBeenCalled();
  });
});
