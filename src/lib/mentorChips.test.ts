import { describe, expect, it } from "vitest";
import type { Student, Task } from "./launchpad";
import {
  AHEAD_CHIP,
  BEHIND_CHIP,
  CHANGE_CHIP,
  OTHER_CHIP,
  REPRIORITIZE_CHIP,
  aheadChips,
  asChips,
  behindChips,
  defaultChips,
  replyChips,
  resolveChip,
  routeMessage,
  sanitizeChips,
  sanitizeChoices,
  turnChips,
} from "./mentorChips";
import { applyPatch } from "./patch";

const labels = (chips: { label: string }[]) => chips.map((chip) => chip.label);

// An invented student, so the tests do not depend on the demo data.
const student: Student = {
  id: "test",
  name: "Sam",
  major: "Electrical Engineering",
  year: "Freshman",
  school: "Example U",
  gpa: null,
  gpaGoal: 3.5,
  status: "on-track",
  statusNote: "Steady.",
  focus: ["academic", "career", "project", "fun"],
  courses: [
    { code: "ECE 5", name: "Intro to ECE", units: 4 },
    { code: "MATH 20A", name: "Calculus", units: 4 },
  ],
  events: [{ day: 0, start: 9, end: 10, title: "ECE 5", kind: "class" }],
  tasks: [
    {
      id: "a",
      title: "ECE 5 lab report",
      category: "academic",
      timed: false,
      due: "Fri",
      hours: 3,
    },
    { id: "b", title: "Résumé review", category: "career", timed: false, priority: "high" },
    { id: "c", title: "Robot build checkpoint", category: "project", timed: false, due: "Sun" },
    { id: "d", title: "Piano practice", category: "fun", timed: false },
    { id: "e", title: "Walk with a friend", category: "fun", timed: false, due: "Sat" },
  ],
  weeklyTargets: [],
  longTerm: [],
  goals: [{ id: "g1", title: "Join a project team", horizon: "short", category: "project" }],
};

describe("sanitizeChoices", () => {
  it("keeps clean labels in order", () => {
    expect(sanitizeChoices(["Yes", "No"])).toEqual(["Yes", "No"]);
  });

  it("caps at four", () => {
    expect(sanitizeChoices(["a", "b", "c", "d", "e", "f"])).toEqual(["a", "b", "c", "d"]);
  });

  it("trims, collapses whitespace and drops blanks and non-strings", () => {
    expect(
      sanitizeChoices(["  Hello   there ", "", "   ", null, undefined, 4, {}, ["x"], true, "Ok"]),
    ).toEqual(["Hello there", "Ok"]);
  });

  it("dedupes ignoring case, and junk does not use up the four slots", () => {
    expect(
      sanitizeChoices(["Yes", "yes", " YES ", 1, "No", "no", "Maybe", "Later", "Never"]),
    ).toEqual(["Yes", "No", "Maybe", "Later"]);
  });

  it("cuts labels over 40 characters to 40 with an ellipsis", () => {
    const [label] = sanitizeChoices(["x".repeat(80)]);
    expect(label).toHaveLength(40);
    expect(label?.endsWith("…")).toBe(true);
    expect(sanitizeChoices(["y".repeat(40)])).toEqual(["y".repeat(40)]);
  });

  it("returns nothing for input that is not a list", () => {
    for (const input of [undefined, null, "Yes", 3, { a: 1 }])
      expect(sanitizeChoices(input)).toEqual([]);
  });
});

describe("chips with full text", () => {
  it("sanitizeChips keeps the full text beside the cut label, and dedupes on the label", () => {
    const long = `${"word ".repeat(20)}end`;
    const chips = sanitizeChips(["  Short  one ", long, "short ONE"]);
    expect(chips[0]).toEqual({ label: "Short one", text: "Short one" });
    expect(chips[1]?.label).toHaveLength(40);
    expect(chips[1]?.text).toBe(long);
    expect(chips).toHaveLength(2);
    expect(sanitizeChoices([long])).toEqual([chips[1]?.label]);
  });

  it("caps the sent text at 200 characters", () => {
    const [chip] = sanitizeChips(["y".repeat(500)]);
    expect(chip?.text).toHaveLength(200);
    expect(chip?.label).toHaveLength(40);
  });

  it("turnChips pairs labels with the server's full texts, and falls back to labels", () => {
    const withTexts = turnChips({
      choices: ["Cut one…", "B"],
      choiceTexts: ["Cut one, in full", "B"],
    });
    expect(withTexts).toEqual([
      { label: "Cut one…", text: "Cut one, in full" },
      { label: "B", text: "B" },
    ]);
    expect(turnChips({ choices: ["A", "B"] }).map((chip) => chip.text)).toEqual(["A", "B"]);
    expect(turnChips({ choices: ["A"], choiceTexts: [7] })).toEqual([{ label: "A", text: "A" }]);
    expect(turnChips({}, defaultChips()).map((chip) => chip.text)).toEqual(defaultChips());
    expect(turnChips({ choices: [] })).toEqual([]);
  });
});

describe("default chips", () => {
  it("offers the three starters, or yes/no while a change waits", () => {
    expect(defaultChips()).toEqual([AHEAD_CHIP, BEHIND_CHIP, CHANGE_CHIP]);
    expect(defaultChips(true)).toEqual(["Yes, apply it", "No, leave it"]);
  });

  it("keeps the model's choices, and shows none for a free-text reply that has none", () => {
    expect(labels(replyChips(["Thursday", "Friday"]))).toEqual(["Thursday", "Friday"]);
    expect(replyChips(undefined)).toEqual([]);
    expect(replyChips([null, " "])).toEqual([]);
    expect(replyChips([])).toEqual([]);
  });

  it("uses the fallback only when the caller says the turn needs one", () => {
    expect(labels(replyChips([], defaultChips(true)))).toEqual(defaultChips(true));
    expect(labels(replyChips(undefined, defaultChips()))).toEqual(defaultChips());
    expect(labels(replyChips(["A"], defaultChips()))).toEqual(["A"]);
  });

  it("yes/no defaults are answered by the existing yes/no handling", () => {
    const pending = true;
    expect(routeMessage("Yes, apply it", student, pending, true).route.kind).toBe("apply");
    expect(routeMessage("No, leave it", student, pending, true).route.kind).toBe("decline");
  });
});

describe("aheadChips", () => {
  it("draws up to three goals from the top open task, a current course and a goal, then Something else", () => {
    expect(labels(aheadChips(student))).toEqual([
      "Get ahead on Résumé review",
      "Go deeper in ECE 5",
      "Push goal: Join a project team",
      OTHER_CHIP,
    ]);
  });

  it("skips finished tasks and keeps every label within 40 characters", () => {
    const done = { ...student, tasks: student.tasks.map((task) => ({ ...task, done: true })) };
    const chips = aheadChips({
      ...done,
      tasks: [
        ...done.tasks,
        {
          id: "z",
          title: "An extremely long task name that keeps going",
          category: "academic",
          timed: false,
        },
      ],
    });
    expect(chips[0]?.label).toHaveLength(40);
    expect(chips[0]?.label.startsWith("Get ahead on An extremely")).toBe(true);
    expect(chips.every((chip) => chip.label.length <= 40)).toBe(true);
    // The label is cut for display, but the chip keeps the full text to send.
    expect(chips[0]?.text).toBe("Get ahead on An extremely long task name that keeps going");
  });

  it("is just Something else when there is no current work", () => {
    expect(labels(aheadChips({ ...student, tasks: [], courses: [], goals: [] }))).toEqual([
      OTHER_CHIP,
    ]);
  });
});

describe("behindChips", () => {
  it("offers to postpone the lowest-priority open tasks, then reprioritize", () => {
    expect(labels(behindChips(student))).toEqual([
      "Postpone: Piano practice",
      "Postpone: Walk with a friend",
      REPRIORITIZE_CHIP,
      OTHER_CHIP,
    ]);
  });

  it("never offers to postpone high-priority, pinned, finished or already postponed work", () => {
    const only = {
      ...student,
      tasks: [
        { id: "1", title: "Urgent", category: "academic", priority: "highest", timed: false },
        { id: "2", title: "Pinned", category: "fun", pinned: true, timed: false },
        { id: "3", title: "Done", category: "fun", done: true, timed: false },
        { id: "4", title: "Moved", category: "fun", due: "Next week", timed: false },
      ],
    } as Student;
    expect(labels(behindChips(only))).toEqual([REPRIORITIZE_CHIP, OTHER_CHIP]);
  });
});

describe("resolveChip", () => {
  it("Something else only focuses the input when clicked", () => {
    expect(resolveChip(OTHER_CHIP, student, true)).toEqual({ kind: "focus" });
    expect(resolveChip(OTHER_CHIP, student)).toEqual({ kind: "model" });
  });

  it("ahead sets the status and asks for goals with the computed follow-ups", () => {
    const plan = resolveChip(AHEAD_CHIP, student, true);
    if (plan.kind !== "local") throw new Error("expected a local flow");
    expect(plan.patch).toEqual({ status: "ahead" });
    expect(applyPatch(student, plan.patch ?? {}).status).toBe("ahead");
    expect(student.status).toBe("on-track");
    expect(plan.reply).toMatch(/what do you want to add on top/i);
    expect(plan.choices).toEqual(aheadChips(student));
    expect(plan.choices.at(-1)?.label).toBe(OTHER_CHIP);
  });

  it("behind sets the status and offers to postpone or reprioritize", () => {
    const plan = resolveChip(BEHIND_CHIP, student, true);
    if (plan.kind !== "local") throw new Error("expected a local flow");
    expect(plan.patch).toEqual({ status: "behind" });
    expect(applyPatch(student, plan.patch ?? {}).status).toBe("behind");
    expect(plan.reply).toMatch(/postpone something or reprioritize/i);
    expect(plan.choices).toEqual(behindChips(student));
  });

  it("does not change a status the student already has", () => {
    const ahead = resolveChip(AHEAD_CHIP, { ...student, status: "ahead" }, true);
    const behind = resolveChip(BEHIND_CHIP, { ...student, status: "behind" }, true);
    for (const plan of [ahead, behind]) {
      if (plan.kind !== "local") throw new Error("expected a local flow");
      expect(plan.patch).toBeNull();
      expect(plan.note).toBeNull();
      expect(plan.reply).toMatch(/^You're already marked as/);
    }
  });

  it("matches typed text, including a curly apostrophe", () => {
    expect(resolveChip("i’m ahead of schedule", student).kind).toBe("local");
    expect(resolveChip("I'm behind the schedule  ", student).kind).toBe("local");
  });

  it("a schedule change asks what changed without touching the week", () => {
    const plan = resolveChip(CHANGE_CHIP, student, true);
    if (plan.kind !== "local") throw new Error("expected a local flow");
    expect(plan.patch).toBeNull();
    expect(plan.reply).toMatch(/what changed/i);
    expect(plan.choices.at(-1)?.label).toBe(OTHER_CHIP);
  });

  it("a postpone chip moves exactly that task to next week and refreshes the chips", () => {
    const plan = resolveChip("Postpone: Piano practice", student, true);
    if (plan.kind !== "local") throw new Error("expected a local flow");
    expect(plan.patch).toEqual({ postpone: ["d"] });
    const next = applyPatch(student, plan.patch ?? {});
    expect(next.tasks.find((task) => task.id === "d")?.due).toBe("Next week");
    expect(next.tasks.filter((task) => task.due === "Next week")).toHaveLength(1);
    expect(labels(plan.choices)).not.toContain("Postpone: Piano practice");
    expect(labels(plan.choices)).toContain("Postpone: Walk with a friend");
  });

  it("everything else goes to the mentor like typed text", () => {
    expect(resolveChip("Reprioritize my week", student, true)).toEqual({ kind: "model" });
    expect(resolveChip("Get ahead on ECE 5 lab report", student, true)).toEqual({ kind: "model" });
    expect(resolveChip("I have a midterm Thursday", student)).toEqual({ kind: "model" });
  });
});

describe("routeMessage (what a chip click sends)", () => {
  it("sends the chip's text as the message, which is its label unless the label was cut", () => {
    const chips = [...asChips(defaultChips()), ...aheadChips(student), ...behindChips(student)];
    for (const chip of chips) {
      if (chip.label === OTHER_CHIP) continue;
      expect(chip.text).toBe(chip.label);
      expect(routeMessage(chip.text, student, false, true).message).toBe(chip.text);
    }
  });

  it("a cut chip sends its full text, and a long postpone chip still postpones that task", () => {
    const title = "Write the full lab report for the electronics course";
    const cutOf = (chips: { label: string; text: string }[], text: string) => {
      const chip = chips.find((item) => item.text === text);
      expect(chip?.label.length).toBeLessThanOrEqual(40);
      expect(chip?.label.endsWith("…")).toBe(true);
      expect(routeMessage(chip?.text ?? "", student, false, true).message).toBe(text);
      return chip;
    };
    const top: Task = { id: "L", title, category: "academic", priority: "highest", timed: false };
    cutOf(aheadChips({ ...student, tasks: [top, ...student.tasks] }), `Get ahead on ${title}`);

    const long: Student = {
      ...student,
      tasks: [{ id: "L", title, category: "fun", timed: false }, ...student.tasks],
    };
    const postpone = cutOf(behindChips(long), `Postpone: ${title}`);
    const plan = resolveChip(postpone?.text ?? "", long, true);
    if (plan.kind !== "local") throw new Error("expected a local flow");
    expect(plan.patch).toEqual({ postpone: ["L"] });
    // The cut label alone still resolves to the same task.
    const byLabel = resolveChip(postpone?.label ?? "", long, true);
    expect(byLabel.kind === "local" && byLabel.patch).toEqual({ postpone: ["L"] });
  });

  it("trims typed text and ignores blank input", () => {
    expect(routeMessage("  hello  ", student, false).message).toBe("hello");
    expect(routeMessage("   ", student, false).route).toEqual({ kind: "ignore" });
  });

  it("routes each default chip to its flow", () => {
    expect(routeMessage(AHEAD_CHIP, student, false, true).route.kind).toBe("local");
    expect(routeMessage(BEHIND_CHIP, student, false, true).route.kind).toBe("local");
    expect(routeMessage(CHANGE_CHIP, student, false, true).route.kind).toBe("local");
    expect(routeMessage(OTHER_CHIP, student, false, true).route.kind).toBe("focus");
  });

  it("answers a waiting change before anything else, and only when one waits", () => {
    expect(routeMessage("yes", student, true).route.kind).toBe("apply");
    expect(routeMessage("no", student, true).route.kind).toBe("decline");
    expect(routeMessage("yes", student, false).route.kind).toBe("model");
  });
});
