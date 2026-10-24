import { describe, expect, it } from "vitest";
import { SEOJIN } from "./launchpad";
import { applyPatch } from "./patch";

describe("applyPatch", () => {
  it("adds a syllabus course and target without replacing the week", () => {
    const next = applyPatch(SEOJIN, {
      courses: [{ code: "ECE 35", name: "Circuit Theory", units: 4 }],
      weeklyTargets: [{ label: "ECE 35 study", hours: 4, done: 0 }],
      addTasks: [{ id: "ps2", title: "Problem Set 2", category: "academic", timed: false, due: "Fri" }],
    });
    expect(next.courses.map((course) => course.code)).toEqual([...SEOJIN.courses.map((course) => course.code), "ECE 35"]);
    expect(next.weeklyTargets.map((target) => target.label)).toContain("Study outside class");
    expect(next.weeklyTargets.map((target) => target.label)).toContain("ECE 35 study");
    expect(next.tasks.some((task) => task.title === "Problem Set 2")).toBe(true);
    expect(next.tasks.some((task) => task.title === "Date night")).toBe(true);
  });

  it("keeps the previous state intact when an event is added, so Undo can restore it", () => {
    const before = structuredClone(SEOJIN);
    const event = { day: 6, start: 20, end: 21, title: "Call home", kind: "life" as const };
    const next = applyPatch(SEOJIN, { addEvents: [event] });
    expect(next.events).toHaveLength(SEOJIN.events.length + 1);
    expect(next.events).toContainEqual(event);
    expect(SEOJIN).toEqual(before);
    expect(SEOJIN.events).not.toBe(next.events);
  });
});

describe("applyPatch postpone", () => {
  it("moves only the named tasks to next week without changing the original", () => {
    const before = structuredClone(SEOJIN);
    const id = SEOJIN.tasks[0]?.id ?? "";
    const next = applyPatch(SEOJIN, { postpone: [id, "missing"] });
    expect(next.tasks.find((task) => task.id === id)?.due).toBe("Next week");
    expect(next.tasks.filter((task) => task.due === "Next week")).toHaveLength(1);
    expect(next.tasks).toHaveLength(SEOJIN.tasks.length);
    expect(SEOJIN).toEqual(before);
  });
});
