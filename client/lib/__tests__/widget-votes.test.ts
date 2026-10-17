/**
 * Widget and Siri votes share one App Group queue; a double tap, or a widget
 * tap plus a Siri vote, used to apply the same completion twice in one pass
 * (2026-10-13 review, A1).
 */

import { consumePendingVotes, dedupePendingVotes } from "@/lib/widget";

const mockAppGroup = new Map<string, string>();

jest.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => ({
    getItem: (_group: string, key: string) => mockAppGroup.get(key) ?? null,
    setItem: (_group: string, key: string, value: string) => {
      mockAppGroup.set(key, value);
    },
    removeItem: (_group: string, key: string) => {
      mockAppGroup.delete(key);
    },
    reloadWidgets: () => {},
  }),
}));

jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));

beforeEach(() => {
  mockAppGroup.clear();
});

describe("pending widget votes", () => {
  it("keeps one vote per action and day, the first one cast", () => {
    expect(
      dedupePendingVotes([
        { actionId: "walk", date: "2026-10-13", kind: "kickstart" },
        { actionId: "walk", date: "2026-10-13", kind: "full", source: "siri" },
        { actionId: "walk", date: "2026-10-12", kind: "full" },
        { actionId: "read", date: "2026-10-13", kind: "full" },
      ]),
    ).toEqual([
      { actionId: "walk", date: "2026-10-13", kind: "kickstart" },
      { actionId: "walk", date: "2026-10-12", kind: "full" },
      { actionId: "read", date: "2026-10-13", kind: "full" },
    ]);
  });

  it("consumes the queue once and returns it deduplicated", () => {
    mockAppGroup.set(
      "pendingVotes",
      JSON.stringify([
        {
          actionId: "walk",
          date: "2026-10-13",
          kind: "full",
          source: "widget",
        },
        {
          actionId: "walk",
          date: "2026-10-13",
          kind: "full",
          source: "widget",
        },
      ]),
    );
    expect(consumePendingVotes()).toEqual([
      { actionId: "walk", date: "2026-10-13", kind: "full", source: "widget" },
    ]);
    expect(consumePendingVotes()).toEqual([]);
  });
});
