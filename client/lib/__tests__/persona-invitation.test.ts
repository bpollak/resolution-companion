import { shouldOfferSecondPersona } from "@/lib/persona-invitation";
import type { DailyLog, ElementalAction, Persona } from "@/lib/storage";

const now = new Date("2026-07-18T12:00:00-07:00");
const persona: Persona = {
  id: "p1",
  name: "Consistent Runner",
  description: "",
  createdAt: "2026-06-01T12:00:00-07:00",
};
const action: ElementalAction = {
  id: "a1",
  benchmarkId: "b1",
  title: "Walk",
  frequency: [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ],
  kickstartVersion: "Shoes on",
  anchorLink: "After coffee",
  createdAt: "2026-06-01T12:00:00-07:00",
};

const logs: DailyLog[] = Array.from({ length: 24 }, (_, index) => {
  const date = new Date(now);
  date.setDate(date.getDate() - index - 1);
  return {
    id: `l${index}`,
    actionId: action.id,
    logDate: date.toISOString().slice(0, 10),
    status: true,
    createdAt: date.toISOString(),
  };
});

describe("second persona invitation", () => {
  it("offers one quiet monthly invitation after 30 sustained days", () => {
    expect(
      shouldOfferSecondPersona([persona], persona, [action], logs, null, now),
    ).toBe(true);
    expect(
      shouldOfferSecondPersona(
        [persona],
        persona,
        [action],
        logs,
        "2026-07",
        now,
      ),
    ).toBe(false);
  });

  it("does not invite a new or already multi-persona user", () => {
    expect(
      shouldOfferSecondPersona(
        [{ ...persona, createdAt: "2026-07-01T12:00:00-07:00" }],
        { ...persona, createdAt: "2026-07-01T12:00:00-07:00" },
        [action],
        logs,
        null,
        now,
      ),
    ).toBe(false);
    expect(
      shouldOfferSecondPersona(
        [persona, { ...persona, id: "p2" }],
        persona,
        [action],
        logs,
        null,
        now,
      ),
    ).toBe(false);
  });
});
