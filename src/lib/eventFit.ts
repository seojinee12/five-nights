import type { CalEvent } from "./launchpad";
import { DAY_END, DAY_START } from "./schedule";

/** Moved or dropped events are reported so the reply can tell the student. */
export type FitResult = {
  events: CalEvent[];
  moved: { from: CalEvent; to: CalEvent }[];
  dropped: CalEvent[];
};

/** Start times are snapped to 5 minutes (1/12 hour). */
const STEP = 12;
const EPS = 1e-9;

const clash = (a: CalEvent, b: CalEvent) => a.day === b.day && a.start < b.end && b.start < a.end;

/**
 * Makes new events fit the week without overlapping existing events or each other, inside the
 * day window (DAY_START to DAY_END). An event that already fits stays as it is. One that does not is
 * shifted on its own day to the nearest free gap that is long enough (same length); when no gap on
 * that day is long enough it is dropped. Events are handled in order, so earlier new events count
 * as busy time for later ones. Pure; the inputs are not changed.
 */
export function fitEvents(existing: readonly CalEvent[], incoming: readonly CalEvent[]): FitResult {
  const busy = [...existing];
  const result: FitResult = { events: [], moved: [], dropped: [] };
  for (const event of incoming) {
    const placed = fits(event, busy) ? event : relocate(event, busy);
    if (!placed) {
      result.dropped.push(event);
      continue;
    }
    if (placed !== event) result.moved.push({ from: event, to: placed });
    busy.push(placed);
    result.events.push(placed);
  }
  return result;
}

function fits(event: CalEvent, busy: readonly CalEvent[]): boolean {
  if (event.start < DAY_START || event.end > DAY_END) return false;
  return !busy.some((other) => clash(event, other));
}

function relocate(event: CalEvent, busy: readonly CalEvent[]): CalEvent | null {
  const length = event.end - event.start;
  if (length > DAY_END - DAY_START + EPS) return null;
  const today = busy
    .filter((other) => other.day === event.day && other.end > DAY_START && other.start < DAY_END)
    .sort((a, b) => a.start - b.start);
  let best: CalEvent | null = null;
  let bestShift = Infinity;
  let cursor = DAY_START;
  for (const other of [...today, null]) {
    const until = other ? Math.max(other.start, cursor) : DAY_END;
    const low = Math.ceil(cursor * STEP - EPS) / STEP;
    const high = Math.floor((until - length) * STEP + EPS) / STEP;
    if (low <= high + EPS) {
      const start = round(Math.min(Math.max(event.start, low), high));
      const shift = Math.abs(start - event.start);
      if (shift < bestShift) {
        bestShift = shift;
        best = { ...event, start, end: round(start + length) };
      }
    }
    if (other) cursor = Math.max(cursor, other.end);
  }
  return best;
}

const round = (hours: number) => Math.round(hours * 10000) / 10000;
