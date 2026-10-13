import { EventEmitter } from "node:events";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { abortOnClientDisconnect, sendAiRouteError } from "../ai-request";

class FakeResponse extends EventEmitter {
  writableFinished = false;
  writableEnded = false;
  destroyed = false;
  headersSent = false;
  statusCode = 200;
  chunks: string[] = [];
  jsonBody: unknown = undefined;

  write(chunk: string) {
    this.chunks.push(chunk);
    return true;
  }
  end() {
    this.writableEnded = true;
    return this;
  }
  status(code: number) {
    this.statusCode = code;
    return this;
  }
  json(body: unknown) {
    this.headersSent = true;
    this.jsonBody = body;
    this.writableEnded = true;
    return this;
  }
}

function fake() {
  return new FakeResponse() as FakeResponse &
    Parameters<typeof abortOnClientDisconnect>[0];
}

const fallback = { status: 500, body: { error: "Failed to get AI response" } };

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("AI route disconnect handling", () => {
  it("aborts the upstream request when the client drops mid-response", () => {
    const res = fake();
    const upstream = abortOnClientDisconnect(res);
    res.headersSent = true;
    res.destroyed = true;
    res.emit("close");
    expect(upstream.signal.aborted).toBe(true);
    expect(upstream.clientDisconnected()).toBe(true);
  });

  it("does not abort when the response closes after finishing normally", () => {
    const res = fake();
    const upstream = abortOnClientDisconnect(res);
    res.writableFinished = true;
    res.emit("close");
    expect(upstream.signal.aborted).toBe(false);
  });

  it("stays silent on errors caused by a disconnect", () => {
    const res = fake();
    const upstream = abortOnClientDisconnect(res);
    res.destroyed = true;
    res.emit("close");
    sendAiRouteError(
      res,
      upstream,
      "Chat error:",
      new Error("aborted"),
      fallback,
    );
    expect(console.error).not.toHaveBeenCalled();
    expect(res.chunks).toEqual([]);
  });

  it("logs a real upstream failure and sends an SSE error frame once streaming", () => {
    const res = fake();
    const upstream = abortOnClientDisconnect(res);
    res.headersSent = true;
    sendAiRouteError(res, upstream, "Chat error:", new Error("500"), fallback);
    expect(console.error).toHaveBeenCalledWith(
      "Chat error:",
      expect.any(Error),
    );
    expect(res.chunks).toEqual([
      `data: ${JSON.stringify({ error: "Failed to get AI response" })}\n\n`,
    ]);
    expect(res.writableEnded).toBe(true);
  });

  it("answers a JSON route with its fallback status before headers are sent", () => {
    const res = fake();
    const upstream = abortOnClientDisconnect(res);
    sendAiRouteError(
      res,
      upstream,
      "Plan Tune-Up error:",
      new Error("timeout"),
      {
        status: 503,
        body: { error: "unavailable" },
      },
    );
    expect(console.error).toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({ error: "unavailable" });
  });
});

// Exercises the real Node HTTP stack, where req 'close' fires as soon as the
// body is read, to prove the response-based signal tracks the socket instead.
describe("AI route disconnect handling over real HTTP", () => {
  async function withServer(
    handler: (
      req: http.IncomingMessage,
      res: http.ServerResponse,
    ) => void | Promise<void>,
    run: (port: number) => Promise<void>,
  ) {
    const server = http.createServer((req, res) => {
      void handler(req, res);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      await run((server.address() as AddressInfo).port);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  function readBody(req: http.IncomingMessage) {
    return new Promise<void>((resolve) => {
      req.resume();
      req.on("end", resolve);
    });
  }

  it("aborts when the client disconnects after sending its body", async () => {
    let aborted!: () => void;
    const abortedPromise = new Promise<void>((resolve) => (aborted = resolve));
    await withServer(
      async (req, res) => {
        const upstream = abortOnClientDisconnect(res as never);
        upstream.signal.addEventListener("abort", () => aborted());
        await readBody(req);
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.flushHeaders();
      },
      async (port) => {
        await new Promise<void>((resolve) => {
          const client = http.request({
            port,
            host: "127.0.0.1",
            method: "POST",
            path: "/",
            headers: { "Content-Type": "application/json" },
          });
          client.on("response", () => {
            client.destroy();
            resolve();
          });
          client.on("error", () => {});
          client.end(JSON.stringify({ messages: [] }));
        });
        await abortedPromise;
      },
    );
  });

  it("does not abort a response that finishes normally", async () => {
    let upstream!: ReturnType<typeof abortOnClientDisconnect>;
    let closed!: () => void;
    const closedPromise = new Promise<void>((resolve) => (closed = resolve));
    await withServer(
      async (req, res) => {
        upstream = abortOnClientDisconnect(res as never);
        res.on("close", () => closed());
        await readBody(req);
        res.end("ok");
      },
      async (port) => {
        await new Promise<void>((resolve, reject) => {
          const client = http.request(
            { port, host: "127.0.0.1", method: "POST", path: "/" },
            (response) => {
              response.resume();
              response.on("end", resolve);
            },
          );
          client.on("error", reject);
          client.end("{}");
        });
        await closedPromise;
        expect(upstream.signal.aborted).toBe(false);
      },
    );
  });
});
