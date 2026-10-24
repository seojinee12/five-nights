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
});
