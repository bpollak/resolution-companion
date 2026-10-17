export interface CoachMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export function interruptedConversation(
  messages: CoachMessage[],
  partial: string,
  id: string,
): CoachMessage[] {
  return partial.trim()
    ? [
        ...messages,
        { id, role: "assistant", content: `Partial response:\n\n${partial}` },
      ]
    : [...messages];
}

// Token callbacks can arrive after cancellation; only the active generation
// may update the transcript. This also provides a synchronous save snapshot.
export function createReplyLifecycle() {
  let active: {
    controller: AbortController;
    messages: CoachMessage[];
    text: string;
    id: string;
  } | null = null;
  return {
    begin(messages: CoachMessage[]) {
      active?.controller.abort();
      active = {
        controller: new AbortController(),
        messages: [...messages],
        text: "",
        id: `${Date.now()}-assistant`,
      };
      return active.controller;
    },
    append(controller: AbortController, chunk: string) {
      if (active?.controller !== controller) return null;
      active.text += chunk;
      return active.text;
    },
    complete(
      controller: AbortController,
      response: string,
    ): CoachMessage[] | null {
      if (active?.controller !== controller) return null;
      const messages: CoachMessage[] = [
        ...active.messages,
        { id: active.id, role: "assistant", content: response },
      ];
      active = null;
      return messages;
    },
    stop() {
      if (!active) return null;
      const snapshot = active;
      active = null;
      snapshot.controller.abort();
      return {
        messages: interruptedConversation(
          snapshot.messages,
          snapshot.text,
          snapshot.id,
        ),
        retry: snapshot.messages,
      };
    },
  };
}
