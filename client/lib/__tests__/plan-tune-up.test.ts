import {
  buildPlanTuneUpRequest,
  parsePlanTuneUpSuggestion,
} from "@/lib/plan-tune-up";
import type { ElementalAction } from "@/lib/storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual(
    "@react-native-async-storage/async-storage/jest/async-storage-mock",
  ),
);

const action: ElementalAction = {
  id: "private-action-id",
  benchmarkId: "private-benchmark-id",
  title: "Private action title",
  frequency: ["Monday", "Wednesday"],
  anchorLink: "After lunch",
  kickstartVersion: "Open the notebook",
  createdAt: "2026-07-01T12:00:00",
};

describe("plan tune-up privacy and validation", () => {
  const request = buildPlanTuneUpRequest({
    actions: [action],
    logs: [
      {
        id: "log-id",
        actionId: action.id,
        logDate: "2026-08-03",
        status: true,
        createdAt: "2026-08-03",
        note: "private note",
      },
    ],
    contextEntries: [
      {
        id: "context-id",
        personaId: "persona-id",
        logDate: "2026-08-03",
        factors: { time: "hindered" },
        note: "another private note",
        status: "saved",
        createdAt: "2026-08-03",
        updatedAt: "2026-08-03",
      },
    ],
    personaCreatedAt: "2026-07-01T12:00:00",
    monthlyConsistency: 42,
    today: new Date(2026, 7, 4, 12),
  });

  it("contains aggregates and editable fields but no identifiers, notes, titles, or dates", () => {
    const serialized = JSON.stringify(request);
    expect(serialized).not.toContain("private-action-id");
    expect(serialized).not.toContain("private-benchmark-id");
    expect(serialized).not.toContain("Private action title");
    expect(serialized).not.toContain("private note");
    expect(serialized).not.toContain("2026-08-03");
    expect(request.actions[0]).toMatchObject({ slot: 0, completed: 1 });
  });

  it("accepts one changed allowed field and rejects unknown or unchanged fields", () => {
    expect(
      parsePlanTuneUpSuggestion(
        {
          slot: 0,
          changes: { frequency: ["Monday"] },
          rationale: "A smaller schedule may fit better.",
        },
        request,
      ).changes.frequency,
    ).toEqual(["Monday"]);
    expect(() =>
      parsePlanTuneUpSuggestion(
        { slot: 0, changes: { title: "Not allowed" }, rationale: "No." },
        request,
      ),
    ).toThrow();
    expect(() =>
      parsePlanTuneUpSuggestion(
        {
          slot: 0,
          changes: { frequency: ["Monday", "Wednesday"] },
          rationale: "No change.",
        },
        request,
      ),
    ).toThrow();
  });
});
