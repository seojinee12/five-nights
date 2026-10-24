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
 * addTasks (a task), longTermAdd (a yearly goal / reminder) or weeklyTargets (an
 * hour target), and nothing else. The patch format has no removal or move
 * operations, so anything that tries to express one (an unknown key, or an item
 * the sanitizer had to drop) counts as big.
 *
 * Everything else is big: no/malformed patch, more than one item, any calendar
 * event (addEvents), courses, status or statusNote changes, unknown keys.
 * When in doubt, big.
 */
export function classifyPatch(input: unknown): PatchSize {
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
  if (patch.status || patch.statusNote || patch.addEvents || patch.courses) return "big";
  const count =
    (patch.addTasks?.length ?? 0) +
    (patch.longTermAdd?.length ?? 0) +
    (patch.weeklyTargets?.length ?? 0);
  return count === 1 ? "small" : "big";
}

/** One-line description of a small patch for the chat note. */
export function describeSmallPatch(patch: Patch): string {
  const task = patch.addTasks?.[0];
  if (task) return `task “${task.title}”`;
  const goal = patch.longTermAdd?.[0];
  if (goal) return `yearly goal “${goal}”`;
  const target = patch.weeklyTargets?.[0];
  if (target) return `weekly target “${target.label}” (${target.hours}h)`;
  return "that change";
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
