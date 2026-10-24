import { describe, expect, it } from "vitest";
import { findGaps, sortTasks, SEOJIN } from "./launchpad";

describe("launchpad rules", () => {
  it("puts date night first for Seojin", () => {
    const s = SEOJIN;
    expect(sortTasks(s.tasks, s.focus)[0]?.title).toBe("Date night");
  });
  it("academic tasks rank above fun when no explicit priority", () => {
    const sorted = sortTasks([
      { id: "a", title: "gym", category: "fun", timed: false },
      { id: "b", title: "hw", category: "academic", timed: false },
    ]);
    expect(sorted[0]?.id).toBe("b");
  });
  it("short gap between classes is pseudo free", () => {
    const g = findGaps([
      { day: 0, start: 9, end: 9.83, title: "A", kind: "class" },
      { day: 0, start: 10, end: 11, title: "B", kind: "class" },
    ], "on-track");
    expect(g.find((x) => x.start === 9.83)?.type).toBe("pseudo");
  });
  it("morning before the first class stays free", () => {
    const g = findGaps([{ day: 0, start: 9, end: 10, title: "A", kind: "class" }], "behind");
    expect(g.find((x) => x.start === 6)?.type).toBe("free");
  });
  it("long weekday gap is lazy only when behind", () => {
    const ev = [{ day: 0, start: 9, end: 10, title: "A", kind: "class" as const }];
    expect(findGaps(ev, "behind").some((g) => g.type === "lazy")).toBe(true);
    expect(findGaps(ev, "on-track").some((g) => g.type === "lazy")).toBe(false);
  });
});
