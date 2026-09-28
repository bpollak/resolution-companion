import { getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { logger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import EventSource from "react-native-sse";
import { normalizeCoachMilestoneProposal } from "@/lib/milestone-proposal";
import { TYPEWRITER_DELAY_MS } from "@/lib/typewriter";

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

Keep your responses concise (2-3 sentences max). Be warm, casual, and supportive. Ask a question only when information needed for the starting habit is missing.

NEVER use the word "persona". Say "the future you" or "who you're becoming" instead.

WRITING RULES: Never use em dashes; use commas, periods, or colons. Never invent details the person did not say (their routine, their home, their triggers). Never suggest another app, notebook, spreadsheet, or notes file; the plan lives in this app.

If the user gives multiple goals, help them pick ONE to start with (they can add more later). If their goal is vague ("be better", "get healthy"), ask one clarifying question to make it concrete before moving on. If they mention their schedule or routine (mornings, commute, weekends), acknowledge it, since it will shape their plan. You are not a therapist or medical professional; for health treatment or mental-health topics, gently suggest a qualified professional while staying supportive about habits.

${
  messageCount === 0
    ? `
OPENING MESSAGE: Exactly ONE warm sentence of welcome, then ONE question. No lists, no explanations of how the app works.

Ask: "What's your resolution, or one thing you want to change this year?"
`
    : `
Build the plan from the person's answers, not from the number of messages.
- Check what is already known before replying. As soon as ONE concrete habit and its recurring weekdays are known, summarize that plan in one sentence and say it is ready to review with the button below. End there, with no question or request to confirm again. Optional details can be edited in review.
- Keep their bigger goal in view. If they named an outcome (a weight, an amount saved, a number of books), mention how the habit moves them toward it in your summary.
- A weekday such as "Friday only" means every Friday. The app supports weekly schedules only; do not offer certain Fridays each month, alternate weeks, or calendar start dates.
- If a concrete habit is missing, help them choose ONE small, repeatable habit. If weekdays are missing, ask which days fit. Ask only ONE missing detail per reply.
- Preserve the full habit the person chose. A small or 2-minute version is a backup for difficult days, never a replacement for their full action.
- Ask which days or existing routine would fit, unless they already told you. Never assume "daily" or weekdays without asking. Ask only one short question per reply and do not re-ask information they already supplied.
- If they are unsure, offer a small specific starting suggestion and ask if it fits. Do not claim the plan is ready while their goal or availability is still unclear.
- Do not ask for a calendar start date. The person picks when to start (today, or January 1 in late fall) on the review screen, so never say the plan "starts today".
- Once the habit and days are clear, summarize them briefly and say they can review and adjust the plan with the button below. Do not end that ready message with another question.
- They can preview a draft early. When details are missing, keep asking useful questions instead of pretending you know their schedule.

Examples of the next reply:
User: "Read one page after breakfast on Fridays only. One sentence is my small version."
Coach: "Your habit is one page after breakfast every Friday, with one sentence as your backup. Your plan is ready to review below."
User: "Walk for ten minutes."
Coach: "A ten-minute walk is a clear starting habit. Which days of the week fit your routine?"
`
}`;

// The live API requires at least three proposals. Only the first is selected;
// additional ideas stay optional until the person explicitly includes them.
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
- Return between 3 and 5 benchmarks as required by the response schema. Put the user-chosen habit first; other suggestions are optional and unselected. Each is presented to the user as a milestone that completes once its action has been done on about 21 scheduled days, so make each a meaningful, achievable consistency target with ONE specific action.
- MILESTONE TITLES NAME PROGRESS, NOT THE ACTION AGAIN. Never repeat the action as the milestone title. Title the first milestone as the consistency target and, when the user named an outcome, tie it to that outcome with "toward": for example "21 evening walks toward losing 15 lb" or "21 nights of reading toward 20 books". Keep titles under 8 words and never promise the outcome itself.
- "frequency" values MUST be exact weekday names from this set only: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday. Monthly or ordinal cadences ("First Thursday", "Last Tuesday", "every other week") are NOT supported. If a behavior would be occasional, schedule it weekly on one of the user's available days instead.
- The user's explicit choices take priority over the assistant's suggestions or summaries. Keep their full action as the title; the small version belongs only in kickstartVersion, not as a replacement for the full action.
- SCHEDULING MUST MATCH WHAT THE USER SAID. If they said "weekday mornings," schedule weekdays; if they mentioned limited time, schedule fewer days. Never default everything to 7 days/week; total scheduled actions across all benchmarks should fit realistically inside the time they described. Vary cadence: at most one daily action; support actions 2-4 days/week.
- ANCHORS MUST COME FROM THE USER'S OWN WORDS. If they said "after dinner", the anchor is "After dinner", not "After I finish washing up the dinner plates". Never add details they did not say. If they gave no routine at all, use a plain time cue like "In the evening" or "After breakfast".
- Never suggest another app, notebook, spreadsheet, or notes file. Everything is tracked in this app.
- Never use em dashes in any field.
- Actions must not overlap or double-count each other (two benchmarks must never be satisfied by the same behavior).
- Kickstart versions must take under 2 minutes and be genuinely easier than the full action.
- Write everything in the user's language and vocabulary where possible, so the plan feels like it came from their own words.`;

const REQUEST_TIMEOUT_MS = 20000;
const PLAN_EXTRACTION_TIMEOUT_MS = 45000;

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
  signal?: AbortSignal,
): Promise<string> {
  return streamSSERequest(
    "/api/chat",
    { messages },
    onChunk,
    TYPEWRITER_DELAY_MS,
    signal,
  );
}

/**
 * POST an SSE endpoint and stream its `{content}` events. `charDelayMs > 0`
 * replays each chunk character-by-character for the shared onboarding and
 * Coach typewriter feel; 0 emits chunks exactly as they arrive.
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
  signal?: AbortSignal,
): Promise<string> {
  const userMessageCount = messages.filter((m) => m.role === "user").length;
  const systemMessage: AIMessage = {
    role: "system",
    content: getSystemPrompt(userMessageCount),
  };

  return sendChatMessageStreaming(
    [systemMessage, ...messages],
    onChunk || (() => {}),
    signal,
  );
}

export async function extractPersonaFromConversation(
  messages: AIMessage[],
  signal?: AbortSignal,
): Promise<PersonaData> {
  const url = new URL("/api/extract-persona", getApiUrl());

  const response = await fetchWithTimeout(
    url.toString(),
    {
      method: "POST",
      signal,
      headers: await getAiHeaders(),
      body: JSON.stringify({
        messages,
        extractionPrompt: EXTRACTION_PROMPT,
      }),
    },
    PLAN_EXTRACTION_TIMEOUT_MS,
  );

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
  persona?: { name: string; description: string; resolution?: string },
  extras?: ReflectionExtras,
  signal?: AbortSignal,
): Promise<string> {
  const isFirstMessage = messages.length === 1;
  const ctx = monthlyContext || getMonthlyContext(momentumScore);

  // A plan set up for January 1 has a future start: nothing is tracked yet.
  const rawDaysSince = ctx.daysSincePersonaCreated;
  const startsLater = rawDaysSince !== undefined && rawDaysSince < 0;
  const daysSince =
    rawDaysSince === undefined ? undefined : Math.max(0, rawDaysSince);
  const justStarted = daysSince !== undefined && daysSince <= 7;
  const startedMidMonth =
    !startsLater && daysSince !== undefined && daysSince + 1 < ctx.dayOfMonth;
  const startLabel =
    startsLater && ctx.personaCreatedAt
      ? new Date(ctx.personaCreatedAt).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
        })
      : null;

  const personaAgeContext = startLabel
    ? `\n- Their plan starts on ${startLabel}; nothing is tracked yet. Help them get ready for day one (what they'll need, who to tell, how small to start). Never mention consistency, streaks, or missed days before then.`
    : daysSince !== undefined
      ? `\n- They started their plan ${daysSince === 0 ? "today" : daysSince === 1 ? "yesterday" : `${daysSince} days ago`}${justStarted ? " (brand new - be encouraging and set realistic expectations)" : daysSince <= 30 ? " (still building habits - focus on consistency over perfection)" : " (established user - can discuss deeper patterns)"}`
      : "";

  const progressContext = `
MONTHLY CONTEXT:
- Today is day ${ctx.dayOfMonth} of ${ctx.daysInMonth} in the calendar month.${personaAgeContext}
- Consistency since they started: ${ctx.completionRate}% of scheduled actions completed.
- Read on that number: ${ctx.isAhead ? "strong - celebrate it" : ctx.isBehind ? "struggling - reduce friction, never scold" : "building - steady progress worth encouraging"}

IMPORTANT: Progress only counts from the day they started their plan${startedMidMonth ? " (they started partway through this month)" : ""}. Frame everything around how long THEY have been at it (days since they started), never around the calendar month. Never say they are "ahead of pace" or "behind pace" relative to the month, and never describe pre-start days as missed; those days simply weren't tracked.
`;

  const identityContext = persona
    ? `
WHO THEY ARE BECOMING (the identity they chose; this is the person your coaching is in service of):
"${persona.name}": ${persona.description}${persona.resolution ? `\nTheir resolution, in their own words: "${persona.resolution}". Keep the habit connected to it.` : ""}
Speak to them as this person-in-progress. Frame feedback around what "${persona.name}" would do, and treat every completed action as evidence that they are becoming this person. Reference this identity naturally (e.g. "the ${persona.name} you're building toward") but NEVER use the word "persona" or use voting or ballot language.
`
    : "";

  // Premium coach memory: the digest reads as the coach's own session notes,
  // so continuity ("last time you said...") comes naturally, never recited.
  const memoryContext = extras?.previousSessionNotes
    ? `
WHAT YOU REMEMBER FROM YOUR PREVIOUS SESSIONS WITH THEM (your own notes; draw on these naturally when relevant, e.g. following up on something they said last time; never recite them back verbatim or list them):
${extras.previousSessionNotes}
${
  extras.memoryTaste
    ? `(This is a one-time preview of your memory for a free user. If it lands naturally (for example they respond to you remembering), you may mention ONCE, lightly, that remembering every session is part of Premium. Never lead with it and never repeat it.)`
    : ""
}`
    : "";

  const notesContext = extras?.recentNotes
    ? `
THEIR OWN WORDS THIS WEEK (one-line notes they attached when completing actions; quoting their own words back is powerful, use at most one, naturally):
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
- ${wk.bestDay ? `Their strongest day was ${wk.bestDay}.` : "No completions last week. Meet them with warmth, not pressure."}
- Current streak: ${wk.streak} day${wk.streak === 1 ? "" : "s"}.
- Earned rest days last week: ${wk.shieldsEarned} earned, ${wk.shieldsUsed} used. Treat both as wins: earning one is consistency and using one is the grace it was built for. Call them "earned rest days", never shields.
`
    : "";

  const roleLine = isWeekly
    ? "You are a supportive coach guiding the user through a short WEEKLY REVIEW, a 3-minute ritual, not a deep session."
    : "You are a supportive coach helping the user with their monthly progress check-in.";
  const toneInstruction =
    extras?.coachTone === "direct"
      ? "TONE: Be concise and candid. Name the pattern plainly and avoid cushioning every sentence, while remaining respectful and never harsh."
      : "TONE: Be warm, patient, and gently encouraging without becoming vague or overly cheerful.";

  const firstMessageInstruction = isWeekly
    ? `FIRST MESSAGE: Be brief (2-3 sentences max). This is a light weekly ritual with three beats you'll walk through one at a time: one win from last week, one point of friction, and one small bend for the coming week. Open by naming the exact reviewed date range, then ask for the win. Never use a calendar week number. ONE question only.`
    : `FIRST MESSAGE: Be brief (2-3 sentences max). Anchor on how long they've been at their plan${justStarted ? ". They just started, so welcome them to their first days and celebrate showing up at all" : " and their consistency over that time"}. ${ctx.isAhead ? "Their consistency is strong, so celebrate it." : ctx.isBehind ? "They're struggling, so be encouraging and ask what's been challenging." : "They're building, so note the steady progress."} Ask ONE simple question about their experience. No lengthy explanations.`;

  const continueInstruction = isWeekly
    ? `Continue the ritual: after their win, ask about friction; after friction, propose ONE small bend for next week (shrink an action, move its day, or lean on the 2-minute version) and confirm it with them. Then wrap warmly; the whole review should feel complete in about three exchanges. Keep responses to 2-3 sentences.`
    : `Continue the conversation naturally. Keep responses concise (2-4 sentences). Use the monthly context to give relevant advice. If they're struggling, gently suggest smaller actions, easier kickstart versions, or fewer scheduled days. If consistency is strong, acknowledge their momentum and ask about what's working.`;

  const systemMessage: AIMessage = {
    role: "system",
    content: `${roleLine} ${isWeekly ? weeklyProgressContext : progressContext}${identityContext}${memoryContext}${notesContext}${actionContext}

COACHING METHOD (motivational interviewing, adapted; the user should leave feeling heard, not lectured):
- Reflect before you direct: open with one short reflection of what they just said, in your own words, before anything else.
- When they ask for help, help in the same reply: offer ONE concrete idea tied to their actual habit, not a menu and not "Want a suggestion?". Never end on a yes-or-no question that only asks permission to help.
- Only reflect what they actually said. Never claim they noticed, felt, or did something they did not tell you.
- Evoke their reasons: draw out why this matters to them or what has worked before, rather than telling them why it should matter.
- Affirm with evidence: tie encouragement to something they actually did ("you came back after two days away"), never generic cheerleading.

VOICE RULES:
- NEVER use the word "persona". Say "your plan" or "who you're becoming."
- Never use em dashes; use commas, periods, or colons.
- Never suggest another app, notebook, or notes file. Everything is tracked in this app.
- Call their long-term metric "consistency" (it's their % of scheduled actions completed this month). Their goals are "milestones" that fill up as they complete daily actions; milestones never lose progress.
- Identity framing: completed actions are evidence of who they're becoming. Never use voting or ballot language. A missed stretch is a plan problem, not a character problem. Respond by shrinking the action or moving its schedule, never by scolding.
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
    TYPEWRITER_DELAY_MS,
    signal,
  );
}
