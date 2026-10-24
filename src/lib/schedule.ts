import type { CalEvent, Category, Status, Task } from "./launchpad";

/** Schedule math for the Scheduler tab: task order, free-time gaps, and weekly time totals. */

/** The part of each day that counts as the student's time, in whole or half hours (0–24). */
export interface DayWindow {
  start: number;
  end: number;
}

export const DAY_START = 6;
export const DAY_END = 23;
export const DEFAULT_WINDOW: DayWindow = { start: DAY_START, end: DAY_END };
/** Shortest allowed window, in hours per day. */
export const MIN_WINDOW_HOURS = 4;

/** True when both ends are on the half hour, inside 0–24, and at least MIN_WINDOW_HOURS apart. */
export function isValidWindow(window: unknown): window is DayWindow {
  if (!window || typeof window !== "object") return false;
  const { start, end } = window as Partial<DayWindow>;
  const half = (n: unknown): n is number =>
    typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 24 && n * 2 === Math.round(n * 2);
  return half(start) && half(end) && end - start >= MIN_WINDOW_HOURS;
}

/**
 * A usable window from untrusted input (for example hand-edited storage): whole hours only, with
 * the start rounded down and the end rounded up, so 6:30 becomes 6 and 22:30 becomes 23.
 * Anything still invalid gives the default (6am–11pm).
 */
export function normalizeWindow(window: unknown): DayWindow {
  if (window && typeof window === "object") {
    const { start, end } = window as Partial<DayWindow>;
    if (typeof start === "number" && typeof end === "number") {
      const whole = { start: Math.floor(start), end: Math.ceil(end) };
      if (isValidWindow(whole)) return whole;
    }
  }
  return { ...DEFAULT_WINDOW };
}

export const windowHours = (window: DayWindow = DEFAULT_WINDOW) => window.end - window.start;

/** Total hours in the week: only the window counts, so (end - start) x 7. */
export const weekHours = (window: DayWindow = DEFAULT_WINDOW) => windowHours(window) * 7;

/** Gaps shorter than this (hours) are not worth showing. */
const MIN_GAP = 0.15;
/** A free gap shorter than this (hours) is hidden unless it is transition time between classes. */
const MIN_FREE_GAP = 0.5;
/** A weekday gap this long (hours) is unused time when the student is behind. */
const LAZY_GAP = 2;
const EPS = 1e-9;

const DEFAULT_FOCUS: Category[] = ["academic", "career", "project", "fun"];
const PRIORITY_RANK: Record<NonNullable<Task["priority"]>, number> = {
  highest: 0,
  high: 1,
  low: 3,
};
const NORMAL_RANK = 2;
const DAY_NAMES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/**
 * Hours since Monday 00:00 for a due string such as "Thu", "Wed 4pm" or "Fri 7:30pm".
 * "Overdue" sorts before everything. A day with no time means the end of that day.
 * Anything else (including no due date) is undefined and sorts last.
 */
export function dueRank(due: string | undefined): number | undefined {
  const text = (due ?? "").trim().toLowerCase();
  if (!text) return undefined;
  if (text === "overdue") return -1;
  const match = text.match(/^([a-z]{3})[a-z]*\.?(?:\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm))?$/);
  if (!match) return undefined;
  const day = DAY_NAMES.indexOf(match[1] ?? "");
  if (day < 0) return undefined;
  if (!match[2]) return day * 24 + 23.99;
  const hour12 = Number(match[2]);
  const minute = Number(match[3] ?? 0);
  if (hour12 < 1 || hour12 > 12 || minute > 59) return undefined;
  const hour = (hour12 % 12) + (match[4] === "pm" ? 12 : 0);
  return day * 24 + hour + minute / 60;
}

/**
 * Task order for "Up next". Never mutates its input. Keys, in order:
 * 1. open tasks before done ones
 * 2. explicit priority: highest, high, (none), low
 * 3. pinned first
 * 4. the student's category focus order (unknown categories last)
 * 5. earlier due date first (no or unreadable due date last)
 * 6. more hours first (no estimate last)
 * 7. original position, so equal tasks never swap between renders
 */
export function sortTasks(tasks: Task[], focus: Category[] = DEFAULT_FOCUS): Task[] {
  const categoryRank = (category: Category) => {
    const index = focus.indexOf(category);
    return index < 0 ? focus.length : index;
  };
  const keyed = tasks.map((task, index) => ({
    task,
    index,
    done: task.done ? 1 : 0,
    priority: task.priority ? (PRIORITY_RANK[task.priority] ?? NORMAL_RANK) : NORMAL_RANK,
    pinned: task.pinned ? 0 : 1,
    category: categoryRank(task.category),
    due: dueRank(task.due) ?? Infinity,
    hours: task.hours && task.hours > 0 ? task.hours : 0,
  }));
  keyed.sort(
    (a, b) =>
      a.done - b.done ||
      a.priority - b.priority ||
      a.pinned - b.pinned ||
      a.category - b.category ||
      compare(a.due, b.due) ||
      b.hours - a.hours ||
      a.index - b.index,
  );
  return keyed.map((item) => item.task);
}

// Infinity - Infinity is NaN, so compare explicitly.
function compare(a: number, b: number): number {
  return a === b ? 0 : a < b ? -1 : 1;
}

export interface Gap {
  day: number;
  start: number;
  end: number;
  type: "free" | "pseudo" | "lazy";
}

/**
 * Finds empty time per day inside the day window (default 6am–11pm); time outside it is ignored.
 * - "pseudo": under 30 min between two classes (walking/transition time).
 * - "lazy": 2h+ on a "behind" student's weekday, after the day's first event.
 * - "free": everything else that is at least 30 min.
 * Overlapping events are handled by tracking the event that ends last.
 */
export function findGaps(
  events: CalEvent[],
  status: Status,
  window: DayWindow = DEFAULT_WINDOW,
): Gap[] {
  const gaps: Gap[] = [];
  for (let day = 0; day < 7; day++) {
    const todays = events
      .filter((event) => event.day === day)
      .sort((a, b) => a.start - b.start || a.end - b.end);
    let cursor = window.start;
    let last: CalEvent | null = null;
    for (const next of [...todays, null]) {
      const until = next ? Math.min(next.start, window.end) : window.end;
      const length = until - cursor;
      if (length >= MIN_GAP - EPS) {
        const type = gapType(length, last, next, status, day);
        if (type !== "free" || length >= MIN_FREE_GAP - EPS)
          gaps.push({ day, start: round2(cursor), end: round2(until), type });
      }
      if (next && next.end > cursor) {
        cursor = next.end;
        last = next;
      }
    }
  }
  return gaps;
}

function gapType(
  length: number,
  before: CalEvent | null,
  after: CalEvent | null,
  status: Status,
  day: number,
): Gap["type"] {
  if (before?.kind === "class" && after?.kind === "class" && length < MIN_FREE_GAP) return "pseudo";
  if (before && status === "behind" && length >= LAZY_GAP - EPS && day < 5) return "lazy";
  return "free";
}

type Interval = [number, number];

/** Clips events to the window and merges overlaps, per day, so no hour is counted twice. */
function merged(events: CalEvent[], window: DayWindow): Map<number, Interval[]> {
  const byDay = new Map<number, Interval[]>();
  for (const event of events) {
    const start = Math.max(window.start, event.start);
    const end = Math.min(window.end, event.end);
    if (!(end > start) || event.day < 0 || event.day > 6) continue;
    byDay.set(event.day, [...(byDay.get(event.day) ?? []), [start, end]]);
  }
  for (const [day, list] of byDay) {
    list.sort((a, b) => a[0] - b[0]);
    const out: Interval[] = [];
    for (const [start, end] of list) {
      const top = out[out.length - 1];
      if (top && start <= top[1]) top[1] = Math.max(top[1], end);
      else out.push([start, end]);
    }
    byDay.set(day, out);
  }
  return byDay;
}

function total(byDay: Map<number, Interval[]>): number {
  let sum = 0;
  for (const list of byDay.values()) for (const [start, end] of list) sum += end - start;
  return sum;
}

/** Hours of `from` that are not covered by `minus`, per day. */
function subtract(
  from: Map<number, Interval[]>,
  minus: Map<number, Interval[]>,
): Map<number, Interval[]> {
  const out = new Map<number, Interval[]>();
  for (const [day, list] of from) {
    let pieces = list;
    for (const [cutStart, cutEnd] of minus.get(day) ?? []) {
      pieces = pieces.flatMap(([start, end]): Interval[] => {
        if (cutEnd <= start || cutStart >= end) return [[start, end]];
        const left: Interval[] = cutStart > start ? [[start, cutStart]] : [];
        const right: Interval[] = cutEnd < end ? [[cutEnd, end]] : [];
        return [...left, ...right];
      });
    }
    out.set(day, pieces);
  }
  return out;
}

/**
 * Weekly time totals in hours (rounded to 0.01), all measured inside the day window (the week's
 * total is weekHours(window)):
 * - allocated: class and task time already on the calendar
 * - reallocate: life time that could move, plus lazy gaps
 * - recompensate: free gaps still open
 * Events are clipped to the window (events entirely outside are ignored). Overlapping or
 * duplicate events count once; life time under a class or task counts as allocated.
 */
export function timeUse(events: CalEvent[], gaps: Gap[], window: DayWindow = DEFAULT_WINDOW) {
  const work = merged(
    events.filter((event) => event.kind !== "life"),
    window,
  );
  const life = subtract(
    merged(
      events.filter((event) => event.kind === "life"),
      window,
    ),
    work,
  );
  const gapHours = (type: Gap["type"]) =>
    gaps
      .filter((gap) => gap.type === type)
      .reduce(
        (sum, gap) =>
          sum + Math.max(0, Math.min(gap.end, window.end) - Math.max(gap.start, window.start)),
        0,
      );
  return {
    allocated: round2(total(work)),
    reallocate: round2(total(life) + gapHours("lazy")),
    recompensate: round2(gapHours("free")),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
