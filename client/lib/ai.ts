import { getApiUrl } from "@/lib/query-client";
import EventSource from "react-native-sse";

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

const getSystemPrompt = (messageCount: number) => `You are a friendly coach helping people achieve their goals. Your role is to understand what the user wants to accomplish and create a personalized action plan.

Keep your responses concise (2-3 sentences max) and ask one question at a time. Be warm, casual, and supportive.

${messageCount === 0 ? `
OPENING MESSAGE: Give a brief, friendly welcome. Explain that you'll help them:
1. Define a clear goal or objective they want to achieve
2. Create a "persona" - the version of themselves that achieves this goal
3. Set up key benchmarks (milestones) and daily tasks to get them there

Ask: "What's a goal you're working toward, or something you'd like to accomplish in the next few months?"

Keep the tone motivating and approachable - like chatting with a supportive coach.
` : messageCount === 1 ? `
STAGE 2: The user has shared their goal. Acknowledge it positively in 1 sentence.

Briefly explain that you'll create a persona around this goal - think of it as the "future you" who has achieved it. Then you'll set up benchmarks (key milestones) with simple daily actions to build momentum.

Suggest 1-2 specific small daily habits that could help them progress. Make them simple and easy to start.

Ask ONE brief follow-up: "Do these sound like good starting points, or do you have other habits in mind?"
` : messageCount >= 2 ? `
CRITICAL INSTRUCTION: You have enough information. Your response MUST be a warm, encouraging statement that:
1. Briefly summarizes their goal
2. Mentions you'll create their persona with benchmarks and daily actions
3. Says their personalized plan is ready

DO NOT END WITH A QUESTION. Keep it short and positive - they'll click "Create My Persona" next.
` : ``}`;

const EXTRACTION_PROMPT = `Based on this conversation, extract the user's goal and create their personalized action plan.

Return ONLY valid JSON in this exact format:
{
  "personaName": "A brief aspirational title representing who they become when they achieve this goal (e.g., 'Elite Marathon Runner', 'Bestselling Author', 'Successful Entrepreneur')",
  "personaDescription": "A 1-2 sentence description of this future version of themselves who has achieved their goal",
  "benchmarks": [
    {
      "title": "A key milestone or checkpoint on the path to their goal",
      "elementalAction": {
        "title": "A specific daily/regular action that builds toward this benchmark",
        "frequency": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        "kickstartVersion": "A 2-minute version of this action to reduce friction and build consistency",
        "anchorLink": "An existing habit to attach this to, like 'After I pour my morning coffee'"
      }
    }
  ]
}

IMPORTANT: Create between 3 and 5 benchmarks (minimum 3, maximum 5). Each benchmark should be a meaningful milestone toward their goal, with one specific daily action that builds toward it. Focus on the most relevant areas that emerged from the conversation. Make the kickstart versions extremely easy (under 2 minutes) so they can build momentum from day one.`;

const STREAM_DELAY_MS = 30;

async function delayedChunkEmitter(
  chunk: string,
  onChunk: (chunk: string) => void,
  queue: { pending: string[]; processing: boolean },
  processQueue: () => Promise<void>
) {
  queue.pending.push(chunk);
  if (!queue.processing) {
    processQueue();
  }
}

export async function sendChatMessageStreaming(
  messages: AIMessage[],
  onChunk: (chunk: string) => void
): Promise<string> {
  const url = new URL("/api/chat", getApiUrl());
  
  return new Promise((resolve, reject) => {
    let fullContent = "";
    let streamDone = false;
    const queue = { pending: [] as string[], processing: false };
    
    const processQueue = async () => {
      if (queue.processing) return;
      queue.processing = true;
      
      while (queue.pending.length > 0) {
        const text = queue.pending.shift()!;
        for (const char of text) {
          onChunk(char);
          await new Promise(r => setTimeout(r, STREAM_DELAY_MS));
        }
      }
      
      queue.processing = false;
      if (streamDone && queue.pending.length === 0) {
        resolve(fullContent);
      }
    };
    
    const es = new EventSource<"message">(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages }),
    });

    es.addEventListener("message", (event) => {
      if (event.data === "[DONE]") {
        es.close();
        streamDone = true;
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
          es.close();
          reject(new Error(parsed.error));
        }
      } catch {}
    });

    es.addEventListener("error", (event) => {
      es.close();
      reject(new Error("Stream connection failed"));
    });
  });
}

export async function getOnboardingResponse(
  messages: AIMessage[],
  onChunk?: (chunk: string) => void
): Promise<string> {
  const userMessageCount = messages.filter((m) => m.role === "user").length;
  const systemMessage: AIMessage = {
    role: "system",
    content: getSystemPrompt(userMessageCount),
  };

  return sendChatMessageStreaming([systemMessage, ...messages], onChunk || (() => {}));
}

export async function extractPersonaFromConversation(
  messages: AIMessage[]
): Promise<PersonaData> {
  const url = new URL("/api/extract-persona", getApiUrl());
  
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
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

export function getMonthlyContext(momentumScore: number): MonthlyContext {
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const percentThroughMonth = Math.round((dayOfMonth / daysInMonth) * 100);
  const completionRate = momentumScore;
  const isAhead = completionRate >= percentThroughMonth;
  const isBehind = completionRate < percentThroughMonth - 10;
  
  return { dayOfMonth, daysInMonth, percentThroughMonth, completionRate, isAhead, isBehind };
}

export async function getReflectionResponse(
  messages: AIMessage[],
  momentumScore: number,
  periodType: string,
  onChunk?: (chunk: string) => void,
  monthlyContext?: MonthlyContext
): Promise<string> {
  const isFirstMessage = messages.length === 1;
  const ctx = monthlyContext || getMonthlyContext(momentumScore);
  
  const personaAgeContext = ctx.daysSincePersonaCreated !== undefined 
    ? `\n- Persona was created ${ctx.daysSincePersonaCreated} days ago${ctx.daysSincePersonaCreated <= 7 ? " (they just started - be encouraging and set realistic expectations)" : ctx.daysSincePersonaCreated <= 30 ? " (still building habits - focus on consistency over perfection)" : " (established user - can discuss deeper patterns)"}`
    : "";
    
  const progressContext = `
MONTHLY CONTEXT:
- Today is day ${ctx.dayOfMonth} of ${ctx.daysInMonth} (${ctx.percentThroughMonth}% through the month)
- User's task completion rate: ${ctx.completionRate}%
- Status: ${ctx.isAhead ? "Ahead of pace - they're doing great!" : ctx.isBehind ? "Behind pace - may need encouragement or to reduce friction" : "On track - maintaining good consistency"}${personaAgeContext}

IMPORTANT: The user's progress is only tracked from when they created their persona (${ctx.daysSincePersonaCreated !== undefined ? ctx.daysSincePersonaCreated : "unknown"} days ago). Days before that don't count as "missed" - they simply weren't tracking yet. When discussing their progress, focus only on the time since they started.
`;

  const systemMessage: AIMessage = {
    role: "system",
    content: `You are a supportive coach helping the user with their monthly progress check-in. ${progressContext}

${isFirstMessage ? `FIRST MESSAGE: Be brief (2-3 sentences max). Acknowledge where they are in the month and their completion rate relative to that. If they're ${ctx.isAhead ? "ahead, celebrate their consistency" : ctx.isBehind ? "behind, be encouraging and ask what's been challenging" : "on track, note their good pacing"}. Ask ONE simple question about their experience. No lengthy explanations.` : `Continue the conversation naturally. Keep responses concise (2-4 sentences). Use the monthly context to give relevant advice. If behind pace, gently suggest smaller actions or removing friction. If ahead, acknowledge their momentum and ask about what's working.`}

Be warm and practical. No bullet points or lists in responses.`,
  };

  const url = new URL("/api/reflection", getApiUrl());
  
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
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
      await new Promise(r => setTimeout(r, STREAM_DELAY_MS));
    }
  }

  return fullContent;
}
