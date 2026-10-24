import { describe, expect, it } from "vitest";
import { blankStudent, parseProfile, SEOJIN, STUDENTS } from "./launchpad";
import { profileFromStudent } from "./opportunities";
import { findGaps, timeUse } from "./schedule";

describe("blankStudent", () => {
  const me = blankStudent({ name: "Ada", major: "Computer Engineering", focus: ["fun"] });

  it("starts with nothing imported", () => {
    expect(me.id).toBe("me");
    expect(me.events).toHaveLength(0);
    expect(me.courses).toHaveLength(0);
    expect(me.tasks).toHaveLength(0);
    expect(me.weeklyTargets).toHaveLength(0);
    expect(me.longTerm).toHaveLength(0);
    expect(me.goals ?? []).toHaveLength(0);
    expect(me.interests ?? []).toHaveLength(0);
    expect(me.skills ?? []).toHaveLength(0);
    expect(me.resume).toBeUndefined();
    expect(me.preferences).toBeUndefined();
    expect(me.demoLabel).toBeUndefined();
    expect(me.freeHoursPerWeek).toBeUndefined();
    expect(me.gpa).toBeNull();
    expect(me.statusNote).toBe("Fresh start.");
  });

  it("uses the user's own answers, focus first, then the remaining categories", () => {
    expect(me.name).toBe("Ada");
    expect(me.major).toBe("Computer Engineering");
    expect(me.focus).toEqual(["fun", "academic", "career", "project"]);
  });

  it("falls back to plain defaults and ignores bad input", () => {
    const bare = blankStudent({ name: "  ", major: 5, focus: ["nope", "career", "career"] });
    expect(bare.name).toBe("Engineer");
    expect(bare.major).toBe("Engineering");
    expect(bare.focus).toEqual(["career", "academic", "project", "fun"]);
    expect(blankStudent().focus).toHaveLength(4);
  });

  it("shares no data with Seojin beyond the school defaults", () => {
    const own = new Set([
      "id",
      "name",
      "major",
      "focus",
      "year",
      "school",
      "status",
      "gpa",
      "statusNote",
    ]);
    for (const [key, value] of Object.entries(me)) {
      if (own.has(key)) continue;
      expect(value, key).not.toEqual((SEOJIN as unknown as Record<string, unknown>)[key]);
    }
    expect(me.gpaGoal).not.toBe(SEOJIN.gpaGoal);
    const text = JSON.stringify(me);
    for (const needle of ["ECE 5", "MATH 20A", "PHYS 2A", "Seojin", "line-follower", "Robotics"]) {
      expect(text).not.toContain(needle);
    }
    for (const key of [
      "courses",
      "events",
      "tasks",
      "weeklyTargets",
      "longTerm",
      "goals",
      "interests",
      "skills",
    ] as const) {
      expect(me[key]).not.toBe(SEOJIN[key]);
    }
  });

  it("does not change the demo students", () => {
    expect(STUDENTS.map((s) => s.id)).toEqual(["seojin", "marcus", "priya"]);
    expect(SEOJIN.courses.map((c) => c.code)).toEqual(["ECE 5", "MATH 20A", "PHYS 2A"]);
    expect(SEOJIN.events.length).toBeGreaterThan(0);
    expect(SEOJIN.gpaGoal).toBe(3.8);
  });

  it("has a clean schedule: the whole week is free", () => {
    const gaps = findGaps(me.events, me.status);
    const use = timeUse(me.events, gaps);
    expect(use).toEqual({ allocated: 0, reallocate: 0, recompensate: 119 });
  });

  it("ranks opportunities from the major only", () => {
    const profile = profileFromStudent(me);
    expect(profile.major).toBe("Computer Engineering");
    expect(profile.goals).toEqual([]);
    expect(profile.interests).toEqual([]);
    expect(profile.skills).toEqual([]);
    expect(profile.context).toEqual([]);
  });
});

describe("parseProfile", () => {
  it("reads stored profile text and survives bad text", () => {
    expect(parseProfile('{"name":"Ada","major":"Bioengineering","focus":["career"]}')).toEqual({
      name: "Ada",
      major: "Bioengineering",
      focus: ["career"],
    });
    expect(parseProfile(null)).toEqual({});
    expect(parseProfile("{oops")).toEqual({});
    expect(parseProfile("[1]")).toEqual({});
    expect(parseProfile("null")).toEqual({});
  });

  it("keeps only the form's three answers, even if more is stored under the key", () => {
    const stale = JSON.stringify({
      name: "Ada",
      major: "Bioengineering",
      focus: ["career"],
      courses: [{ code: "ECE 5" }],
      events: [{ day: 0, start: 9, end: 10, title: "MATH 20A", kind: "class" }],
      tasks: [{ id: "t1", title: "Date night" }],
      resume: { name: "Seojin" },
    });
    expect(parseProfile(stale)).toEqual({
      name: "Ada",
      major: "Bioengineering",
      focus: ["career"],
    });
    const me = blankStudent(parseProfile(stale));
    expect(me.courses).toHaveLength(0);
    expect(me.events).toHaveLength(0);
    expect(me.tasks).toHaveLength(0);
    expect(me.resume).toBeUndefined();
  });
});
