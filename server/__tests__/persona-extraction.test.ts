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

  it("accepts steps with and without why and scheduleSource", () => {
    const withFields = {
      ...validPlan,
      benchmarks: validPlan.benchmarks.map((benchmark, index) => ({
        ...benchmark,
        why: "Practice makes the map feel familiar.",
        scheduleSource: index === 0 ? "stated" : "suggested",
      })),
    };
    expect(parsePersonaPlan(JSON.stringify(withFields))).toEqual(withFields);
    expect(parsePersonaPlan(JSON.stringify(validPlan))).toEqual(validPlan);
    const withNulls = {
      ...validPlan,
      benchmarks: validPlan.benchmarks.map((benchmark) => ({
        ...benchmark,
        why: null,
        scheduleSource: null,
      })),
    };
    expect(() => parsePersonaPlan(JSON.stringify(withNulls))).not.toThrow();
  });

  it("does not reject a plan over an unexpected schedule source", () => {
    const odd = {
      ...validPlan,
      benchmarks: validPlan.benchmarks.map((benchmark) => ({
        ...benchmark,
        scheduleSource: "guessed",
      })),
    };
    const parsed = parsePersonaPlan(JSON.stringify(odd));
    expect(parsed.benchmarks[0].scheduleSource).toBeUndefined();
  });

  it("requires the new keys in strict mode, as nullable", () => {
    const item = personaPlanResponseFormat.json_schema.schema.properties
      .benchmarks.items;
    expect(item.required).toEqual(
      expect.arrayContaining(["why", "scheduleSource"]),
    );
    expect(item.properties.why.type).toContain("null");
    expect(item.properties.scheduleSource.enum).toEqual([
      "stated",
      "suggested",
      null,
    ]);
  });

  it("constrains OpenAI to three complete, scheduled milestones", () => {
    const schema = personaPlanResponseFormat.json_schema.schema;
    expect(personaPlanResponseFormat.json_schema.strict).toBe(true);
    expect(schema.properties.benchmarks.minItems).toBe(3);
    expect(schema.properties.benchmarks.maxItems).toBe(3);
  });
});
