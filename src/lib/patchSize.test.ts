import { describe, expect, it } from "vitest";
import { sanitizePatch } from "./patch";
import { classifyPatch, describeSmallPatch } from "./patchSize";

const task = (title: string) => ({ id: `t_${title}`, title, category: "academic", timed: false });
const event = (title: string, start = 14, day = 2) => ({
  day,
  start,
  end: start + 1,
  title,
  kind: "task",
});
// Existing week: Tue 9-11 lecture.
const existing = [{ day: 2, start: 9, end: 11, title: "ECE 35", kind: "class" }];

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

  it("treats one non-overlapping event as small, including back-to-back ones", () => {
    expect(classifyPatch({ addEvents: [event("Study session")] }, existing)).toBe("small");
    expect(classifyPatch({ addEvents: [event("Different day", 14, 3)] }, existing)).toBe("small");
    expect(classifyPatch({ addEvents: [event("Right after", 11)] }, existing)).toBe("small");
    expect(classifyPatch({ addEvents: [event("Right before", 8)] }, existing)).toBe("small");
    expect(classifyPatch({ addEvents: [event("Study session")] }, [])).toBe("small");
  });

  it("treats an event that overlaps an existing event as big", () => {
    expect(classifyPatch({ addEvents: [event("Inside", 9.5)] }, existing)).toBe("big");
    expect(classifyPatch({ addEvents: [event("Straddles start", 8.5)] }, existing)).toBe("big");
    expect(classifyPatch({ addEvents: [event("Straddles end", 10.5)] }, existing)).toBe("big");
    expect(classifyPatch({ addEvents: [{ ...event("Covers", 8), end: 12 }] }, existing)).toBe(
      "big",
    );
    expect(classifyPatch({ addEvents: [event("Same slot", 9, 2)] }, existing)).toBe("big");
  });

  it("treats an event as big when existing events are unavailable or unusable", () => {
    expect(classifyPatch({ addEvents: [event("Study session")] })).toBe("big");
    expect(classifyPatch({ addEvents: [event("Study session")] }, undefined)).toBe("big");
    expect(classifyPatch({ addEvents: [event("a")] }, "nope" as unknown as unknown[])).toBe("big");
    const sameDay = (rest: object) => [{ day: 2, title: "Lab", kind: "class", ...rest }];
    expect(classifyPatch({ addEvents: [event("a")] }, sameDay({}))).toBe("big");
    expect(classifyPatch({ addEvents: [event("a")] }, sameDay({ start: 9 }))).toBe("big");
    expect(classifyPatch({ addEvents: [event("a")] }, sameDay({ start: "9", end: 10 }))).toBe(
      "big",
    );
    expect(classifyPatch({ addEvents: [event("a")] }, sameDay({ start: 10, end: 9 }))).toBe("big");
    expect(classifyPatch({ addEvents: [event("a")] }, [null])).toBe("big");
    expect(classifyPatch({ addEvents: [event("a")] }, [{ day: "Tue", start: 9, end: 10 }])).toBe(
      "big",
    );
    // Broken times on a different day cannot overlap, so they do not matter.
    expect(
      classifyPatch({ addEvents: [event("a")] }, [{ day: 4, title: "x", start: "?", end: null }]),
    ).toBe("small");
  });

  it("treats malformed or out-of-range new events as big", () => {
    expect(classifyPatch({ addEvents: [{ ...event("a"), start: undefined }] }, [])).toBe("big");
    expect(classifyPatch({ addEvents: [{ ...event("a"), end: "15" }] }, [])).toBe("big");
    expect(classifyPatch({ addEvents: [{ ...event("a"), end: 14 }] }, [])).toBe("big");
    expect(classifyPatch({ addEvents: [{ ...event("a"), day: 9 }] }, [])).toBe("big");
    expect(classifyPatch({ addEvents: [{ ...event("a"), day: 1.5 }] }, [])).toBe("big");
    expect(classifyPatch({ addEvents: [{ ...event("a"), start: -1 }] }, [])).toBe("big");
    expect(classifyPatch({ addEvents: [{ ...event("a"), end: 25, start: 23 }] }, [])).toBe("big");
    expect(classifyPatch({ addEvents: [{ ...event("a"), title: "  " }] }, [])).toBe("big");
    expect(classifyPatch({ addEvents: [null] }, [])).toBe("big");
    expect(classifyPatch({ addEvents: event("a") }, [])).toBe("big");
    expect(classifyPatch({ addEvents: [event("a"), { nope: true }] }, [])).toBe("big");
  });

  it("treats several events, or events combined with anything else, as big", () => {
    expect(classifyPatch({ addEvents: [event("a"), event("b", 16)] }, existing)).toBe("big");
    expect(classifyPatch({ addTasks: [task("a")], addEvents: [event("b")] }, existing)).toBe("big");
    expect(classifyPatch({ longTermAdd: ["a"], addEvents: [event("b")] }, existing)).toBe("big");
    expect(
      classifyPatch({ weeklyTargets: [{ label: "Gym", hours: 2 }], addEvents: [event("b")] }, []),
    ).toBe("big");
    expect(classifyPatch({ status: "behind", addEvents: [event("b")] }, existing)).toBe("big");
    expect(
      classifyPatch({ addEvents: [event("b")], courses: [{ code: "A 1", name: "A" }] }, []),
    ).toBe("big");
  });

  it("treats event removals and moves as big, even next to a clean new event", () => {
    expect(classifyPatch({ removeEvents: [{ title: "Lab" }] }, existing)).toBe("big");
    expect(classifyPatch({ moveEvents: [{ title: "Lab", day: 3 }] }, existing)).toBe("big");
    expect(
      classifyPatch({ addEvents: [event("b")], removeEvents: [{ title: "Lab" }] }, existing),
    ).toBe("big");
    expect(
      classifyPatch({ addEvents: [event("b")], moveEvents: [{ title: "Lab" }] }, existing),
    ).toBe("big");
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
    const rawEvent = { addEvents: [event("Study session")] };
    expect(classifyPatch(sanitizePatch(rawEvent), existing)).toBe(
      classifyPatch(rawEvent, existing),
    );
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
    expect(describeSmallPatch({ addEvents: [event("Study session")] as never })).toBe(
      "event “Study session”",
    );
  });
});
