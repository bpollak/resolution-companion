import { Colors } from "@/constants/theme";

function relativeLuminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : Math.pow((channel + 0.055) / 1.055, 2.4),
    );

  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("WCAG 2.1 AA theme contrast", () => {
  test.each(["light", "dark"] as const)(
    "%s palette supports readable text and controls",
    (mode) => {
      const palette = Colors[mode];

      expect(
        contrastRatio(palette.text, palette.backgroundRoot),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(palette.textSecondary, palette.backgroundDefault),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(palette.link, palette.backgroundRoot),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(palette.accent, palette.backgroundDefault),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(palette.buttonText, palette.accent),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(palette.buttonText, palette.success),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(palette.buttonText, palette.warning),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(palette.error, palette.backgroundRoot),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(palette.accent, palette.backgroundRoot),
      ).toBeGreaterThanOrEqual(3);
    },
  );
});
