/**
 * Milestone completion is a read-modify-write on the stored milestone list.
 * Two milestones completing in the same pass used to run those writes side
 * by side, and the second write put the first milestone back to active.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createSerialQueue } from "@/lib/serial-queue";
import { storage, type Benchmark } from "@/lib/storage";

jest.mock("@react-native-async-storage/async-storage", () =>
  jest.requireActual(
    "@react-native-async-storage/async-storage/jest/async-storage-mock",
  ),
);

const milestone = (id: string): Benchmark => ({
  id,
  personaId: "p1",
  title: id,
  targetDate: null,
  status: "active",
  createdAt: "2026-11-01T09:00:00",
});

describe("createSerialQueue", () => {
  it("runs tasks one at a time, in the order they were added", async () => {
    const enqueue = createSerialQueue();
    const events: string[] = [];
    const task = (name: string, ms: number) => async () => {
      events.push(`${name}:start`);
      await new Promise((resolve) => setTimeout(resolve, ms));
      events.push(`${name}:end`);
      return name;
    };

    const results = await Promise.all([
      enqueue(task("a", 20)),
      enqueue(task("b", 1)),
      enqueue(task("c", 5)),
    ]);

    expect(results).toEqual(["a", "b", "c"]);
    expect(events).toEqual([
      "a:start",
      "a:end",
      "b:start",
      "b:end",
      "c:start",
      "c:end",
    ]);
  });

  it("keeps going after a task fails, and still reports the failure", async () => {
    const enqueue = createSerialQueue();
    const failed = enqueue(async () => {
      throw new Error("disk full");
    });
    const next = enqueue(async () => "ok");

    await expect(failed).rejects.toThrow("disk full");
    await expect(next).resolves.toBe("ok");
  });
});

describe("two milestones completing in one pass", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await storage.setBenchmarks([milestone("m1"), milestone("m2")]);
  });

  it("both stay completed when the writes go through the queue", async () => {
    const enqueue = createSerialQueue();
    await Promise.all(
      ["m1", "m2"].map((id) =>
        enqueue(() => storage.updateBenchmark(id, { status: "completed" })),
      ),
    );

    expect(
      (await storage.getBenchmarks()).map((item) => [item.id, item.status]),
    ).toEqual([
      ["m1", "completed"],
      ["m2", "completed"],
    ]);
  });

  it("documents the race the queue prevents", async () => {
    await Promise.all(
      ["m1", "m2"].map((id) =>
        storage.updateBenchmark(id, { status: "completed" }),
      ),
    );
    const completed = (await storage.getBenchmarks()).filter(
      (item) => item.status === "completed",
    );
    // Unqueued, both read the same list and the last write wins
    expect(completed).toHaveLength(1);
  });
});
