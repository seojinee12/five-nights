import type { CalEvent } from "./launchpad";
import { sanitizePatch, type Patch } from "./patch";

export type PatchSize = "small" | "big";

const KNOWN_SECTIONS = [
  "status",
  "statusNote",
  "addEvents",
  "addTasks",
  "courses",
  "longTermAdd",
  "weeklyTargets",
] as const;
const LIST_SECTIONS = ["addEvents", "addTasks", "courses", "longTermAdd", "weeklyTargets"] as const;

/**
 * Small = after sanitizePatch, the patch holds exactly ONE item in exactly ONE of
 * addTasks (a task), longTermAdd (a yearly goal / reminder), weeklyTargets (an
 * hour target) or addEvents (one calendar event), and nothing else. The patch
 * format has no removal or move operations, so anything that tries to express one
 * (an unknown key such as removeEvents / moveEvents, or an item the sanitizer had
 * to drop) counts as big.
 *
 * A single event is small only when it is well formed (numeric integer day 0-6,
 * 0 <= start < end <= 24, a title) AND provably does not overlap any existing
 * event. That needs the current events: pass them as `existingEvents`. Without
 * them (undefined) an event can never be proven non-overlapping, so it is big.
 * Overlap: same day and a.start < b.end && b.start < a.end. Back-to-back events
 * (one ends exactly when the next starts) do not overlap. An existing event on the
 * same day with missing or unparseable times, or one with an unusable day, counts
 * as "cannot prove" and makes the patch big.
 *
 * Everything else is big: no/malformed patch, more than one item, events combined
 * with any other section, courses, status or statusNote changes, unknown keys.
 * Calendar file imports and uploaded materials never reach this function as small:
 * they always go through the ask-first path. When in doubt, big.
 */
export function classifyPatch(input: unknown, existingEvents?: readonly unknown[]): PatchSize {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "big";
  const raw = input as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!(KNOWN_SECTIONS as readonly string[]).includes(key) && !isBlank(raw[key])) return "big";
  }
  const patch = sanitizePatch(raw);
  if (!patch) return "big";
  for (const key of LIST_SECTIONS) {
    const value = raw[key];
    if (isBlank(value)) continue;
    if (!Array.isArray(value) || value.length !== (patch[key]?.length ?? 0)) return "big";
  }
  if (patch.status || patch.statusNote || patch.courses) return "big";
  const others =
    (patch.addTasks?.length ?? 0) +
    (patch.longTermAdd?.length ?? 0) +
    (patch.weeklyTargets?.length ?? 0);
  const events = patch.addEvents?.length ?? 0;
  if (events > 0) {
    if (events !== 1 || others !== 0) return "big";
    return isSafeNewEvent(patch.addEvents?.[0], (raw["addEvents"] as unknown[])[0], existingEvents)
      ? "small"
      : "big";
  }
  return others === 1 ? "small" : "big";
}

/** One-line description of a small patch for the chat note. */
export function describeSmallPatch(patch: Patch): string {
  const event = patch.addEvents?.[0];
  if (event) return `event “${event.title}”`;
  const task = patch.addTasks?.[0];
  if (task) return `task “${task.title}”`;
  const goal = patch.longTermAdd?.[0];
  if (goal) return `yearly goal “${goal}”`;
  const target = patch.weeklyTargets?.[0];
  if (target) return `weekly target “${target.label}” (${target.hours}h)`;
  return "that change";
}

/** True when two events share a day and their time ranges intersect. */
export function eventsOverlap(
  a: { day: number; start: number; end: number },
  b: { day: number; start: number; end: number },
): boolean {
  return a.day === b.day && a.start < b.end && b.start < a.end;
}

function isSafeNewEvent(
  event: CalEvent | undefined,
  rawEvent: unknown,
  existing: readonly unknown[] | undefined,
): boolean {
  if (!event || !existing || !Array.isArray(existing)) return false;
  // The sanitizer rounds/clamps the day and coerces strings; anything that needed
  // that is malformed for the purposes of applying without asking.
  const row = rawEvent as Record<string, unknown> | null;
  if (!row || typeof row !== "object") return false;
  const { day, start, end } = row;
  if (typeof day !== "number" || !Number.isInteger(day) || day < 0 || day > 6) return false;
  if (typeof start !== "number" || typeof end !== "number") return false;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > 24 || end <= start) {
    return false;
  }
  const next = { day, start, end };
  for (const item of existing) {
    if (!item || typeof item !== "object") return false;
    const other = item as Record<string, unknown>;
    const otherDay = other["day"];
    if (typeof otherDay !== "number" || !Number.isFinite(otherDay)) return false;
    if (otherDay !== day) continue;
    const otherStart = other["start"];
    const otherEnd = other["end"];
    if (typeof otherStart !== "number" || typeof otherEnd !== "number") return false;
    if (!Number.isFinite(otherStart) || !Number.isFinite(otherEnd) || otherEnd <= otherStart) {
      return false;
    }
    if (eventsOverlap(next, { day: otherDay, start: otherStart, end: otherEnd })) return false;
  }
  return true;
}

function isBlank(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    value === false ||
    (Array.isArray(value) && value.length === 0)
  );
}
