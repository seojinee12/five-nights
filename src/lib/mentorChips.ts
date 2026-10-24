import type { Student, Task } from "./launchpad";
import { applyPatch, POSTPONED_DUE, type Patch } from "./patch";
import { sortTasks } from "./schedule";

/** Quick-reply chips for the Mentor panel. Pure helpers shared by the server and the client. */

export const MAX_CHOICES = 4;
export const MAX_CHOICE_LENGTH = 40;
/** Safety cap on the full text a chip sends; the shown label is cut to MAX_CHOICE_LENGTH. */
export const MAX_CHOICE_TEXT = 200;

/** A quick reply: `label` is what the chip shows (at most 40 characters), `text` is what it sends. */
export type Chip = { label: string; text: string };

export const AHEAD_CHIP = "I'm ahead of schedule";
export const BEHIND_CHIP = "I'm behind the schedule";
export const CHANGE_CHIP = "I have a schedule change";
export const OTHER_CHIP = "Something else";
export const REPRIORITIZE_CHIP = "Reprioritize my week";
const YES_CHIP = "Yes, apply it";
const NO_CHIP = "No, leave it";
const POSTPONE_PREFIX = "Postpone: ";

/**
 * Cleans a list of quick replies: strings only, whitespace collapsed and trimmed, blanks dropped,
 * duplicates (ignoring case, on the shown label) dropped, then at most 4 kept. Each chip shows its
 * text cut to 40 characters with an ellipsis, and keeps the full text (up to 200) to send.
 */
export function sanitizeChips(input: unknown): Chip[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: Chip[] = [];
  for (const item of input) {
    if (typeof item !== "string") continue;
    const text = item.replace(/\s+/g, " ").trim().slice(0, MAX_CHOICE_TEXT).trimEnd();
    const label = clip(text);
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    out.push({ label, text });
    if (out.length === MAX_CHOICES) break;
  }
  return out;
}

/** The model contract: `choices` as plain labels, each cleaned like `sanitizeChips` (at most 40 characters). */
export function sanitizeChoices(input: unknown): string[] {
  return sanitizeChips(input).map((chip) => chip.label);
}

/** Chips from plain labels, each sending its own label unless `texts` (same order) says otherwise. */
export function asChips(labels: string[], texts?: unknown): Chip[] {
  const full = Array.isArray(texts) ? texts : [];
  return labels.map((label, index) => {
    const text = full[index];
    return { label, text: typeof text === "string" && text.trim() ? text.trim() : label };
  });
}

/** Shortens a label to the chip limit, ending in an ellipsis when it was cut. */
export function clip(label: string, max = MAX_CHOICE_LENGTH): string {
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1).trimEnd()}…`;
}

/**
 * The starters, or yes/no while a change waits. These are for terminal-like turns (the greeting,
 * "Applied.", "Undone.", a declined change, a file note, an error) and for a waiting change,
 * never for a plain free-text reply.
 */
export function defaultChips(pending = false): string[] {
  return pending ? [YES_CHIP, NO_CHIP] : [AHEAD_CHIP, BEHIND_CHIP, CHANGE_CHIP];
}

/**
 * The model's own choices when it gave usable ones, otherwise `fallback`, which is empty unless
 * the turn is terminal-like or a change waits (see `defaultChips`). A free-text reply with no
 * choices therefore shows no chips. Server side, from the raw model output.
 */
export function replyChips(raw: unknown, fallback: string[] = []): Chip[] {
  const chips = sanitizeChips(raw);
  return chips.length ? chips : asChips(fallback);
}

/** Client side: the chips for a turn the server returned (`choices` labels, optional `choiceTexts`). */
export function turnChips(
  turn: { choices?: unknown; choiceTexts?: unknown },
  fallback: string[] = [],
): Chip[] {
  const labels = sanitizeChoices(turn.choices);
  return labels.length ? asChips(labels, turn.choiceTexts) : asChips(fallback);
}

const openTasks = (student: Student): Task[] =>
  sortTasks(student.tasks, student.focus).filter((task) => !task.done);

const mentions = (text: string, code: string) => text.toLowerCase().includes(code.toLowerCase());

/** Up to three goals drawn from the student's current work, then "Something else". */
export function aheadChips(student: Student): Chip[] {
  const labels: string[] = [];
  const task = openTasks(student).find((item) => item.category !== "fun");
  if (task) labels.push(`Get ahead on ${task.title}`);
  const course = student.courses.find(
    (item) => (!item.grade || item.grade === "IP") && !(task && mentions(task.title, item.code)),
  );
  if (course) labels.push(`Go deeper in ${course.code}`);
  const goals = [...(student.goals ?? []), ...student.courses.flatMap((item) => item.goals ?? [])];
  const goal = goals.find((item) => item.horizon === "short") ?? goals[0];
  if (goal) labels.push(`Push goal: ${goal.title}`);
  return sanitizeChips([...labels.slice(0, MAX_CHOICES - 1), OTHER_CHIP]);
}

/** The lowest-priority open tasks that can be moved to next week, lowest first. */
export function postponable(student: Student): Task[] {
  return openTasks(student)
    .filter(
      (task) =>
        task.due !== POSTPONED_DUE &&
        task.priority !== "highest" &&
        task.priority !== "high" &&
        !task.pinned,
    )
    .reverse();
}

/** Up to two postpone chips for the student's lowest-priority work, a reprioritize chip, "Something else". */
export function behindChips(student: Student): Chip[] {
  const postpone = postponable(student)
    .slice(0, 2)
    .map((task) => `${POSTPONE_PREFIX}${task.title}`);
  return sanitizeChips([...postpone, REPRIORITIZE_CHIP, OTHER_CHIP]);
}

export type ChipPlan =
  /** "Something else": focus the text box and send nothing. */
  | { kind: "focus" }
  /** No built-in flow: send the label to the mentor like typed text. */
  | { kind: "model" }
  /**
   * A built-in flow that needs no model call. `patch` is a single self-reported change the user
   * just chose (status or one postponed task), applied right away with Undo; `note` is its
   * one-line confirmation and `reply` the mentor's next question with its follow-up `choices`.
   */
  | { kind: "local"; patch: Patch | null; note: string | null; reply: string; choices: Chip[] };

export type SendRoute = ChipPlan | { kind: "ignore" } | { kind: "apply" } | { kind: "decline" };

/**
 * What happens when the panel sends `raw`, whether typed or from a chip. The message that shows
 * up as the user's bubble (and goes to the mentor) is the trimmed text itself, so a chip says
 * its full text, even when its label is cut. A waiting change is answered first (yes applies it, no drops it).
 */
export function routeMessage(
  raw: string,
  student: Student,
  hasPending: boolean,
  fromChip = false,
): { message: string; route: SendRoute } {
  const message = raw.trim();
  if (!message) return { message, route: { kind: "ignore" } };
  const plan = resolveChip(message, student, fromChip);
  if (plan.kind === "focus") return { message, route: plan };
  if (hasPending && /^(yes|yep|apply|do it|add them|add it)\b/i.test(message))
    return { message, route: { kind: "apply" } };
  if (hasPending && /^(no|nope|leave it)\b/i.test(message))
    return { message, route: { kind: "decline" } };
  return { message, route: plan };
}

const normalize = (label: string) => label.replace(/[’‘]/g, "'").trim().toLowerCase();

/** Decides what a chip label (or the same words typed) does for this student. Pure. */
export function resolveChip(label: string, student: Student, fromChip = false): ChipPlan {
  const key = normalize(label);
  if (fromChip && key === normalize(OTHER_CHIP)) return { kind: "focus" };
  if (key === normalize(AHEAD_CHIP)) {
    const already = student.status === "ahead";
    return {
      kind: "local",
      patch: already ? null : { status: "ahead" },
      note: already ? null : "Marked you as ahead.",
      reply: `${already ? "You're already marked as ahead. " : ""}What do you want to add on top of what you're working on?`,
      choices: aheadChips(student),
    };
  }
  if (key === normalize(BEHIND_CHIP)) {
    const already = student.status === "behind";
    return {
      kind: "local",
      patch: already ? null : { status: "behind" },
      note: already ? null : "Marked you as behind. Open weekday time can now go to academics.",
      reply: `${already ? "You're already marked as behind. " : ""}Want to postpone something or reprioritize the week?`,
      choices: behindChips(student),
    };
  }
  if (key === normalize(CHANGE_CHIP)) {
    return {
      kind: "local",
      patch: null,
      note: null,
      reply: "What changed? Tell me the day, the time and what's different.",
      choices: sanitizeChips(["Add an event", "Add a task", OTHER_CHIP]),
    };
  }
  const postpone = postponable(student).find(
    (task) =>
      sanitizeChoices([`${POSTPONE_PREFIX}${task.title}`])[0] === sanitizeChoices([label])[0],
  );
  if (postpone) {
    const patch: Patch = { postpone: [postpone.id] };
    return {
      kind: "local",
      patch,
      note: `Postponed “${postpone.title}” to next week.`,
      reply: "Anything else to postpone, or should I reprioritize the rest?",
      choices: behindChips(applyPatch(student, patch)),
    };
  }
  return { kind: "model" };
}
