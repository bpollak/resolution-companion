import type { Response } from "express";
import type { ChatCompletionCreateParamsBase } from "openai/resources/chat/completions";

// GPT-5 mini shuts down on December 11, 2026. Keep every AI feature on the
// same model and supported effort; changing only the model leaves minimal
// effort incompatible with Terra.
export const OPENAI_CHAT_OPTIONS = {
  model: process.env.AI_MODEL || "gpt-6.1-terra",
  reasoning_effort: "low",
} satisfies Pick<ChatCompletionCreateParamsBase, "model" | "reasoning_effort">;

// Reasoning consumes the completion budget too. An empty or cut-off answer
// must reach the existing error path instead of looking like a successful
// coach reply (or a successfully extracted plan).
export function requireCompleteAiText(
  content: string | null | undefined,
  finishReason: string | null | undefined,
): string {
  if (finishReason !== "stop" || !content?.trim()) {
    throw new Error("AI response was empty or incomplete");
  }
  return content;
}

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
