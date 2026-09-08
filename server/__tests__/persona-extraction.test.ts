import {
  parsePersonaPlan,
  personaPlanResponseFormat,
} from "../persona-extraction";

const validPlan = {
  personaName: "Mission-Ready Navigator",
  personaDescription:
    "A prepared trainee who moves confidently with a map and compass.",
  benchmarks: Array.from({ length: 3 }, (_, index) => ({
    title: `Navigation milestone ${index + 1}`,
    elementalAction: {
      title: "Complete one map-and-compass drill",
      frequency: ["Monday", "Wednesday"],
      kickstartVersion: "Orient the map to north",
      anchorLink: "After putting on training shoes",
    },
  })),
};

describe("persona plan extraction", () => {
  it("accepts the exact plan shape used by onboarding", () => {
    expect(parsePersonaPlan(JSON.stringify(validPlan))).toEqual(validPlan);
  });

  it.each([1, 3, 5])(
    "accepts %i complete proposals without padding",
    (count) => {
      const plan = {
        ...validPlan,
        benchmarks: Array.from(
          { length: count },
          () => validPlan.benchmarks[0],
        ),
      };
      expect(parsePersonaPlan(JSON.stringify(plan)).benchmarks).toHaveLength(
        count,
      );
    },
  );

  it("rejects more than five proposed habits", () => {
    expect(() =>
      parsePersonaPlan(
        JSON.stringify({
          ...validPlan,
          benchmarks: Array.from({ length: 6 }, () => validPlan.benchmarks[0]),
        }),
      ),
    ).toThrow();
  });

  it("rejects plans that would crash or strand onboarding", () => {
    expect(() =>
      parsePersonaPlan(JSON.stringify({ ...validPlan, benchmarks: [] })),
    ).toThrow();
    expect(() =>
      parsePersonaPlan(
        JSON.stringify({
          ...validPlan,
          benchmarks: validPlan.benchmarks.map((benchmark) => ({
            ...benchmark,
            elementalAction: {
              ...benchmark.elementalAction,
              frequency: ["First Thursday"],
            },
          })),
        }),
      ),
    ).toThrow();
  });

  it("constrains OpenAI to one to five complete, scheduled milestone proposals", () => {
    const schema = personaPlanResponseFormat.json_schema.schema;
    expect(personaPlanResponseFormat.json_schema.strict).toBe(true);
    expect(schema.properties.benchmarks.minItems).toBe(1);
    expect(schema.properties.benchmarks.maxItems).toBe(5);
  });
});
