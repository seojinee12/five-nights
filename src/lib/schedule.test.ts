import { describe, expect, it } from "vitest";
import type { CalEvent, Task } from "./launchpad";
import { SEOJIN } from "./launchpad";
import {
  DAY_END,
  DAY_START,
  DEFAULT_WINDOW,
  dueRank,
  findGaps,
  isValidWindow,
  normalizeWindow,
  sortTasks,
  timeUse,
  weekHours,
} from "./schedule";

const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id,
  title: id,
  category: "academic",
  timed: false,
  ...extra,
});
const ids = (tasks: Task[]) => tasks.map((t) => t.id);
const ev = (
  day: number,
  start: number,
  end: number,
  kind: CalEvent["kind"] = "task",
  title = "x",
): CalEvent => ({ day, start, end, title, kind });

describe("dueRank", () => {
  it("orders overdue, weekdays, and times within a day", () => {
    const ranks = ["Overdue", "Mon", "Wed 9am", "Wed 4pm", "Wed", "Sun"].map(dueRank);
    expect(ranks).toEqual([...ranks].sort((a, b) => (a as number) - (b as number)));
  });
  it("reads 12am/12pm and minutes", () => {
    expect(dueRank("Tue 12am")).toBe(24);
    expect(dueRank("Tue 12pm")).toBe(36);
    expect(dueRank("Fri 7:30pm")).toBe(4 * 24 + 19.5);
  });
  it("is undefined for missing or unreadable dates", () => {
    expect(dueRank(undefined)).toBeUndefined();
    expect(dueRank("")).toBeUndefined();
    expect(dueRank("someday")).toBeUndefined();
    expect(dueRank("Fri 13pm")).toBeUndefined();
  });
});

describe("sortTasks", () => {
  it("orders by priority, then pinned, then category focus, then due, then hours", () => {
    const sorted = sortTasks([
      task("low", { priority: "low" }),
      task("plain-fun", { category: "fun" }),
      task("plain-late", { due: "Fri" }),
      task("plain-early", { due: "Tue" }),
      task("plain-big", { hours: 5 }),
      task("plain-small", { hours: 1 }),
      task("pinned", { pinned: true, category: "fun" }),
      task("high", { priority: "high", category: "fun" }),
      task("highest", { priority: "highest", category: "fun" }),
    ]);
    expect(ids(sorted)).toEqual([
      "highest",
      "high",
      "pinned",
      "plain-early",
      "plain-late",
      "plain-big",
      "plain-small",
      "plain-fun",
      "low",
    ]);
  });
  it("explicit priority beats pinned", () => {
    expect(
      ids(sortTasks([task("pin", { pinned: true }), task("hi", { priority: "high" })])),
    ).toEqual(["hi", "pin"]);
  });
  it("puts done tasks last, even a highest-priority one", () => {
    expect(
      ids(
        sortTasks([
          task("done", { priority: "highest", done: true }),
          task("open", { category: "fun" }),
        ]),
      ),
    ).toEqual(["open", "done"]);
  });
  it("is stable: equal tasks keep their input order", () => {
    const input = [task("a"), task("b"), task("c")];
    expect(ids(sortTasks(input))).toEqual(["a", "b", "c"]);
    expect(ids(sortTasks([...input].reverse()))).toEqual(["c", "b", "a"]);
  });
  it("gives the same order for any input permutation", () => {
    const base = SEOJIN.tasks;
    const expected = ids(sortTasks(base, SEOJIN.focus));
    const rotated = [...base.slice(4), ...base.slice(0, 4)];
    // Seojin's tasks never fully tie, so rotation must not change the result.
    expect(ids(sortTasks(rotated, SEOJIN.focus))).toEqual(expected);
  });
  it("sorts an unknown category and missing due dates last without NaN trouble", () => {
    const odd = task("odd", { category: "mystery" as Task["category"] });
    const sorted = sortTasks([odd, task("nodue"), task("due", { due: "Mon" })]);
    expect(ids(sorted)).toEqual(["due", "nodue", "odd"]);
  });
  it("does not mutate its input and handles empty lists", () => {
    const input = [task("b", { priority: "low" }), task("a")];
    const copy = [...input];
    sortTasks(input);
    expect(input).toEqual(copy);
    expect(sortTasks([])).toEqual([]);
  });
  it("keeps Seojin's date night first and the pinned interview next", () => {
    const sorted = sortTasks(SEOJIN.tasks, SEOJIN.focus);
    expect(sorted[0]?.title).toBe("Date night");
    expect(sorted[1]?.pinned).toBe(true);
  });
});

describe("findGaps", () => {
  it("returns the whole day as one free gap when there are no events", () => {
    const gaps = findGaps([], "on-track").filter((g) => g.day === 0);
    expect(gaps).toEqual([{ day: 0, start: DAY_START, end: DAY_END, type: "free" }]);
  });
  it("never returns a zero-length or negative gap", () => {
    const gaps = findGaps([ev(0, 6, 12), ev(0, 12, 23), ev(1, 5, 7)], "behind");
    expect(gaps.every((g) => g.end - g.start > 0)).toBe(true);
    expect(gaps.some((g) => g.day === 0)).toBe(false);
  });
  it("drops free gaps under 30 minutes but keeps transitions between classes", () => {
    const gaps = findGaps(
      [
        ev(0, 9, 10, "task"),
        ev(0, 10.3, 11, "task"),
        ev(1, 9, 10, "class"),
        ev(1, 10.3, 11, "class"),
      ],
      "on-track",
    );
    expect(gaps.some((g) => g.day === 0 && g.start === 10)).toBe(false);
    expect(gaps.find((g) => g.day === 1 && g.start === 10)?.type).toBe("pseudo");
  });
  it("treats a 30+ minute gap between classes as free", () => {
    const gaps = findGaps([ev(0, 9, 10, "class"), ev(0, 10.5, 11, "class")], "on-track");
    expect(gaps.find((g) => g.start === 10)?.type).toBe("free");
  });
  it("overlapping events do not create phantom gaps", () => {
    const gaps = findGaps(
      [ev(0, 9, 12, "task"), ev(0, 10, 11, "task"), ev(0, 11.5, 13, "task")],
      "on-track",
    );
    expect(gaps.filter((g) => g.day === 0).map((g) => [g.start, g.end])).toEqual([
      [6, 9],
      [13, 23],
    ]);
  });
  it("uses the event that ends last to decide pseudo between classes", () => {
    const gaps = findGaps(
      [ev(0, 9, 11, "class"), ev(0, 9.5, 10, "task"), ev(0, 11.2, 12, "class")],
      "on-track",
    );
    expect(gaps.find((g) => g.start === 11)?.type).toBe("pseudo");
  });
  it("marks lazy time only on weekdays, only after the first event, only for behind students", () => {
    const events = [ev(0, 9, 10), ev(5, 9, 10)];
    const behind = findGaps(events, "behind");
    expect(behind.find((g) => g.day === 0 && g.start === 10)?.type).toBe("lazy");
    expect(behind.find((g) => g.day === 0 && g.start === 6)?.type).toBe("free");
    expect(behind.find((g) => g.day === 5 && g.start === 10)?.type).toBe("free");
    expect(findGaps(events, "ahead").some((g) => g.type === "lazy")).toBe(false);
  });
  it("is independent of input order and does not mutate it", () => {
    const events = [ev(0, 15, 16), ev(0, 9, 10), ev(0, 12, 13)];
    const copy = [...events];
    expect(findGaps(events, "on-track")).toEqual(findGaps([...events].reverse(), "on-track"));
    expect(events).toEqual(copy);
  });
});

describe("timeUse", () => {
  it("is all zero for no events and no gaps", () => {
    expect(timeUse([], [])).toEqual({ allocated: 0, reallocate: 0, recompensate: 0 });
  });
  it("counts duplicate and overlapping events once", () => {
    const events = [
      ev(0, 9, 11, "class"),
      ev(0, 9, 11, "class"),
      ev(0, 10, 12, "task"),
      ev(1, 9, 10, "class"),
    ];
    expect(timeUse(events, []).allocated).toBe(4);
  });
  it("counts life time under a class as allocated, not also reallocatable", () => {
    const use = timeUse([ev(0, 9, 11, "class"), ev(0, 10, 12, "life")], []);
    expect(use).toMatchObject({ allocated: 2, reallocate: 1 });
  });
  it("clips events to the visible day and ignores invalid ones", () => {
    const use = timeUse(
      [ev(0, 4, 7, "task"), ev(0, 22, 26, "task"), ev(9, 9, 10, "task"), ev(0, 10, 10, "task")],
      [],
    );
    expect(use.allocated).toBe(2);
  });
  it("adds lazy gaps to reallocate and free gaps to recompensate, ignoring pseudo gaps", () => {
    const events = [ev(0, 9, 10, "class"), ev(0, 10.2, 11, "class"), ev(0, 20, 21, "life")];
    const gaps = findGaps(events, "behind");
    const use = timeUse(events, gaps);
    const hours = (type: string) =>
      gaps.filter((g) => g.type === type).reduce((s, g) => s + g.end - g.start, 0);
    expect(use.reallocate).toBeCloseTo(1 + hours("lazy"), 5);
    expect(use.recompensate).toBeCloseTo(hours("free"), 5);
    expect(gaps.some((g) => g.type === "pseudo")).toBe(true);
  });
  it("accounts for the whole visible week: allocated + life + gaps = 17h per day", () => {
    const events = [ev(0, 9, 11, "class"), ev(0, 10, 12, "life"), ev(0, 14, 15, "task")];
    const gaps = findGaps(events, "on-track");
    const use = timeUse(events, gaps);
    const day0 = gaps.filter((g) => g.day === 0).reduce((s, g) => s + g.end - g.start, 0);
    expect(use.allocated + use.reallocate + day0).toBeCloseTo(DAY_END - DAY_START, 5);
  });
});

describe("day window", () => {
  const W = { start: 8, end: 22 };

  it("defaults to 6am-11pm: 17h a day, 119h a week, with 49h outside", () => {
    expect(DEFAULT_WINDOW).toEqual({ start: 6, end: 23 });
    expect(weekHours()).toBe(119);
    expect(weekHours(DEFAULT_WINDOW)).toBe(119);
    expect(24 * 7 - weekHours()).toBe(49);
  });
  it("a custom window changes the total: 8am-10pm is 98h", () => {
    expect(weekHours(W)).toBe(98);
    expect(weekHours({ start: 0, end: 24 })).toBe(168);
  });
  it("default arguments give the same results as an explicit default window", () => {
    const events = [
      ev(0, 9, 11, "class"),
      ev(0, 10, 12, "life"),
      ev(1, 5, 7, "task"),
      ev(2, 22, 24),
    ];
    const gaps = findGaps(events, "behind");
    expect(findGaps(events, "behind", DEFAULT_WINDOW)).toEqual(gaps);
    expect(timeUse(events, gaps)).toEqual(timeUse(events, gaps, DEFAULT_WINDOW));
  });
  it("findGaps stays inside the window", () => {
    const gaps = findGaps([ev(0, 9, 10)], "on-track", W);
    expect(gaps.filter((g) => g.day === 0).map((g) => [g.start, g.end])).toEqual([
      [8, 9],
      [10, 22],
    ]);
    expect(gaps.every((g) => g.start >= 8 && g.end <= 22)).toBe(true);
    const empty = findGaps([], "on-track", W).filter((g) => g.day === 3);
    expect(empty).toEqual([{ day: 3, start: 8, end: 22, type: "free" }]);
  });
  it("findGaps ignores events entirely outside and clips partial ones", () => {
    const gaps = findGaps([ev(0, 6, 7), ev(0, 21, 23.5), ev(0, 7, 9)], "on-track", W);
    expect(gaps.filter((g) => g.day === 0).map((g) => [g.start, g.end])).toEqual([[9, 21]]);
  });
  it("timeUse clips events to the window: outside ignored, partial counted inside only", () => {
    const events = [
      ev(0, 6, 7.5, "class"), // entirely outside 8-22
      ev(0, 7, 9, "class"), // 1h inside
      ev(1, 21, 24, "task"), // 1h inside
      ev(2, 23, 24, "life"), // outside
    ];
    const gaps = findGaps(events, "on-track", W);
    expect(timeUse(events, gaps, W)).toMatchObject({ allocated: 2, reallocate: 0 });
  });
  it("timeUse ignores gaps that fall outside the window it is given", () => {
    const wide = findGaps([], "on-track", DEFAULT_WINDOW);
    expect(timeUse([], wide, W).recompensate).toBe(98);
  });
  it("allocated + reallocate + recompensate never exceed the week's total", () => {
    const events = [ev(0, 9, 11, "class"), ev(0, 10.1, 12, "life"), ev(4, 19, 21, "life")];
    for (const window of [DEFAULT_WINDOW, W, { start: 0, end: 24 }, { start: 10, end: 14 }]) {
      const gaps = findGaps(events, "behind", window);
      const use = timeUse(events, gaps, window);
      expect(use.allocated + use.reallocate + use.recompensate).toBeLessThanOrEqual(
        weekHours(window) + 1e-9,
      );
    }
  });
  it("an event-heavy day over a short window cannot exceed the window", () => {
    const window = { start: 10, end: 14 };
    const events = [ev(0, 0, 24, "class"), ev(0, 9, 15, "task")];
    expect(timeUse(events, findGaps(events, "on-track", window), window).allocated).toBe(4);
  });
  it("validates windows: start < end, 4h minimum, 0-24, half hours", () => {
    expect(isValidWindow({ start: 6, end: 23 })).toBe(true);
    expect(isValidWindow({ start: 0, end: 24 })).toBe(true);
    expect(isValidWindow({ start: 8.5, end: 22 })).toBe(true);
    expect(isValidWindow({ start: 10, end: 14 })).toBe(true);
    expect(isValidWindow({ start: 10, end: 13.5 })).toBe(false);
    expect(isValidWindow({ start: 12, end: 8 })).toBe(false);
    expect(isValidWindow({ start: 8, end: 8 })).toBe(false);
    expect(isValidWindow({ start: -1, end: 10 })).toBe(false);
    expect(isValidWindow({ start: 6, end: 25 })).toBe(false);
    expect(isValidWindow({ start: 6.25, end: 20 })).toBe(false);
    expect(isValidWindow({ start: Number.NaN, end: 20 })).toBe(false);
    expect(isValidWindow({ start: "6", end: 20 })).toBe(false);
    expect(isValidWindow(null)).toBe(false);
  });
  it("normalizeWindow falls back to the default and returns a copy", () => {
    expect(normalizeWindow({ start: 12, end: 8 })).toEqual(DEFAULT_WINDOW);
    expect(normalizeWindow(undefined)).toEqual(DEFAULT_WINDOW);
    const copy = normalizeWindow({ start: 7, end: 20 });
    expect(copy).toEqual({ start: 7, end: 20 });
    expect(normalizeWindow(null)).not.toBe(DEFAULT_WINDOW);
  });
});
