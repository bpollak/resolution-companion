/**
 * The free Coach quota resets with the person's own calendar month. Keyed by
 * the UTC month it reset at 4 PM Pacific on the last day of the month, and
 * the paywall's "more become available <first of next month>" was wrong.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { storage } from "@/lib/storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual(
    "@react-native-async-storage/async-storage/jest/async-storage-mock",
  ),
);

describe("free coach quota month", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("keeps counting in the local month on its last evening", async () => {
    jest.setSystemTime(new Date(2026, 11, 31, 15, 0)); // Dec 31, 3 PM Pacific
    await storage.incrementReflectionCount();
    await storage.incrementReflectionCount();

    // 8 PM Pacific on Dec 31 is already January in UTC
    jest.setSystemTime(new Date(2026, 11, 31, 20, 0));
    expect(await storage.getMonthlyReflectionCount()).toEqual({
      month: "2026-12",
      count: 2,
    });
    expect(await storage.incrementReflectionCount()).toBe(3);
  });

  it("resets at local midnight on the first", async () => {
    jest.setSystemTime(new Date(2026, 11, 31, 20, 0));
    await storage.incrementReflectionCount();

    jest.setSystemTime(new Date(2027, 0, 1, 0, 5));
    expect(await storage.getMonthlyReflectionCount()).toEqual({
      month: "2027-01",
      count: 0,
    });
    expect(await storage.incrementReflectionCount()).toBe(1);
  });
});
