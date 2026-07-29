import {
  buildPlanTuneUpRequest,
  canRequestPlanTuneUp,
} from "@/lib/plan-tune-up";
import {
  normalizePlanTuneUpResponse,
  validatePlanTuneUpRequest,
} from "@shared/plan-tune-up";
import type { DailyLog, ElementalAction } from "@/lib/storage";
import type { DailyContextEntry } from "@/lib/daily-context";

jest.mock("@/lib/storage", () => ({
  storage: {
    getDeviceId: jest.fn(async () => "test-device"),
  },
}));

const action: ElementalAction = {
  id: "private-action-id",
  benchmarkId: "private-benchmark-id",
  title: "Write one paragraph",
  frequency: ["Monday", "Wednesday", "Friday"],
  anchorLink: "After coffee",
  kickstartVersion: "Open the draft",
  createdAt: "2026-07-01T12:00:00.000Z",
};

function log(date: string, kind: "full" | "kickstart" = "full"): DailyLog {
  return {
    id: `private-log-${date}`,
    actionId: action.id,
    logDate: date,
    status: true,
    note: "This must never leave the device.",
    completionKind: kind,
    createdAt: `${date}T18:00:00.000Z`,
  };
}

function context(date: string): DailyContextEntry {
  return {
    id: `private-context-${date}`,
    personaId: "private-persona-id",
    logDate: date,
    helped: ["energy"],
    hindered: ["time"],
    note: "Also private.",
    createdAt: `${date}T19:00:00.000Z`,
    updatedAt: `${date}T19:00:00.000Z`,
  };
}

describe("Plan Tune-Up aggregate", () => {
  it("contains settings and bounded counts, never ids, notes, or event dates", () => {
    const request = buildPlanTuneUpRequest(
      action,
      [log("2026-07-20"), log("2026-07-22", "kickstart")],
      [context("2026-07-20")],
      new Date("2026-07-28T12:00:00"),
    );
    const serialized = JSON.stringify(request);
    expect(serialized).not.toContain("private-");
    expect(serialized).not.toContain("must never");
    expect(serialized).not.toContain("Also private");
    expect(serialized).not.toContain("2026-07-20");
    expect(request.evidence.completed).toBe(2);
    expect(request.evidence.full).toBe(1);
    expect(request.evidence.kickstart).toBe(1);
    expect(validatePlanTuneUpRequest(request)).toBeNull();
    expect(canRequestPlanTuneUp(request)).toBe(true);
  });

  it("requires seven scheduled action-days", () => {
    const recentAction = {
      ...action,
      createdAt: "2026-07-27T12:00:00.000Z",
    };
    const request = buildPlanTuneUpRequest(
      recentAction,
      [],
      [],
      new Date("2026-07-28T12:00:00"),
    );
    expect(canRequestPlanTuneUp(request)).toBe(false);
  });
});

describe("Plan Tune-Up validation", () => {
  const current = {
    title: action.title,
    frequency: ["Monday", "Wednesday", "Friday"] as const,
    anchorLink: action.anchorLink,
    kickstartVersion: action.kickstartVersion,
  };

  it("accepts only supported, changed fields", () => {
    expect(
      normalizePlanTuneUpResponse(
        {
          summary: "Move the cue closer to the moment you already own.",
          changes: {
            anchorLink: "When I pour coffee",
            frequency: ["Monday", "Wednesday", "Friday"],
          },
        },
        {
          ...current,
          frequency: [...current.frequency],
        },
      ),
    ).toEqual({
      summary: "Move the cue closer to the moment you already own.",
      changes: { anchorLink: "When I pour coffee" },
    });
  });

  it("rejects unsupported, malformed, and unchanged output", () => {
    expect(() =>
      normalizePlanTuneUpResponse(
        {
          summary: "Change everything.",
          changes: { title: "A different action" },
        },
        { ...current, frequency: [...current.frequency] },
      ),
    ).toThrow("unsupported");
    expect(() =>
      normalizePlanTuneUpResponse(
        {
          summary: "Keep doing the same thing.",
          changes: { anchorLink: action.anchorLink },
        },
        { ...current, frequency: [...current.frequency] },
      ),
    ).toThrow("meaningful");
  });

  it("rejects payloads that try to smuggle notes or ids", () => {
    const request = buildPlanTuneUpRequest(
      action,
      [],
      [],
      new Date("2026-07-28T12:00:00"),
    ) as any;
    request.evidence.note = "private";
    expect(validatePlanTuneUpRequest(request)).toContain("invalid aggregate");
  });

  it("rejects aggregate rows that do not reconcile to their totals", () => {
    const request = buildPlanTuneUpRequest(
      action,
      [],
      [],
      new Date("2026-07-28T12:00:00"),
    );
    request.evidence.weekdays[0].scheduled -= 1;
    expect(validatePlanTuneUpRequest(request)).toContain(
      "do not match the totals",
    );
  });
});
