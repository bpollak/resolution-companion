import { getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { logger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import EventSource from "react-native-sse";
import { normalizeCoachMilestoneProposal } from "@/lib/milestone-proposal";

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

export async function getNextMilestoneProposal(
  completedMilestone: string,
  personaName: string,
): Promise<string> {
  const url = new URL("/api/milestone-proposal", getApiUrl());
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: await getAiHeaders(),
    body: JSON.stringify({ completedMilestone, personaName }),
  });
  if (!response.ok) throw new Error("Failed to suggest a milestone");
  const payload = (await response.json()) as { title?: unknown };
  const proposal = normalizeCoachMilestoneProposal(payload.title);
  if (!proposal) throw new Error("The coach returned an invalid milestone");
  return proposal.title;
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
const REQUEST_TIMEOUT_MS = 20000;

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const externalSignal = init.signal;
  let timedOut = false;
  const handleExternalAbort = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else
    externalSignal?.addEventListener("abort", handleExternalAbort, {
      once: true,
    });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new Error("The coach response timed out.");
    throw error;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", handleExternalAbort);
  }
}

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
  return streamSSERequest("/api/chat", { messages }, onChunk, STREAM_DELAY_MS);
}

/**
 * POST an SSE endpoint and stream its `{content}` events. `charDelayMs > 0`
 * replays each chunk character-by-character for a typewriter feel (the
 * onboarding interview); 0 emits chunks as they truly arrive (the coach —
 * perceived responsiveness is coach-quality UX).
 */
async function streamSSERequest(
  path: string,
  body: Record<string, unknown>,
  onChunk: (chunk: string) => void,
  charDelayMs: number,
  signal?: AbortSignal,
): Promise<string> {
  const url = new URL(path, getApiUrl());
  const headers = await getAiHeaders();

  return new Promise((resolve, reject) => {
    let fullContent = "";
    let streamDone = false;
    let settled = false;
    const queue = { pending: [] as string[], processing: false };

    // Abort if the stream stalls so the UI never spins forever
    const IDLE_TIMEOUT_MS = REQUEST_TIMEOUT_MS;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let es: EventSource<"message">;
    const cleanup = () => {
      if (idleTimer) clearTimeout(idleTimer);
      signal?.removeEventListener("abort", handleAbort);
    };
    const resolveOnce = (content: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(content);
    };
    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const handleAbort = () => {
      es?.close();
      const error = new Error("Coach request cancelled");
      error.name = "AbortError";
      rejectOnce(error);
    };
    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        es.close();
        if (!streamDone) {
          rejectOnce(
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
        if (charDelayMs > 0) {
          for (const char of text) {
            onChunk(char);
            await new Promise((r) => setTimeout(r, charDelayMs));
          }
        } else {
          onChunk(text);
        }
      }

      queue.processing = false;
      if (streamDone && queue.pending.length === 0) {
        resolveOnce(fullContent);
      }
    };

    es = new EventSource<"message">(url.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (signal?.aborted) {
      handleAbort();
      return;
    }
    signal?.addEventListener("abort", handleAbort, { once: true });

    resetIdleTimer();

    es.addEventListener("message", (event) => {
      resetIdleTimer();
      if (event.data === "[DONE]") {
        if (idleTimer) clearTimeout(idleTimer);
        es.close();
        streamDone = true;
        if (!fullContent) {
          // Stream ended without any text — never leave an empty bubble
          rejectOnce(
            new Error(
              "The coach didn't send a reply that time. Please try again.",
            ),
          );
          return;
        }
        if (!queue.processing && queue.pending.length === 0) {
          resolveOnce(fullContent);
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
          rejectOnce(new Error(parsed.error));
        }
      } catch (parseError) {
        // Skip the malformed event but surface it for debugging
        logger.warn("Skipping malformed SSE event:", parseError);
      }
    });

    es.addEventListener("error", () => {
      if (idleTimer) clearTimeout(idleTimer);
      es.close();
      rejectOnce(
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

  const response = await fetchWithTimeout(url.toString(), {
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

export interface WeeklyReviewContext {
  /** Exact local dates for the completed week being reviewed. */
  weekStart: string;
  weekEnd: string;
  /** Completed action-days in the most recent complete Mon-Sun week. */
  completed: number;
  /** Scheduled action-days that week. */
  scheduled: number;
  /** Prior week's completions, for a beat-last-week read. */
  prevCompleted: number;
  /** Weekday with the most completions; null when nothing was completed. */
  bestDay: string | null;
  /** Current streak, for continuity framing. */
  streak: number;
  /** Shields earned during the reviewed week. */
  shieldsEarned: number;
  /** Missed days covered by shields during the reviewed week. */
  shieldsUsed: number;
}

export interface ReflectionExtras {
  /** Set for the free Sunday Weekly Review ritual — swaps in week framing. */
  weeklyContext?: WeeklyReviewContext;
  /**
   * Compact digest of the user's 1-2 most recent saved sessions (premium
   * coach memory). Injected as the coach's own notes.
   */
  previousSessionNotes?: string;
  /**
   * The user's own one-line completion notes from the last ~7 days, so the
   * coach can quote their words back ("you wrote 'felt easy'").
   */
  recentNotes?: string;
  /** Action-level evidence used to make suggestions concrete and feasible. */
  actionContext?: string;
  /**
   * True when a free user is getting their one-time taste of coach memory —
   * memory sells itself by demonstration, so the coach may mention (once,
   * lightly) that remembering every session is part of Premium.
   */
  memoryTaste?: boolean;
  /** Earned cosmetic preference; behavior stays MI-based in either voice. */
  coachTone?: "supportive" | "direct";
}

export interface RecapCoachContext {
  personaName: string;
  monthLabel: string;
  votesCast: number;
  consistency: number;
  kickstartVotes: number;
  healthVotes: number;
  shieldsEarned: number;
  shieldedDays: number;
  comebackGapDays: number | null;
}

/** Generate the recap's single forward-looking line from aggregate counts only. */
export async function getRecapCoachLine(
  recap: RecapCoachContext,
): Promise<string> {
  const url = new URL("/api/reflection", getApiUrl());
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: await getAiHeaders(),
    body: JSON.stringify({
      messages: [
        {
          role: "system",
          content:
            "Write exactly one warm, forward-looking sentence of at most 22 words for a private habit recap. Celebrate evidence, never guilt. Do not use the word persona, percentages as grades, or generic praise.",
        },
        {
          role: "user",
          content: JSON.stringify(recap),
        },
      ],
    }),
  });
  if (!response.ok) throw new Error("Failed to generate recap coach line");
  const data = (await response.json()) as { content?: string };
  const line = data.content?.replace(/\s+/g, " ").trim();
  if (!line) throw new Error("Recap coach line was empty");
  return line;
}

export async function getReflectionResponse(
  messages: AIMessage[],
  momentumScore: number,
  periodType: string,
  onChunk?: (chunk: string) => void,
  monthlyContext?: MonthlyContext,
  persona?: { name: string; description: string },
  extras?: ReflectionExtras,
  signal?: AbortSignal,
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

  // Premium coach memory: the digest reads as the coach's own session notes,
  // so continuity ("last time you said...") comes naturally, never recited.
  const memoryContext = extras?.previousSessionNotes
    ? `
WHAT YOU REMEMBER FROM YOUR PREVIOUS SESSIONS WITH THEM (your own notes — draw on these naturally when relevant, e.g. following up on something they said last time; never recite them back verbatim or list them):
${extras.previousSessionNotes}
${
  extras.memoryTaste
    ? `(This is a one-time preview of your memory for a free user. If it lands naturally — e.g. they respond to you remembering — you may mention ONCE, lightly, that remembering every session is part of Premium. Never lead with it and never repeat it.)`
    : ""
}`
    : "";

  const notesContext = extras?.recentNotes
    ? `
THEIR OWN WORDS THIS WEEK (one-line notes they attached when completing actions — quoting their own words back is powerful; use at most one, naturally):
${extras.recentNotes}
`
    : "";

  const actionContext = extras?.actionContext
    ? `
THEIR ACTIVE ACTIONS (use this evidence when discussing friction or suggesting a change; name ONE real action and its real 2-minute version or routine anchor rather than giving generic advice):
${extras.actionContext}
`
    : "";

  const isWeekly = periodType === "weekly" && extras?.weeklyContext;
  const wk = extras?.weeklyContext;

  const weeklyProgressContext = wk
    ? `
LAST WEEK (their most recent complete Monday-Sunday week):
- Reviewed dates: ${wk.weekStart} through ${wk.weekEnd}. Refer to this period by its date range, never by a calendar week number.
- Completed ${wk.completed} of ${wk.scheduled} scheduled action-days${wk.prevCompleted > 0 ? ` (the week before: ${wk.prevCompleted})` : ""}.
- ${wk.bestDay ? `Their strongest day was ${wk.bestDay}.` : "No completions last week — meet them with warmth, not pressure."}
- Current streak: ${wk.streak} day${wk.streak === 1 ? "" : "s"}.
- Shields last week: ${wk.shieldsEarned} earned, ${wk.shieldsUsed} used. Treat both as wins — earning is consistency and using one is the grace it was built for.
`
    : "";

  const roleLine = isWeekly
    ? "You are a supportive coach guiding the user through a short WEEKLY REVIEW — a 3-minute ritual, not a deep session."
    : "You are a supportive coach helping the user with their monthly progress check-in.";
  const toneInstruction =
    extras?.coachTone === "direct"
      ? "TONE: Be concise and candid. Name the pattern plainly and avoid cushioning every sentence, while remaining respectful and never harsh."
      : "TONE: Be warm, patient, and gently encouraging without becoming vague or overly cheerful.";

  const firstMessageInstruction = isWeekly
    ? `FIRST MESSAGE: Be brief (2-3 sentences max). This is a light weekly ritual with three beats you'll walk through one at a time: one win from last week, one point of friction, and one small bend for the coming week. Open by naming the exact reviewed date range, then ask for the win. Never use a calendar week number. ONE question only.`
    : `FIRST MESSAGE: Be brief (2-3 sentences max). Anchor on how long they've been at their plan${justStarted ? " — they just started, so welcome them to their first days and celebrate showing up at all" : " and their consistency over that time"}. ${ctx.isAhead ? "Their consistency is strong — celebrate it." : ctx.isBehind ? "They're struggling — be encouraging and ask what's been challenging." : "They're building — note the steady progress."} Ask ONE simple question about their experience. No lengthy explanations.`;

  const continueInstruction = isWeekly
    ? `Continue the ritual: after their win, ask about friction; after friction, propose ONE small bend for next week (shrink an action, move its day, or lean on the 2-minute version) and confirm it with them. Then wrap warmly — the whole review should feel complete in about three exchanges. Keep responses to 2-3 sentences.`
    : `Continue the conversation naturally. Keep responses concise (2-4 sentences). Use the monthly context to give relevant advice. If they're struggling, gently suggest smaller actions, easier kickstart versions, or fewer scheduled days. If consistency is strong, acknowledge their momentum and ask about what's working.`;

  const systemMessage: AIMessage = {
    role: "system",
    content: `${roleLine} ${isWeekly ? weeklyProgressContext : progressContext}${identityContext}${memoryContext}${notesContext}${actionContext}

COACHING METHOD (motivational interviewing, adapted — the user should leave feeling heard, not lectured):
- Reflect before you direct: open with one short reflection of what they just said, in your own words, before anything else.
- Ask permission before advising: "Want a suggestion?" or "Open to an idea?" — then offer ONE idea, not a menu.
- Evoke their reasons: draw out why this matters to them or what has worked before, rather than telling them why it should matter.
- Affirm with evidence: tie encouragement to something they actually did ("you came back after two days away"), never generic cheerleading.

VOICE RULES:
- NEVER use the word "persona" — say "your plan" or "who you're becoming."
- Call their long-term metric "consistency" (it's their % of scheduled actions completed this month). Their goals are "milestones" that fill up as they complete daily actions — milestones never lose progress.
- Identity framing: completed actions are votes for who they're becoming. A missed stretch is a plan problem, not a character problem — respond by shrinking the action or moving its schedule, never by scolding.
- You are not a therapist or medical professional. If health, medication, or mental-health treatment comes up, be kind and suggest a qualified professional while staying supportive about their habits.

${toneInstruction}

${isFirstMessage ? firstMessageInstruction : continueInstruction}

Be warm and practical. No bullet points or lists in responses.`,
  };

  const allMessages = [systemMessage, ...messages];

  // Use the same incremental SSE + typewriter path as onboarding so Coach
  // starts speaking as soon as the first model token arrives.
  return streamSSERequest(
    "/api/reflection",
    { messages: allMessages, stream: true },
    onChunk || (() => {}),
    STREAM_DELAY_MS,
    signal,
  );
}
