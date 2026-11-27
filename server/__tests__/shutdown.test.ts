/** @jest-environment node */
import { EventEmitter } from "node:events";
import { installProcessHandlers } from "../shutdown";

function setup(overrides: { closePool?: () => Promise<void> } = {}) {
  const proc = new EventEmitter();
  const calls: string[] = [];
  const server = {
    close: jest.fn((done: (error?: Error) => void) => {
      calls.push("server.close");
      done();
    }),
    closeIdleConnections: jest.fn(() => {
      calls.push("idle");
    }),
  };
  const closePool =
    overrides.closePool ??
    jest.fn(async () => {
      calls.push("pool.end");
    });
  const exit = jest.fn((code: number) => {
    calls.push(`exit:${code}`);
  });
  const handlers = installProcessHandlers({
    proc,
    server,
    closePool,
    exit,
    forceExitMs: 50,
  });
  return { proc, server, closePool, exit, calls, handlers };
}

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("process handlers", () => {
  it("logs an unhandled rejection and keeps running", () => {
    const { proc, exit } = setup();
    expect(() =>
      proc.emit("unhandledRejection", new Error("lost promise")),
    ).not.toThrow();
    expect(console.error).toHaveBeenCalledWith(
      "Unhandled promise rejection:",
      expect.any(Error),
    );
    expect(exit).not.toHaveBeenCalled();
  });

  it("closes the server, then the pool, then exits cleanly on SIGTERM", async () => {
    const { proc, calls, handlers } = setup();
    proc.emit("SIGTERM");
    await handlers.shutdownComplete();
    expect(calls).toEqual(["server.close", "idle", "pool.end", "exit:0"]);
  });

  it("shuts down once even if SIGTERM arrives twice", async () => {
    const { proc, server, handlers } = setup();
    proc.emit("SIGTERM");
    proc.emit("SIGTERM");
    await handlers.shutdownComplete();
    expect(server.close).toHaveBeenCalledTimes(1);
  });

  it("still exits when closing the pool fails", async () => {
    const { proc, exit, handlers } = setup({
      closePool: async () => {
        throw new Error("pool already ended");
      },
    });
    proc.emit("SIGTERM");
    await handlers.shutdownComplete();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("forces an exit when open connections never drain", async () => {
    const proc = new EventEmitter();
    const exit = jest.fn();
    installProcessHandlers({
      proc,
      server: { close: jest.fn(), closeIdleConnections: jest.fn() },
      closePool: async () => {},
      exit,
      forceExitMs: 20,
    });
    proc.emit("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(exit).toHaveBeenCalledWith(1);
  });
});
