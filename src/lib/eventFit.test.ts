import { describe, expect, it } from "vitest";
import { fitEvents } from "./eventFit";
import type { CalEvent } from "./launchpad";
import { eventsOverlap } from "./patchSize";

const ev = (day: number, start: number, end: number, title = "Study block"): CalEvent => ({
  day,
  start,
  end,
  title,
  kind: "task",
});
const classes: CalEvent[] = [ev(0, 9, 10, "MATH"), ev(0, 13, 14, "PHYS"), ev(0, 15, 17, "Lab")];

describe("fitEvents", () => {
  it("keeps events that already fit, unchanged", () => {
    const mine = [ev(0, 10, 13), ev(1, 8, 11)];
    const result = fitEvents(classes, mine);
    expect(result.events).toEqual(mine);
    expect(result.moved).toEqual([]);
    expect(result.dropped).toEqual([]);
  });

  it("allows back-to-back events", () => {
    expect(fitEvents(classes, [ev(0, 10, 13)]).moved).toEqual([]);
  });

  it("shifts an overlapping event to the nearest free gap of the same length", () => {
    // 14:00-17:00 hits PHYS and Lab. The gaps that fit 3h are 6-9 and 17-23; 17 is nearer.
    const { events, moved } = fitEvents(classes, [ev(0, 14, 17)]);
    expect(events).toEqual([ev(0, 17, 20)]);
    expect(moved).toEqual([{ from: ev(0, 14, 17), to: ev(0, 17, 20) }]);
  });

  it("can shift earlier, and keeps the length and the day", () => {
    const { events } = fitEvents([ev(2, 18, 23)], [ev(2, 19, 21.5)]);
    expect(events).toEqual([ev(2, 15.5, 18)]);
  });

  it("moves an event that sticks out of the day window inside it", () => {
    expect(fitEvents([], [ev(5, 21, 26)]).events).toEqual([ev(5, 18, 23)]);
    expect(fitEvents([], [ev(5, 4, 7)]).events).toEqual([ev(5, 6, 9)]);
  });

  it("drops an event when no gap on its day is long enough", () => {
    const { events, dropped } = fitEvents(classes, [ev(0, 9, 19)]);
    expect(events).toEqual([]);
    expect(dropped).toEqual([ev(0, 9, 19)]);
  });

  it("counts earlier new events as busy time for later ones", () => {
    const { events } = fitEvents([], [ev(1, 10, 13, "A"), ev(1, 11, 14, "B")]);
    expect(events).toEqual([ev(1, 10, 13, "A"), ev(1, 13, 16, "B")]);
  });

  it("never overlaps anything and does not change its inputs", () => {
    const before = structuredClone(classes);
    const incoming = [ev(0, 9.5, 12.5), ev(0, 13.5, 16.5), ev(0, 10, 11)];
    const { events } = fitEvents(classes, incoming);
    expect(classes).toEqual(before);
    const all = [...classes, ...events];
    for (const [i, a] of all.entries())
      for (const b of all.slice(i + 1)) expect(eventsOverlap(a, b)).toBe(false);
    for (const e of events) expect(e.start >= 6 && e.end <= 23).toBe(true);
  });

  it("snaps shifted starts to five minutes", () => {
    const { events } = fitEvents([ev(0, 9, 9.83)], [ev(0, 9.5, 11.5)]);
    expect(events[0]?.start).toBeCloseTo(9.8333, 3);
    expect(events[0]?.end).toBeCloseTo(11.8333, 3);
  });
});
