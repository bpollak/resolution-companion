import { z } from "zod";

const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const elementalActionSchema = z.object({
  title: z.string().trim().min(1),
  frequency: z.array(z.enum(weekdays)).min(1).max(7),
  kickstartVersion: z.string().trim().min(1),
  anchorLink: z.string().trim().min(1),
});

export const personaPlanSchema = z.object({
  personaName: z.string().trim().min(1),
  personaDescription: z.string().trim().min(1),
  benchmarks: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        // Added in 1.7.0. Lenient here so a reply without them, or with an
        // unexpected value, still parses; the client truncates "why", treats
        // "" as absent, and treats a missing source as a suggestion.
        why: z.string().optional().catch(undefined),
        scheduleSource: z
          .enum(["stated", "suggested"])
          .optional()
          .catch(undefined),
        elementalAction: elementalActionSchema,
      }),
    )
    .length(3),
});

export const personaPlanResponseFormat = {
  type: "json_schema" as const,
  json_schema: {
    name: "persona_plan",
    description:
      "A concise identity-based plan with three milestones and scheduled actions.",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        personaName: { type: "string" },
        personaDescription: { type: "string" },
        benchmarks: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: "string" },
              // Strict mode requires every key. Only constructs this schema
              // already used: a plain string ("" when there is nothing to
              // say) and a string enum.
              why: { type: "string" },
              scheduleSource: {
                type: "string",
                enum: ["stated", "suggested"],
              },
              elementalAction: {
                type: "object",
                additionalProperties: false,
                properties: {
                  title: { type: "string" },
                  frequency: {
                    type: "array",
                    minItems: 1,
                    maxItems: 7,
                    items: { type: "string", enum: weekdays },
                  },
                  kickstartVersion: { type: "string" },
                  anchorLink: { type: "string" },
                },
                required: [
                  "title",
                  "frequency",
                  "kickstartVersion",
                  "anchorLink",
                ],
              },
            },
            required: ["title", "why", "scheduleSource", "elementalAction"],
          },
        },
      },
      required: ["personaName", "personaDescription", "benchmarks"],
    },
  },
};

export function parsePersonaPlan(content: string) {
  return personaPlanSchema.parse(JSON.parse(content));
}
