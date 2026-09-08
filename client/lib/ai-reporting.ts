import { storage } from "./storage";
import { getApiUrl, getAuthHeaders } from "./query-client";

export type AIReportSurface = "coach" | "onboarding";

export async function reportAIContent(
  message: string,
  surface: AIReportSurface,
): Promise<void> {
  const deviceId = await storage.getDeviceId();
  const response = await fetch(
    new URL("/api/ai-content-reports", getApiUrl()).toString(),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ deviceId, surface, message }),
    },
  );
  if (!response.ok) throw new Error(`AI report failed (${response.status})`);
}
