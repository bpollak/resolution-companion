import { getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { logger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import EventSource from "react-native-sse";

// The server keys its monthly AI usage quotas on this header; without it,
// requests fall back to a shared per-IP bucket.
async function getAiHeaders(): Promise<Record<string, string>> {
  return {
    "Content-Type": "application/json",
    "X-Device-Id": await storage.getDeviceId(),
    ...getAuthHeaders(),
  };
}

export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface PersonaData {
  personaName: string;
  personaDescription: string;
  benchmarks: {
    title: string;
    elementalAction: {
      title: string;
      frequency: string[];
      kickstartVersion: string;
      anchorLink: string;
    };
  }[];
}

const getSystemPrompt = (
  messageCount: number,
) => `You are a friendly coach helping people achieve their goals. Your role is to understand what the user wants to accomplish and create a personalized action plan.

Keep your responses concise (2-3 sentences max) and ask one question at a time. Be warm, casual, and supportive.

NEVER use the word "persona" — say "the future you" or "who you're becoming" instead.

If the user gives multiple goals, help them pick ONE to start with (they can add more later). If their goal is vague ("be better", "get healthy"), ask one clarifying question to make it concrete before moving on. If they mention their schedule or routine (mornings, commute, weekends), acknowledge it — it will shape their plan. You are not a therapist or medical professional; for health treatment or mental-health topics, gently suggest a qualified professional while staying supportive about habits.

${
  messageCount === 0
    ? `
OPENING MESSAGE: Exactly ONE warm sentence of welcome, then ONE question. No lists, no explanations of how the app works.

Ask: "What's a goal you're working toward, or something you'd like to accomplish in the next few months?"
`
    : messageCount === 1
      ? `
STAGE 2: Acknowledge their goal positively in 1 sentence. In 1 more sentence, frame it as becoming the future version of themselves who has achieved it.

Suggest 1-2 specific small daily habits that could help. Make them simple and easy to start.

Ask ONE brief follow-up: "Do these sound like good starting points, or do you have other habits in mind?"
`
      : messageCount >= 2
        ? `
CRITICAL INSTRUCTION: You have enough information. Your response MUST be a warm, encouraging 2-sentence statement that briefly summarizes their goal and says their personalized plan — milestones with small daily actions — is ready to build.

DO NOT END WITH A QUESTION. They'll tap "Create My Plan" next.
`
        : ``
}`;

const EXTRACTION_PROMPT = `Based on this conversation, extract the user's goal and create their personalized action plan.

Return ONLY valid JSON in this exact format:
{
  "personaName": "A short, attainable-aspirational identity title for who they become when they achieve this goal (e.g., 'Consistent Runner', 'Published Writer', 'Calm Morning Person'). Avoid grandiose superlatives like 'Elite' or 'World-Class' unless the user used them.",
  "personaDescription": "1-2 sentences, present tense, describing this future version of themselves as if it's already true (e.g., 'A runner who laces up without negotiating with herself...')",
  "benchmarks": [
    {
      "title": "A key milestone on the path to their goal",
      "elementalAction": {
        "title": "A specific, concrete, verifiable action (someone else could confirm it was done)",
        "frequency": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        "kickstartVersion": "A 2-minute version of this action to reduce friction and build consistency",
        "anchorLink": "An existing habit to attach this to, like 'After I pour my morning coffee'"
      }
    }
  ]
}

RULES:
- Create between 3 and 5 benchmarks (minimum 3, maximum 5). Each is presented to the user as a milestone that completes once its action has been done on about 21 scheduled days — make each a meaningful, achievable consistency target with ONE specific action.
- "frequency" values MUST be exact weekday names from this set only: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday. Monthly or ordinal cadences ("First Thursday", "Last Tuesday", "every other week") are NOT supported — if a behavior would be occasional, schedule it weekly on one of the user's available days instead.
- SCHEDULING MUST MATCH WHAT THE USER SAID. If they said "weekday mornings," schedule weekdays; if they mentioned limited time, schedule fewer days. Never default everything to 7 days/week — total scheduled actions across all benchmarks should fit realistically inside the time they described. Vary cadence: at most one daily action; support actions 2-4 days/week.
- ANCHORS MUST COME FROM THE USER'S OWN ROUTINE when they mentioned one (their words: coffee, commute, lunch, kids' bedtime). Only invent a generic anchor if they gave nothing.
- Actions must not overlap or double-count each other (two benchmarks must never be satisfied by the same behavior).
- Kickstart versions must take under 2 minutes and be genuinely easier than the full action.
- Write everything in the user's language and vocabulary where possible — the plan should feel like it came from their own words.`;

const STREAM_DELAY_MS = 30;

async function delayedChunkEmitter(
  chunk: string,
  onChunk: (chunk: string) => void,
  queue: { pending: string[]; processing: boolean },
  processQueue: () => Promise<void>,
) {
  queue.pending.push(chunk);
  if (!queue.processing) {
    processQueue();
  }
}

export async function sendChatMessageStreaming(
  messages: AIMessage[],
  onChunk: (chunk: string) => void,
): Promise<string> {
  const url = new URL("/api/chat", getApiUrl());
  const headers = await getAiHeaders();

  return new Promise((resolve, reject) => {
    let fullContent = "";
    let streamDone = false;
    const queue = { pending: [] as string[], processing: false };

    // Abort if the stream stalls so the UI never spins forever
    const IDLE_TIMEOUT_MS = 45000;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        es.close();
        if (!streamDone) {
          reject(
            new Error(
              "The connection timed out. Please check your internet and try again.",
            ),
          );
        }
      }, IDLE_TIMEOUT_MS);
    };

    const processQueue = async () => {
      if (queue.processing) return;
      queue.processing = true;

      while (queue.pending.length > 0) {
        const text = queue.pending.shift()!;
        for (const char of text) {
          onChunk(char);
          await new Promise((r) => setTimeout(r, STREAM_DELAY_MS));
        }
      }

      queue.processing = false;
      if (streamDone && queue.pending.length === 0) {
        resolve(fullContent);
      }
    };

    const es = new EventSource<"message">(url.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify({ messages }),
    });

    resetIdleTimer();

    es.addEventListener("message", (event) => {
      resetIdleTimer();
      if (event.data === "[DONE]") {
        if (idleTimer) clearTimeout(idleTimer);
        es.close();
        streamDone = true;
        if (!fullContent) {
          // Stream ended without any text — never leave an empty bubble
          reject(
            new Error(
              "The coach didn't send a reply that time. Please try again.",
            ),
          );
          return;
        }
        if (!queue.processing && queue.pending.length === 0) {
          resolve(fullContent);
        }
        return;
      }

      try {
        const parsed = JSON.parse(event.data || "{}");
        if (parsed.content) {
          fullContent += parsed.content;
          delayedChunkEmitter(parsed.content, onChunk, queue, processQueue);
        }
        if (parsed.error) {
          if (idleTimer) clearTimeout(idleTimer);
          es.close();
          reject(new Error(parsed.error));
        }
      } catch (parseError) {
        // Skip the malformed event but surface it for debugging
        logger.warn("Skipping malformed SSE event:", parseError);
      }
    });

    es.addEventListener("error", () => {
      if (idleTimer) clearTimeout(idleTimer);
      es.close();
      reject(
        new Error(
          "We couldn't reach the coaching service. Please check your internet connection and try again.",
        ),
      );
    });
  });
}

export async function getOnboardingResponse(
  messages: AIMessage[],
  onChunk?: (chunk: string) => void,
): Promise<string> {
  const userMessageCount = messages.filter((m) => m.role === "user").length;
  const systemMessage: AIMessage = {
    role: "system",
    content: getSystemPrompt(userMessageCount),
  };

  return sendChatMessageStreaming(
    [systemMessage, ...messages],
    onChunk || (() => {}),
  );
}

export async function extractPersonaFromConversation(
  messages: AIMessage[],
): Promise<PersonaData> {
  const url = new URL("/api/extract-persona", getApiUrl());

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: await getAiHeaders(),
    body: JSON.stringify({
      messages,
      extractionPrompt: EXTRACTION_PROMPT,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to extract persona");
  }

  return response.json();
}

export interface MonthlyContext {
  dayOfMonth: number;
  daysInMonth: number;
  percentThroughMonth: number;
  completionRate: number;
  isAhead: boolean;
  isBehind: boolean;
  personaCreatedAt?: string;
  daysSincePersonaCreated?: number;
}

export function getMonthlyContext(
  momentumScore: number,
  personaCreatedAt?: string,
): MonthlyContext {
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();
  const percentThroughMonth = Math.round((dayOfMonth / daysInMonth) * 100);
  const completionRate = momentumScore;
  // Consistency already measures only scheduled days since the plan existed,
  // so it is judged on its own scale — comparing it to % of the calendar
  // month elapsed misreads anyone who started mid-month.
  const isAhead = completionRate >= 80;
  const isBehind = completionRate < 50;

  const context: MonthlyContext = {
    dayOfMonth,
    daysInMonth,
    percentThroughMonth,
    completionRate,
    isAhead,
    isBehind,
  };

  if (personaCreatedAt) {
    const createdDate = new Date(personaCreatedAt);
    context.personaCreatedAt = personaCreatedAt;
    context.daysSincePersonaCreated = Math.floor(
      (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24),
    );
  }

  return context;
}

export async function getReflectionResponse(
  messages: AIMessage[],
  momentumScore: number,
  periodType: string,
  onChunk?: (chunk: string) => void,
  monthlyContext?: MonthlyContext,
  persona?: { name: string; description: string },
): Promise<string> {
  const isFirstMessage = messages.length === 1;
  const ctx = monthlyContext || getMonthlyContext(momentumScore);

  const daysSince = ctx.daysSincePersonaCreated;
  const justStarted = daysSince !== undefined && daysSince <= 7;
  const startedMidMonth =
    daysSince !== undefined && daysSince + 1 < ctx.dayOfMonth;

  const personaAgeContext =
    daysSince !== undefined
      ? `\n- They started their plan ${daysSince === 0 ? "today" : daysSince === 1 ? "yesterday" : `${daysSince} days ago`}${justStarted ? " (brand new - be encouraging and set realistic expectations)" : daysSince <= 30 ? " (still building habits - focus on consistency over perfection)" : " (established user - can discuss deeper patterns)"}`
      : "";

  const progressContext = `
MONTHLY CONTEXT:
- Today is day ${ctx.dayOfMonth} of ${ctx.daysInMonth} in the calendar month.${personaAgeContext}
- Consistency since they started: ${ctx.completionRate}% of scheduled actions completed.
- Read on that number: ${ctx.isAhead ? "strong - celebrate it" : ctx.isBehind ? "struggling - reduce friction, never scold" : "building - steady progress worth encouraging"}

IMPORTANT: Progress only counts from the day they started their plan${startedMidMonth ? " (they started partway through this month)" : ""}. Frame everything around how long THEY have been at it — days since they started — never around the calendar month. Never say they are "ahead of pace" or "behind pace" relative to the month, and never describe pre-start days as missed; those days simply weren't tracked.
`;

  const identityContext = persona
    ? `
WHO THEY ARE BECOMING (the identity they chose — this is the person your coaching is in service of):
"${persona.name}" — ${persona.description}
Speak to them as this person-in-progress. Frame feedback around what "${persona.name}" would do, and treat every completed action as a vote for becoming them. Reference this identity naturally (e.g. "the ${persona.name} you're building toward") but NEVER use the word "persona."
`
    : "";

  const systemMessage: AIMessage = {
    role: "system",
    content: `You are a supportive coach helping the user with their monthly progress check-in. ${progressContext}${identityContext}

VOICE RULES:
- NEVER use the word "persona" — say "your plan" or "who you're becoming."
- Call their long-term metric "consistency" (it's their % of scheduled actions completed this month). Their goals are "milestones" that fill up as they complete daily actions — milestones never lose progress.
- Identity framing: completed actions are votes for who they're becoming. A missed stretch is a plan problem, not a character problem — respond by shrinking the action or moving its schedule, never by scolding.
- You are not a therapist or medical professional. If health, medication, or mental-health treatment comes up, be kind and suggest a qualified professional while staying supportive about their habits.

${isFirstMessage ? `FIRST MESSAGE: Be brief (2-3 sentences max). Anchor on how long they've been at their plan${justStarted ? " — they just started, so welcome them to their first days and celebrate showing up at all" : " and their consistency over that time"}. ${ctx.isAhead ? "Their consistency is strong — celebrate it." : ctx.isBehind ? "They're struggling — be encouraging and ask what's been challenging." : "They're building — note the steady progress."} Ask ONE simple question about their experience. No lengthy explanations.` : `Continue the conversation naturally. Keep responses concise (2-4 sentences). Use the monthly context to give relevant advice. If they're struggling, gently suggest smaller actions, easier kickstart versions, or fewer scheduled days. If consistency is strong, acknowledge their momentum and ask about what's working.`}

Be warm and practical. No bullet points or lists in responses.`,
  };

  const url = new URL("/api/reflection", getApiUrl());

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: await getAiHeaders(),
    body: JSON.stringify({ messages: [systemMessage, ...messages] }),
  });

  if (!response.ok) {
    throw new Error("Failed to get AI response");
  }

  const data = await response.json();
  const fullContent = data.content || "";

  if (onChunk) {
    for (const char of fullContent) {
      onChunk(char);
      await new Promise((r) => setTimeout(r, STREAM_DELAY_MS));
    }
  }

  return fullContent;
}
