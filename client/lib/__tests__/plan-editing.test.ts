import { canDeleteMilestone } from "@/lib/plan-editing";

const milestones = [
  { id: "reading", personaId: "reader" },
  { id: "learning", personaId: "reader" },
  { id: "exercise", personaId: "runner" },
];

test("cannot remove the only action, even when another persona has actions", () => {
  expect(
    canDeleteMilestone("reading", milestones, [
      { benchmarkId: "reading" },
      { benchmarkId: "exercise" },
    ]),
  ).toBe(false);
});

test("multiple actions in the deleted milestone do not satisfy the minimum", () => {
  expect(
    canDeleteMilestone("reading", milestones, [
      { benchmarkId: "reading" },
      { benchmarkId: "reading" },
    ]),
  ).toBe(false);
});

test("a remaining action in the same persona permits milestone deletion", () => {
  expect(
    canDeleteMilestone("reading", milestones, [
      { benchmarkId: "reading" },
      { benchmarkId: "learning" },
    ]),
  ).toBe(true);
});

test("empty milestones can be deleted if the persona keeps another action", () => {
  expect(
    canDeleteMilestone("learning", milestones, [{ benchmarkId: "reading" }]),
  ).toBe(true);
  expect(
    canDeleteMilestone("missing", milestones, [{ benchmarkId: "reading" }]),
  ).toBe(false);
});
