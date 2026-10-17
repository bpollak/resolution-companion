import {
  tomorrowDateKey,
  nextScheduledDay,
  parseJourneyDate,
  actionIsScheduledOnDate,
} from "@/lib/journey-date";

test.each([
  [new Date(2026, 8, 30, 23, 59), "2026-10-01"],
  [new Date(2026, 11, 31, 23, 59), "2027-01-01"],
  [new Date(2028, 1, 28, 23, 59), "2028-02-29"],
  [new Date(2026, 2, 7, 23, 59), "2026-03-08"],
  [new Date(2026, 9, 31, 23, 59), "2026-11-01"],
])(
  "tomorrow uses the Pacific calendar across rollovers and DST",
  (now, expected) => {
    expect(tomorrowDateKey(now)).toBe(expected);
    const parsed = parseJourneyDate(expected)!;
    expect(parsed.getHours()).toBe(0);
    expect(parsed.getDate()).toBe(Number(expected.slice(-2)));
  },
);

test.each([
  undefined,
  "",
  "2026-02-30",
  "2026-13-01",
  "2026-09-05T00:00:00Z",
  "bad",
])("invalid date intent is ignored", (input) => {
  expect(parseJourneyDate(input)).toBeNull();
});

test("calendar omits days before plan approval and preserves the chosen schedule", () => {
  const action = {
    frequency: ["Friday", "Sunday"],
    createdAt: "2026-09-06T01:00:00Z",
  };
  expect(actionIsScheduledOnDate(action, new Date(2026, 8, 4))).toBe(false);
  expect(actionIsScheduledOnDate(action, new Date(2026, 8, 5))).toBe(false);
  expect(actionIsScheduledOnDate(action, new Date(2026, 8, 6))).toBe(true);
});

test("an action is available on its local approval day before its approval time", () => {
  const action = { frequency: ["Saturday"], createdAt: "2026-09-06T01:00:00Z" };
  expect(actionIsScheduledOnDate(action, new Date(2026, 8, 5))).toBe(true);
});

test("a Friday-only plan approved Sunday shows Friday, without adding today or tomorrow", () => {
  const action = {
    frequency: ["Friday"],
    createdAt: "2026-09-06T16:00:00Z",
    title: "Read one page",
  };
  const result = nextScheduledDay([action], new Date(2026, 8, 6, 9));
  expect(result?.dateKey).toBe("2026-09-11");
  expect(result?.actions).toEqual([action]);
  expect(action.frequency).toEqual(["Friday"]);
});

test("first day includes today's selected actions and excludes other weekdays", () => {
  const today = { frequency: ["Sunday"] };
  expect(
    nextScheduledDay([today, { frequency: ["Friday"] }], new Date(2026, 8, 6))
      ?.actions,
  ).toEqual([today]);
});

test.each([
  [new Date(2026, 2, 7, 23, 59), "Sunday", "2026-03-08"],
  [new Date(2026, 9, 31, 23, 59), "Sunday", "2026-11-01"],
  [new Date(2026, 11, 31, 23, 59), "Friday", "2027-01-01"],
])(
  "next scheduled day uses calendar days across DST and year boundaries",
  (now, weekday, expected) => {
    expect(nextScheduledDay([{ frequency: [weekday] }], now)?.dateKey).toBe(
      expected,
    );
  },
);

test("an empty schedule has no invented starting day", () => {
  expect(nextScheduledDay([], new Date(2026, 8, 6))).toBeNull();
  expect(
    nextScheduledDay([{ frequency: [] }], new Date(2026, 8, 6)),
  ).toBeNull();
});
