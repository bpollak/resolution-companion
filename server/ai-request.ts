import type { Response } from "express";

// A hung upstream must not pin a request for the SDK's 10 minute default, and
// each extra retry on a streaming route doubles first-token latency.
export const OPENAI_CLIENT_OPTIONS = {
  timeout: 30_000,
  maxRetries: 1,
} as const;

type ResponseLike = Pick<
  Response,
  | "on"
  | "writableFinished"
  | "writableEnded"
  | "destroyed"
  | "headersSent"
  | "write"
  | "end"
  | "status"
  | "json"
>;

export interface UpstreamAbort {
  signal: AbortSignal;
  clientDisconnected: () => boolean;
}

// Node 22 emits 'close' on the request as soon as its body is consumed, so a
// request listener added later never fires and req.destroyed is already true
// in every handler. The response's 'close' is the reliable disconnect signal;
// it also fires after a normal finish, which writableFinished tells apart.
// Call this before awaiting the upstream request so an early drop still aborts.
export function abortOnClientDisconnect(res: ResponseLike): UpstreamAbort {
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) controller.abort();
  });
  return {
    signal: controller.signal,
    clientDisconnected: () => controller.signal.aborted || res.destroyed,
  };
}

// Disconnects are expected on mobile and stay silent. Anything else is a real
// failure: log it and tell the client, in the shape the route already speaks.
export function sendAiRouteError(
  res: ResponseLike,
  upstream: UpstreamAbort,
  label: string,
  error: unknown,
  fallback: { status: number; body: Record<string, unknown> },
): void {
  if (upstream.clientDisconnected()) return;
  console.error(label, error);
  if (res.writableEnded) return;
  if (res.headersSent) {
    res.write(
      `data: ${JSON.stringify({ error: "Failed to get AI response" })}\n\n`,
    );
    res.end();
    return;
  }
  res.status(fallback.status).json(fallback.body);
}
