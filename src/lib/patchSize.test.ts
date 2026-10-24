import { describe, expect, it } from "vitest";
import { sanitizePatch } from "./patch";
import { classifyPatch, describeSmallPatch } from "./patchSize";

const task = (title: string) => ({ id: `t_${title}`, title, category: "academic", timed: false });
const event = (title: string, start = 14) => ({
  day: 2,
  start,
  end: start + 1,
  title,
  kind: "task",
});

describe("classifyPatch", () => {
  it("treats one yearly goal as small", () => {
    expect(classifyPatch({ longTermAdd: ["Run a half marathon"] })).toBe("small");
  });

  it("treats one task as small", () => {
    expect(classifyPatch({ addTasks: [task("Buy a lab notebook")] })).toBe("small");
  });

  it("treats one weekly target as small", () => {
    expect(classifyPatch({ weeklyTargets: [{ label: "Gym", hours: 3, done: 0 }] })).toBe("small");
  });

  it("ignores blank sections next to the one item", () => {
    expect(
      classifyPatch({
        reply: undefined,
        status: "",
        addEvents: [],
        addTasks: [task("Email advisor")],
        longTermAdd: null,
      }),
    ).toBe("small");
  });

  it("treats an empty or missing patch as big", () => {
    expect(classifyPatch({})).toBe("big");
    expect(classifyPatch(null)).toBe("big");
    expect(classifyPatch(undefined)).toBe("big");
    expect(classifyPatch({ addTasks: [], longTermAdd: [] })).toBe("big");
  });

  it("treats malformed input as big", () => {
    expect(classifyPatch("addTasks")).toBe("big");
    expect(classifyPatch(42)).toBe("big");
    expect(classifyPatch([task("a")])).toBe("big");
    expect(classifyPatch({ addTasks: "Buy milk" })).toBe("big");
    expect(classifyPatch({ addTasks: { title: "Buy milk" } })).toBe("big");
    expect(classifyPatch({ addTasks: [{ title: "" }] })).toBe("big");
    expect(classifyPatch({ longTermAdd: ["   "] })).toBe("big");
  });

  it("treats several items as big, in one section or across sections", () => {
    expect(classifyPatch({ addTasks: [task("a"), task("b")] })).toBe("big");
    expect(classifyPatch({ longTermAdd: ["a", "b"] })).toBe("big");
    expect(classifyPatch({ addTasks: [task("a")], longTermAdd: ["b"] })).toBe("big");
    expect(
      classifyPatch({ addTasks: [task("a")], weeklyTargets: [{ label: "Gym", hours: 2 }] }),
    ).toBe("big");
  });

  it("treats a malformed item next to a valid one as big", () => {
    expect(classifyPatch({ addTasks: [task("a"), { nope: true }] })).toBe("big");
    expect(classifyPatch({ addTasks: [task("a"), null] })).toBe("big");
  });

  it("treats any calendar change as big, even a single event", () => {
    expect(classifyPatch({ addEvents: [event("Study session")] })).toBe("big");
    expect(classifyPatch({ addEvents: [event("a"), event("b", 16)] })).toBe("big");
    expect(classifyPatch({ addTasks: [task("a")], addEvents: [event("b")] })).toBe("big");
  });

  it("treats status, status note, and course changes as big", () => {
    expect(classifyPatch({ status: "behind" })).toBe("big");
    expect(classifyPatch({ statusNote: "Rough week" })).toBe("big");
    expect(classifyPatch({ addTasks: [task("a")], status: "behind" })).toBe("big");
    expect(classifyPatch({ courses: [{ code: "ECE 35", name: "Circuit Theory", units: 4 }] })).toBe(
      "big",
    );
  });

  it("treats removals, moves, and other unknown operations as big", () => {
    expect(classifyPatch({ removeEvents: [{ title: "Date night" }] })).toBe("big");
    expect(classifyPatch({ addTasks: [task("a")], removeTasks: ["b"] })).toBe("big");
    expect(classifyPatch({ addTasks: [task("a")], moveEvents: [{ from: 1, to: 2 }] })).toBe("big");
    expect(classifyPatch({ addTasks: [task("a")], rebalance: true })).toBe("big");
    expect(classifyPatch({ addTasks: [task("a")], schedule: { overhaul: true } })).toBe("big");
  });

  it("gives the same answer for raw model output and its sanitized form", () => {
    const rawSmall = { addTasks: [{ title: "Email advisor", priority: "urgent", extra: 1 }] };
    const rawBig = { addTasks: [task("a"), task("b")], longTermAdd: ["c"] };
    expect(classifyPatch(sanitizePatch(rawSmall))).toBe(classifyPatch(rawSmall));
    expect(classifyPatch(sanitizePatch(rawBig))).toBe(classifyPatch(rawBig));
  });
});

describe("describeSmallPatch", () => {
  it("names the one item that was added", () => {
    expect(describeSmallPatch({ longTermAdd: ["Learn to surf"] })).toBe(
      "yearly goal “Learn to surf”",
    );
    expect(
      describeSmallPatch({
        addTasks: [{ id: "x", title: "Email advisor", category: "career", timed: false }],
      }),
    ).toBe("task “Email advisor”");
    expect(describeSmallPatch({ weeklyTargets: [{ label: "Gym", hours: 3, done: 0 }] })).toBe(
      "weekly target “Gym” (3h)",
    );
  });
});
