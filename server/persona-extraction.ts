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
            required: ["title", "elementalAction"],
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
