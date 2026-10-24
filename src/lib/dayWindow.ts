import {
  DEFAULT_WINDOW,
  isValidWindow,
  MIN_WINDOW_HOURS,
  normalizeWindow,
  type DayWindow,
} from "./schedule";

/** Day-window labels and persistence. The window itself and its math live in schedule.ts. */

const PROFILE_KEY = "lp-profile";
const keyFor = (studentId: string) => `lp-day-window:${studentId}`;

type Store = Pick<Storage, "getItem" | "setItem">;

/** 6 -> "6:00 AM", 23 -> "11:00 PM", 0 and 24 -> "12:00 AM". */
export function timeLabel(hour: number): string {
  const h = Math.floor(hour) % 24;
  const minutes = hour % 1 ? "30" : "00";
  return `${((h + 11) % 12) + 1}:${minutes} ${h >= 12 ? "PM" : "AM"}`;
}

/** Selectable start/end hours (whole hours). Options that would break the rules are disabled. */
export function windowOptions(window: DayWindow) {
  const hours = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i);
  return {
    starts: hours(0, 24 - MIN_WINDOW_HOURS).map((value) => ({
      value,
      disabled: window.end - value < MIN_WINDOW_HOURS,
    })),
    ends: hours(MIN_WINDOW_HOURS, 24).map((value) => ({
      value,
      disabled: value - window.start < MIN_WINDOW_HOURS,
    })),
  };
}

/** Apply one change; an invalid result leaves the window as it was. */
export function withWindowChange(window: DayWindow, change: Partial<DayWindow>): DayWindow {
  const next = { ...window, ...change };
  return isValidWindow(next) ? next : window;
}

function readJson(store: Store, key: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(store.getItem(key) || "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The "me" student keeps it in the lp-profile entry; demo students under their own key. */
export function loadWindow(studentId: string, store: Store): DayWindow {
  try {
    if (studentId === "me") {
      const profile = readJson(store, PROFILE_KEY);
      return normalizeWindow({ start: profile["dayStart"], end: profile["dayEnd"] });
    }
    return normalizeWindow(readJson(store, keyFor(studentId)));
  } catch {
    return { ...DEFAULT_WINDOW };
  }
}

export function saveWindow(studentId: string, window: DayWindow, store: Store): void {
  if (!isValidWindow(window)) return;
  try {
    if (studentId === "me") {
      const profile = readJson(store, PROFILE_KEY);
      store.setItem(
        PROFILE_KEY,
        JSON.stringify({ ...profile, dayStart: window.start, dayEnd: window.end }),
      );
    } else {
      store.setItem(keyFor(studentId), JSON.stringify({ start: window.start, end: window.end }));
    }
  } catch {
    // storage full or blocked: the setting still applies for this session
  }
}
