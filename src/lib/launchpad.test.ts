import { describe, expect, it } from "vitest";
import { findGaps, sortTasks, timeUse, SEOJIN, STUDENTS } from "./launchpad";

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

  describe("Seojin's lunch", () => {
    const lunch = SEOJIN.events.filter((e) => e.title === "Lunch");
    it("is 2 to 3 PM Monday through Saturday and never on Sunday", () => {
      expect(lunch.map((e) => e.day).sort()).toEqual([0, 1, 2, 3, 4, 5]);
      for (const e of lunch) expect([e.start, e.end, e.kind]).toEqual([14, 15, "life"]);
      expect(lunch.some((e) => e.day === 6)).toBe(false);
    });
    it("does not overlap any other event", () => {
      for (let day = 0; day < 7; day++) {
        const today = SEOJIN.events.filter((e) => e.day === day).sort((a, b) => a.start - b.start);
        today
          .slice(1)
          .forEach((e, i) =>
            expect(e.start, `${e.title} on day ${day}`).toBeGreaterThanOrEqual(today[i]!.end),
          );
      }
    });
    it("is not free time, and adds no study or class hours", () => {
      const without = SEOJIN.events.filter((e) => e.title !== "Lunch");
      const gaps = findGaps(SEOJIN.events, SEOJIN.status);
      expect(gaps.some((g) => g.type === "free" && g.start < 15 && g.end > 14)).toBe(false);
      expect(timeUse(SEOJIN.events, gaps).allocated).toBe(
        timeUse(without, findGaps(without, SEOJIN.status)).allocated,
      );
    });
    it("leaves the other students without a Lunch event", () => {
      for (const s of STUDENTS.filter((x) => x.id !== "seojin"))
        expect(s.events.some((e) => e.title === "Lunch")).toBe(false);
    });
  });
});
