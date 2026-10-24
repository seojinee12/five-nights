import { describe, expect, it } from "vitest";
import type { CalEvent } from "./launchpad";
import { placeEvents } from "./eventLayout";

const ev = (start: number, end: number, title = "x"): CalEvent => ({
  day: 0,
  start,
  end,
  title,
  kind: "class",
});
const cols = (events: CalEvent[], min = 0) =>
  placeEvents(events, min).map((p) => [p.event.start, p.column, p.columns]);

describe("placeEvents", () => {
  it("leaves events that do not overlap full width", () => {
    expect(cols([ev(9, 10), ev(10, 11)])).toEqual([
      [9, 0, 1],
      [10, 0, 1],
    ]);
  });

  it("puts two overlapping events side by side", () => {
    expect(cols([ev(9, 11), ev(10, 12)])).toEqual([
      [9, 0, 2],
      [10, 1, 2],
    ]);
  });

  it("reuses a column once its event has ended, within the same group", () => {
    // 9-12 overlaps both 9:30-10 and 11-13; the last two do not overlap each other.
    expect(cols([ev(9, 12), ev(9.5, 10), ev(11, 13)])).toEqual([
      [9, 0, 2],
      [9.5, 1, 2],
      [11, 1, 2],
    ]);
  });

  it("splits only the group that overlaps, not the whole day", () => {
    expect(cols([ev(8, 9), ev(10, 12), ev(11, 13), ev(15, 16)])).toEqual([
      [8, 0, 1],
      [10, 0, 2],
      [11, 1, 2],
      [15, 0, 1],
    ]);
  });

  it("handles three at once and identical times", () => {
    expect(cols([ev(9, 10), ev(9, 10), ev(9, 10)])).toEqual([
      [9, 0, 3],
      [9, 1, 3],
      [9, 2, 3],
    ]);
  });

  it("counts a very short event's minimum height as overlap", () => {
    expect(cols([ev(9, 9.1), ev(9.2, 10)], 0.46)).toEqual([
      [9, 0, 2],
      [9.2, 1, 2],
    ]);
    expect(cols([ev(9, 9.1), ev(9.2, 10)], 0)).toEqual([
      [9, 0, 1],
      [9.2, 0, 1],
    ]);
  });

  it("returns nothing for no events and does not change its input", () => {
    expect(placeEvents([])).toEqual([]);
    const input = [ev(10, 11), ev(9, 10)];
    placeEvents(input);
    expect(input.map((e) => e.start)).toEqual([10, 9]);
  });
});
