// Guard the OpenAI-backed endpoints against oversized payloads (token burn).
// Coach system prompts legitimately contain bounded identity, action, and
// session context, so they need a larger allowance than user-authored turns.
const MAX_MESSAGES = 50;
const MAX_CONVERSATION_MESSAGE_CHARS = 4000;
const MAX_SYSTEM_MESSAGE_CHARS = 16000;
const MAX_TOTAL_CHARS = 50000;
const VALID_ROLES = new Set(["user", "assistant", "system"]);

export function validateMessages(messages: unknown): string | null {
  if (!Array.isArray(messages) || messages.length === 0) {
    return "messages must be a non-empty array";
  }
  if (messages.length > MAX_MESSAGES) {
    return `messages must contain at most ${MAX_MESSAGES} entries`;
  }

  let totalChars = 0;
  for (const message of messages) {
    if (
      typeof message !== "object" ||
      message === null ||
      typeof (message as { content?: unknown }).content !== "string" ||
      !VALID_ROLES.has(String((message as { role?: unknown }).role))
    ) {
      return "each message must have a valid role and string content";
    }

    const { role, content } = message as {
      role: "user" | "assistant" | "system";
      content: string;
    };
    const messageLimit =
      role === "system"
        ? MAX_SYSTEM_MESSAGE_CHARS
        : MAX_CONVERSATION_MESSAGE_CHARS;
    if (content.length > messageLimit) {
      return `${role} messages must be at most ${messageLimit} characters`;
    }
    totalChars += content.length;
  }

  if (totalChars > MAX_TOTAL_CHARS) {
    return `messages must total at most ${MAX_TOTAL_CHARS} characters`;
  }
  return null;
}
