import { describe, expect, it } from "vitest";
import { loadWindow, saveWindow, timeLabel, windowOptions, withWindowChange } from "./dayWindow";
import { fmt } from "./launchpad";

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  };
}

describe("labels", () => {
  it("formats hours as clock times", () => {
    expect(timeLabel(6)).toBe("6:00 AM");
    expect(timeLabel(23)).toBe("11:00 PM");
    expect(timeLabel(12)).toBe("12:00 PM");
    expect(timeLabel(0)).toBe("12:00 AM");
    expect(timeLabel(24)).toBe("12:00 AM");
    expect(timeLabel(8.5)).toBe("8:30 AM");
  });
  it("fmt reads 24 as midnight", () => {
    expect(fmt(24)).toBe("12a");
    expect(fmt(0)).toBe("12a");
    expect(fmt(12)).toBe("12p");
    expect(fmt(23)).toBe("11p");
  });
});

describe("options and changes", () => {
  it("disables options that would end before the start or leave under 4 hours", () => {
    const { starts, ends } = windowOptions({ start: 6, end: 23 });
    expect(starts.find((o) => o.value === 19)?.disabled).toBe(false);
    expect(starts.find((o) => o.value === 20)?.disabled).toBe(true);
    expect(ends.find((o) => o.value === 10)?.disabled).toBe(false);
    expect(ends.find((o) => o.value === 9)?.disabled).toBe(true);
    expect(ends.at(-1)?.value).toBe(24);
    expect(starts[0]?.value).toBe(0);
  });
  it("applies a valid change and ignores an invalid one", () => {
    const base = { start: 6, end: 23 };
    expect(withWindowChange(base, { start: 8 })).toEqual({ start: 8, end: 23 });
    expect(withWindowChange(base, { end: 24 })).toEqual({ start: 6, end: 24 });
    expect(withWindowChange(base, { start: 22 })).toBe(base);
    expect(withWindowChange(base, { end: 5 })).toBe(base);
  });
});

describe("persistence", () => {
  it("defaults when nothing or garbage is stored", () => {
    expect(loadWindow("seojin", memory())).toEqual({ start: 6, end: 23 });
    expect(loadWindow("seojin", memory({ "lp-day-window:seojin": "not json" }))).toEqual({
      start: 6,
      end: 23,
    });
    expect(
      loadWindow("seojin", memory({ "lp-day-window:seojin": '{"start":20,"end":3}' })),
    ).toEqual({ start: 6, end: 23 });
    expect(loadWindow("me", memory({ "lp-profile": "{" }))).toEqual({ start: 6, end: 23 });
  });
  it("keeps demo students separate, each under its own key", () => {
    const store = memory();
    saveWindow("marcus", { start: 8, end: 22 }, store);
    expect(loadWindow("marcus", store)).toEqual({ start: 8, end: 22 });
    expect(loadWindow("priya", store)).toEqual({ start: 6, end: 23 });
  });
  it("stores the me student inside lp-profile without losing other profile fields", () => {
    const store = memory({
      "lp-profile": JSON.stringify({ name: "Sam", major: "EE", focus: ["academic"] }),
    });
    saveWindow("me", { start: 7, end: 24 }, store);
    expect(JSON.parse(store.data["lp-profile"] ?? "{}")).toEqual({
      name: "Sam",
      major: "EE",
      focus: ["academic"],
      dayStart: 7,
      dayEnd: 24,
    });
    expect(loadWindow("me", store)).toEqual({ start: 7, end: 24 });
  });
  it("refuses to save an invalid window", () => {
    const store = memory();
    saveWindow("seojin", { start: 12, end: 8 }, store);
    expect(Object.keys(store.data)).toEqual([]);
  });
  it("survives a storage that throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(loadWindow("me", broken)).toEqual({ start: 6, end: 23 });
    expect(() => saveWindow("me", { start: 7, end: 20 }, broken)).not.toThrow();
  });
});
