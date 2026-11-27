import {
  RESOLUTION_STARTERS,
  SELF_SETUP_STARTERS,
  STARTER_BENCHMARKS,
  STARTER_TOPICS,
  createStarterPlanDraft,
  starterBenchmarksFor,
  starterTopicFor,
  withStarterResolution,
  type StarterTopic,
} from "@/lib/starter-plan";
import { approvePlan, createPlanDraft } from "@/lib/onboarding-plan";
import { suggestReminderTime } from "@/lib/habit-reminders";
import { WEEKDAY_ORDER } from "@/lib/progress";

const TOPICS = Object.keys(STARTER_TOPICS) as StarterTopic[];

describe("starter steps by resolution", () => {
  it("covers the seven common resolutions", () => {
    expect([...TOPICS].sort()).toEqual(
      [
        "fitness",
        "learning",
        "money",
        "reading",
        "sleep",
        "stress",
        "weight",
      ].sort(),
    );
  });

  it.each(TOPICS)("%s has three complete steps on valid weekdays", (topic) => {
    const { benchmarks } = STARTER_TOPICS[topic];
    expect(benchmarks).toHaveLength(3);
    for (const step of benchmarks) {
      expect(step.title.trim()).not.toBe("");
      expect(step.elementalAction.title.trim()).not.toBe("");
      expect(step.elementalAction.kickstartVersion.trim()).not.toBe("");
      expect(step.elementalAction.frequency.length).toBeGreaterThan(0);
      expect(new Set(step.elementalAction.frequency).size).toBe(
        step.elementalAction.frequency.length,
      );
      for (const day of step.elementalAction.frequency)
        expect(WEEKDAY_ORDER).toContain(day);
    }
    expect(
      new Set(benchmarks.map((step) => step.elementalAction.title)).size,
    ).toBe(3);
  });

  it.each(TOPICS)(
    "%s starts with a daily step, loggable on day one",
    (topic) => {
      expect(
        [
          ...STARTER_TOPICS[topic].benchmarks[0].elementalAction.frequency,
        ].sort(),
      ).toEqual([...WEEKDAY_ORDER].sort());
    },
  );

  it.each(TOPICS)("%s implies no time of day and uses plain words", (topic) => {
    for (const step of STARTER_TOPICS[topic].benchmarks) {
      expect(suggestReminderTime(step.elementalAction.anchorLink)).toBeNull();
      const text = `${step.title} ${step.elementalAction.title} ${step.elementalAction.kickstartVersion}`;
      expect(text).not.toMatch(/persona|benchmark|\bvote|—/i);
    }
  });

  it.each(TOPICS)("%s makes a plan that can be started as is", (topic) => {
    const draft = createPlanDraft(
      {
        personaName: "My Future Self",
        personaDescription: "",
        benchmarks: STARTER_TOPICS[topic].benchmarks,
      },
      false,
    );
    const plan = approvePlan(draft);
    expect(plan.actions).toHaveLength(1);
    expect(plan.persona.nextSteps).toHaveLength(2);
  });

  it("every topic chip is one of the resolution starters", () => {
    for (const topic of TOPICS)
      expect(RESOLUTION_STARTERS).toContain(STARTER_TOPICS[topic].chip);
    expect(SELF_SETUP_STARTERS).toHaveLength(7);
    expect(SELF_SETUP_STARTERS).not.toContain("Something else");
  });

  it("maps each chip to its own topic", () => {
    for (const topic of TOPICS)
      expect(starterTopicFor(STARTER_TOPICS[topic].chip)).toBe(topic);
  });

  it("reads the topic from a typed resolution", () => {
    expect(starterTopicFor("Get in shape and lose 15 pounds")).toBe("weight");
    expect(starterTopicFor("run a 5k by June")).toBe("fitness");
    expect(starterTopicFor("Pay off my credit card debt")).toBe("money");
    expect(starterTopicFor("Finish 12 books")).toBe("reading");
    expect(starterTopicFor("go to sleep earlier")).toBe("sleep");
    expect(starterTopicFor("Feel less anxious")).toBe("stress");
    expect(starterTopicFor("Learn Spanish")).toBe("learning");
  });

  it("falls back to the generic three for anything else", () => {
    for (const text of ["", undefined, "Be kinder", "Less phone time"]) {
      expect(starterTopicFor(text)).toBeNull();
      expect(starterBenchmarksFor(text)).toBe(STARTER_BENCHMARKS);
    }
  });
});

describe("withStarterResolution", () => {
  const titles = (draft: {
    suggestions: { elementalAction: { title: string } }[];
  }) => draft.suggestions.map((item) => item.elementalAction.title);

  it("swaps an untouched starter plan to the steps for the resolution", () => {
    const draft = createStarterPlanDraft();
    const next = withStarterResolution(draft, "Read more");
    expect(next.resolution).toBe("Read more");
    expect(titles(next)).toEqual(
      STARTER_TOPICS.reading.benchmarks.map(
        (step) => step.elementalAction.title,
      ),
    );
    expect(next.suggestions.map((item) => item.selected)).toEqual([
      true,
      false,
      false,
    ]);
    expect(next.id).toBe(draft.id);
    expect(next.name).toBe(draft.name);
  });

  it("follows a changed resolution while the steps are still untouched", () => {
    const reading = withStarterResolution(
      createStarterPlanDraft(),
      "Read more",
    );
    const sleep = withStarterResolution(reading, "Sleep better");
    expect(titles(sleep)).toEqual(
      STARTER_TOPICS.sleep.benchmarks.map((step) => step.elementalAction.title),
    );
    const other = withStarterResolution(sleep, "Be kinder");
    expect(titles(other)).toEqual(
      STARTER_BENCHMARKS.map((step) => step.elementalAction.title),
    );
  });

  it("keeps the person's steps once they have edited or reselected one", () => {
    const edited = createStarterPlanDraft();
    edited.suggestions[0].elementalAction.title = "Walk the dog";
    expect(titles(withStarterResolution(edited, "Read more"))).toEqual(
      titles(edited),
    );

    const reselected = createStarterPlanDraft();
    reselected.suggestions[1].selected = true;
    const next = withStarterResolution(reselected, "Read more");
    expect(next.resolution).toBe("Read more");
    expect(next.suggestions).toBe(reselected.suggestions);
  });

  it("only sets the text on a plan Coach made", () => {
    const coachDraft = createPlanDraft(
      {
        personaName: "Reader",
        personaDescription: "",
        benchmarks: STARTER_BENCHMARKS,
      },
      true,
    );
    const next = withStarterResolution(coachDraft, "Sleep better");
    expect(next.resolution).toBe("Sleep better");
    expect(next.suggestions).toBe(coachDraft.suggestions);
  });

  it("does not rebuild the steps when the topic is unchanged", () => {
    const reading = withStarterResolution(
      createStarterPlanDraft(),
      "Read more",
    );
    expect(withStarterResolution(reading, "Read 20 books").suggestions).toBe(
      reading.suggestions,
    );
  });
});

describe("STARTER_BENCHMARKS", () => {
  // The activation guarantee: a fresh install on ANY day (Sunday included)
  // must land on a Today with at least one loggable action.
  it("schedules at least one action on every weekday", () => {
    for (const day of WEEKDAY_ORDER) {
      const covered = STARTER_BENCHMARKS.some((b) =>
        b.elementalAction.frequency.includes(day),
      );
      // object form so a failure names the uncovered day
      expect({ day, covered }).toEqual({ day, covered: true });
    }
  });

  it("provides several optional starter suggestions", () => {
    expect(STARTER_BENCHMARKS.length).toBeGreaterThanOrEqual(3);
  });

  it("every action has a kickstart floor, an anchor, and a schedule", () => {
    for (const b of STARTER_BENCHMARKS) {
      expect(b.elementalAction.kickstartVersion.length).toBeGreaterThan(0);
      expect(b.elementalAction.anchorLink.length).toBeGreaterThan(0);
      expect(b.elementalAction.frequency.length).toBeGreaterThan(0);
    }
  });
});
