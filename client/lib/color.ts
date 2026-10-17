// Accent tints must follow the active theme (cyan, Dawn teal, or violet), so
// derive them from the theme color instead of hardcoding the dark-cyan rgba.
export function withAlpha(color: string, alpha: number): string {
  const hex = color.trim().replace(/^#/, "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return color;
  const clamped = Math.min(1, Math.max(0, alpha));
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${clamped})`;
}
