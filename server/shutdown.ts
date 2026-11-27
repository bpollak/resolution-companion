// Process-level safety nets, kept apart from index.ts so they can be tested
// without starting the server.

interface ProcessLike {
  on(event: string, listener: (...args: any[]) => void): unknown;
}

interface ServerLike {
  close(callback: (error?: Error) => void): unknown;
  closeIdleConnections(): void;
}

export interface ProcessHandlerOptions {
  server: ServerLike;
  closePool: () => Promise<void>;
  proc?: ProcessLike;
  exit?: (code: number) => void;
  forceExitMs?: number;
}

export function installProcessHandlers({
  server,
  closePool,
  proc = process,
  exit = (code) => process.exit(code),
  forceExitMs = 10_000,
}: ProcessHandlerOptions) {
  // A rejected promise nobody awaited (a fire-and-forget write, say) ends the
  // process by default in current Node. One stray rejection must not drop
  // every in-flight coaching reply, so log it and keep serving.
  proc.on("unhandledRejection", (reason: unknown) => {
    console.error("Unhandled promise rejection:", reason);
  });

  let shutdown: Promise<void> | null = null;

  // The host sends SIGTERM on every deploy. Stop accepting connections, let
  // in-flight requests finish, then release the database connections.
  proc.on("SIGTERM", () => {
    if (shutdown) return;
    console.log("SIGTERM received: closing server");
    // A streaming reply can hold a connection open far longer than the host
    // waits before SIGKILL; do not let one keep the process alive.
    const force = setTimeout(() => {
      console.error("Shutdown timed out; exiting");
      exit(1);
    }, forceExitMs);
    force.unref();

    shutdown = (async () => {
      let code = 0;
      try {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
          // close() alone waits on idle keep-alive sockets.
          server.closeIdleConnections();
        });
      } catch (error) {
        console.error("Server close error:", error);
        code = 1;
      }
      try {
        await closePool();
      } catch (error) {
        console.error("Database pool close error:", error);
        code = 1;
      }
      clearTimeout(force);
      exit(code);
    })();
  });

  return {
    shutdownComplete: (): Promise<void> => shutdown ?? Promise.resolve(),
  };
}
