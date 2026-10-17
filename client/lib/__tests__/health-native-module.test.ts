import { NativeModules } from "react-native";
import { initHealth, isHealthAvailable, isHealthGoalMet } from "@/lib/health";

jest.mock("react-native", () => {
  const module = Object.defineProperties(
    {},
    {
      initHealthKit: {
        get: () => (_options: unknown, callback: (error: null) => void) =>
          callback(null),
      },
      getStepCount: {
        get:
          () =>
          (
            _options: unknown,
            callback: (error: null, result: { value: number }) => void,
          ) =>
            callback(null, { value: 7000 }),
      },
      getSamples: {
        get:
          () =>
          (
            _options: unknown,
            callback: (error: null, result: unknown[]) => void,
          ) =>
            callback(null, []),
      },
      getMindfulSession: {
        get:
          () =>
          (
            _options: unknown,
            callback: (error: null, result: unknown[]) => void,
          ) =>
            callback(null, []),
      },
    },
  );
  return { Platform: { OS: "ios" }, NativeModules: { AppleHealthKit: module } };
});
// Mirrors the dependency's export when Object.assign misses lazy native methods.
jest.mock("react-native-health", () => ({ Constants: { Permissions: {} } }));
jest.mock("@/lib/logger", () => ({ logger: { error: jest.fn() } }));

test("requests permission and reads HealthKit through non-enumerable native methods", async () => {
  expect(Object.keys(NativeModules.AppleHealthKit)).toEqual([]);
  expect(isHealthAvailable()).toBe(true);
  expect(await isHealthGoalMet("steps")).toBe(false);
  expect(await initHealth()).toBe(true);
  expect(await isHealthGoalMet("steps")).toBe(true);
  expect(await isHealthGoalMet("workout")).toBe(false);
});
