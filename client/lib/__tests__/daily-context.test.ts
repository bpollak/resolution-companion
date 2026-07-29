import {
  formatDailyContextSummary,
  isWithinDailyContextBackfill,
  normalizeDailyContextInput,
} from "@/lib/daily-context";

describe("daily context validation", () => {
  it("deduplicates factors and trims notes to the local-only limit", () => {
    const normalized = normalizeDailyContextInput({
      logDate: "2026-07-28",
      helped: ["energy", "energy", "support"],
      hindered: ["time"],
      note: `  ${"x".repeat(220)}  `,
    });
    expect(normalized.helped).toEqual(["energy", "support"]);
    expect(normalized.hindered).toEqual(["time"]);
    expect(normalized.note).toHaveLength(200);
  });

  it("rejects overlap and empty entries", () => {
    expect(() =>
      normalizeDailyContextInput({
        logDate: "2026-07-28",
        helped: ["energy"],
        hindered: ["energy"],
      }),
    ).toThrow("cannot both help and hinder");
    expect(() =>
      normalizeDailyContextInput({
        logDate: "2026-07-28",
        helped: [],
        hindered: [],
        note: "   ",
      }),
    ).toThrow("Choose a factor");
  });

  it("uses calendar-day math across Pacific daylight-saving changes", () => {
    expect(isWithinDailyContextBackfill("2026-03-01", "2026-03-08")).toBe(true);
    expect(isWithinDailyContextBackfill("2026-02-28", "2026-03-08")).toBe(
      false,
    );
    expect(isWithinDailyContextBackfill("2026-11-01", "2026-11-08")).toBe(true);
    expect(isWithinDailyContextBackfill("2026-11-09", "2026-11-08")).toBe(
      false,
    );
  });

  it("summarizes factors without exposing the note text", () => {
    expect(
      formatDailyContextSummary({
        helped: ["support"],
        hindered: ["plan-fit"],
        note: "Private detail",
      }),
    ).toBe("Support helped · Plan fit got in the way · Note saved");
  });
});
