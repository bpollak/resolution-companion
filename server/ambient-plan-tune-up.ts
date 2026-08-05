import { z } from "zod";

const weekdaySchema = z.enum([
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
]);

const factorAggregateSchema = z.object({
  helped: z.number().int().min(0).max(28),
  hindered: z.number().int().min(0).max(28),
});

export const ambientPlanTuneUpRequestSchema = z.object({
  daysActive: z.number().int().min(0).max(36500),
  monthlyConsistency: z.number().min(0).max(100),
  actions: z
    .array(
      z.object({
        slot: z.number().int().min(0).max(4),
        frequency: z.array(weekdaySchema).min(1).max(7),
        anchorLink: z.string().trim().min(1).max(200),
        kickstartVersion: z.string().trim().min(1).max(200),
        scheduled: z.number().int().min(0).max(31),
        completed: z.number().int().min(0).max(31),
        kickstarts: z.number().int().min(0).max(31),
        factors: z.object({
          energy: factorAggregateSchema,
          time: factorAggregateSchema,
          support: factorAggregateSchema,
          environment: factorAggregateSchema,
          planFit: factorAggregateSchema,
        }),
      }),
    )
    .min(1)
    .max(5),
});

export const ambientPlanTuneUpResponseSchema = z
  .object({
    slot: z.number().int().min(0).max(4),
    changes: z.object({
      frequency: z.array(weekdaySchema).min(1).max(7).optional(),
      anchorLink: z.string().trim().min(1).max(200).optional(),
      kickstartVersion: z.string().trim().min(1).max(200).optional(),
    }),
    rationale: z.string().trim().min(1).max(500),
  })
  .refine((value) => Object.keys(value.changes).length > 0, {
    message: "At least one allowed plan field must change",
  });

export type AmbientPlanTuneUpRequest = z.infer<
  typeof ambientPlanTuneUpRequestSchema
>;

export function parseAmbientPlanTuneUpResponse(
  value: unknown,
  request: AmbientPlanTuneUpRequest,
) {
  const parsed = ambientPlanTuneUpResponseSchema.parse(value);
  const action = request.actions.find(
    (candidate) => candidate.slot === parsed.slot,
  );
  if (!action) throw new Error("Unknown action slot");
  const actuallyChanged = Object.entries(parsed.changes).some(([key, next]) => {
    const current = action[key as keyof typeof action];
    return Array.isArray(current) && Array.isArray(next)
      ? current.join("|") !== next.join("|")
      : current !== next;
  });
  if (!actuallyChanged) throw new Error("Suggestion did not change the plan");
  return parsed;
}
