import type { CalEvent } from "./launchpad";

export interface PlacedEvent {
  event: CalEvent;
  /** Zero-based column among the events it overlaps. */
  column: number;
  /** How many columns its overlapping group is split into (1 when it overlaps nothing). */
  columns: number;
}

/**
 * Places one day's events side by side where they overlap, like a calendar: events that touch in
 * time (directly or through a chain of overlaps) share a group, and each group is split into as
 * many equal columns as it needs. `minHours` is the least height an event takes on screen, so a
 * very short event still counts as overlapping the one it sits on.
 */
export function placeEvents(events: CalEvent[], minHours = 0): PlacedEvent[] {
  const sorted = [...events].sort((a, b) => a.start - b.start || a.end - b.end);
  const endOf = (e: CalEvent) => Math.max(e.end, e.start + minHours);
  const placed: PlacedEvent[] = [];
  let group: PlacedEvent[] = [];
  let groupEnd = -Infinity;
  let columnEnds: number[] = [];
  const close = () => {
    for (const item of group) item.columns = columnEnds.length;
    placed.push(...group);
    group = [];
    columnEnds = [];
  };
  for (const event of sorted) {
    if (group.length && event.start >= groupEnd) close();
    let column = columnEnds.findIndex((end) => end <= event.start);
    if (column === -1) column = columnEnds.length;
    columnEnds[column] = endOf(event);
    group.push({ event, column, columns: 1 });
    groupEnd = Math.max(groupEnd, endOf(event));
  }
  close();
  return placed;
}
