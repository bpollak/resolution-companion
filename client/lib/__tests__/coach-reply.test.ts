import { createReplyLifecycle } from "@/lib/coach-reply";
import { createTextStreamBuffer } from "@/lib/stream-buffer";
const question = [
  { id: "u1", role: "user" as const, content: "Help me restart" },
];

test("stop and save retains buffered partial text once, without accepting late output", () => {
  jest.useFakeTimers();
  const lifecycle = createReplyLifecycle();
  const request = lifecycle.begin(question);
  const buffer = createTextStreamBuffer((chunk) =>
    lifecycle.append(request, chunk),
  );
  buffer.append("Start with a walk");
  buffer.flush();
  const stopped = lifecycle.stop()!;
  buffer.cancel();
  expect(request.signal.aborted).toBe(true);
  expect(stopped.messages.map((message) => message.content)).toEqual([
    "Help me restart",
    "Partial response:\n\nStart with a walk",
  ]);
  expect(stopped.retry).toEqual(question);
  expect(lifecycle.append(request, "late token")).toBeNull();
  expect(lifecycle.complete(request, "late response")).toBeNull();
  expect(lifecycle.stop()).toBeNull();
  jest.runAllTimers();
  jest.useRealTimers();
});

test("retry replaces the partial answer without duplicating the user's question", () => {
  const lifecycle = createReplyLifecycle();
  const first = lifecycle.begin(question);
  lifecycle.append(first, "A partial");
  const interrupted = lifecycle.stop()!;
  const retry = lifecycle.begin(interrupted.retry);
  expect(lifecycle.complete(first, "late result")).toBeNull();
  const saved = lifecycle.complete(retry, "A complete answer")!;
  expect(saved).toHaveLength(2);
  expect(saved.filter((message) => message.role === "user")).toEqual(question);
  expect(saved[1].content).toBe("A complete answer");
  expect(lifecycle.complete(retry, "duplicate")).toBeNull();
});

test("stopping before the first token preserves only the question and can retry", () => {
  const lifecycle = createReplyLifecycle();
  lifecycle.begin(question);
  expect(lifecycle.stop()).toMatchObject({
    messages: question,
    retry: question,
  });
});

test("a replacement generation aborts and ignores the old request", () => {
  const lifecycle = createReplyLifecycle();
  const old = lifecycle.begin(question);
  const current = lifecycle.begin(question);
  expect(old.signal.aborted).toBe(true);
  expect(lifecycle.append(old, "stale")).toBeNull();
  expect(lifecycle.append(current, "current")).toBe("current");
});
