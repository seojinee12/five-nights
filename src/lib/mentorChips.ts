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
const REVISE_CHIP = "Change something";
export const NEXT_CHIP = "What else can I add?";
export const SHOW_WEEK_CHIP = "Show my week";
export const ADD_GOAL_CHIP = "Add a goal";
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
 * The starters, or the yes / no / change set while a change waits. The starters are also what
 * the greeting, a declined change, a file note and an error turn offer: those flows need no model.
 */
export function defaultChips(pending = false): string[] {
  return pending ? [YES_CHIP, NO_CHIP, REVISE_CHIP] : [AHEAD_CHIP, BEHIND_CHIP, CHANGE_CHIP];
}

/**
 * The model's own choices when it gave usable ones, otherwise `fallback`. Server side, from the
 * raw model output; the client fills in the situation's fallback itself (see `fallbackChips`).
 */
export function replyChips(raw: unknown, fallback: string[] = []): Chip[] {
  const chips = sanitizeChips(raw);
  return chips.length ? chips : asChips(fallback);
}

/** Client side: the chips for a turn the server returned (`choices` labels, optional `choiceTexts`). */
export function turnChips(
  turn: { choices?: unknown; choiceTexts?: unknown },
  fallback: string[] | Chip[] = [],
): Chip[] {
  const labels = sanitizeChoices(turn.choices);
  if (labels.length) return asChips(labels, turn.choiceTexts);
  return typeof fallback[0] === "string" ? asChips(fallback as string[]) : (fallback as Chip[]);
}

/**
 * The chips for a reply the model returned: its own choices when it gave usable ones, otherwise the
 * fallback for what the turn was (a change added now, a change waiting, or a plain reply).
 */
export function modelTurnChips(
  turn: { reply: string; patch: unknown; choices?: unknown; choiceTexts?: unknown },
  student: Student,
  applied = false,
): Chip[] {
  const situation = applied ? "applied" : turn.patch ? "pending" : "reply";
  return turnChips(turn, fallbackChips(situation, student, turn.reply));
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

/** What the mentor just did or said, which decides the quick replies when the model gave none. */
export type ChipSituation =
  /** The greeting, a declined change, a file note or an error turn: the starters. */
  | "start"
  /** A change was applied, a small one was added, or one was undone: next steps. */
  | "applied"
  | "undone"
  /** A big change is waiting for an answer. */
  | "pending"
  /** A plain free-text reply from the model. */
  | "reply";

// A reply whose last question asks for a name, date or time cannot be answered with a tap.
const OPEN_ASK =
  /\b(what(?:'s| is| was)? (?:the |your |its )?(?:name|date|time|title|number|email)|what (?:date|time|day)|which (?:date|time)|when (?:is|are|was|does|do|would)|what should i call)\b/i;
const YES_NO_ASK =
  /^(?:do|does|did|is|are|am|was|were|can|could|will|would|should|shall|have|has|may|might|want|need|ok|okay|sound|how about|ready|interested)\b/i;

function lastQuestion(reply: string): string {
  const text = reply.trim();
  if (!text.endsWith("?")) return "";
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
  return sentences[sentences.length - 1] ?? "";
}

/** True when the reply ends by asking for something typed, such as a name, date or time. */
export function asksOpenQuestion(reply: string): boolean {
  return OPEN_ASK.test(lastQuestion(reply));
}

/** True when the reply ends with a plain yes/no question (no "or" between options). */
export function asksYesNo(reply: string): boolean {
  const question = lastQuestion(reply);
  return !!question && YES_NO_ASK.test(question) && !/\bor\b/i.test(question) && !OPEN_ASK.test(question);
}

/**
 * Quick replies for a turn the model gave none for, chosen from what just happened. Pure. The
 * panel adds "Something else" after these (see `withOther`).
 * - start: ahead / behind / schedule change.
 * - applied, undone: a next step, then up to two goals drawn from the student's current work.
 * - pending: yes / no / change something.
 * - reply: yes / no after a plain yes/no question; none when it asks for a name, date or time;
 *   otherwise show the week or add a goal.
 */
export function fallbackChips(situation: ChipSituation, student: Student, reply = ""): Chip[] {
  switch (situation) {
    case "start":
      return asChips(defaultChips());
    case "pending":
      return asChips(defaultChips(true));
    case "applied":
    case "undone": {
      const next = situation === "applied" ? NEXT_CHIP : "Try a different change";
      const work = aheadChips(student).filter((chip) => chip.label !== OTHER_CHIP);
      return sanitizeChips([next, ...work.slice(0, 2).map((chip) => chip.text)]);
    }
    case "reply":
      if (asksOpenQuestion(reply)) return [];
      if (asksYesNo(reply)) return asChips(["Yes", "No"]);
      return asChips([SHOW_WEEK_CHIP, ADD_GOAL_CHIP]);
  }
}

/**
 * Adds the "Something else" chip, last, to any non-empty list that is not the closed yes / no /
 * change set. Model choices stay at four; this extra is the panel's own.
 */
export function withOther(chips: Chip[]): Chip[] {
  if (!chips.length) return [];
  if (chips.some((chip) => chip.text === YES_CHIP)) return chips;
  const rest = chips.filter((chip) => chip.label !== OTHER_CHIP);
  return [...rest, { label: OTHER_CHIP, text: OTHER_CHIP }];
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
  if (
    hasPending &&
    (/^(yes|yep|yeah|apply|do it|add them|add it)\b/i.test(message) ||
      /^(sounds good|looks good|go ahead|sure|ok|okay|perfect)[.!\s]*$/i.test(message))
  )
    return { message, route: { kind: "apply" } };
  if (hasPending && /^(no|nope|leave it|never mind|cancel)\b/i.test(message))
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

/**
 * Whether a chip click should move focus back to the text box. Only a keyboard activation (Enter or
 * Space gives `click` event detail 0) does; a mouse or touch tap would pop up the on-screen keyboard.
 */
export function focusAfterChipClick(detail: number): boolean {
  return detail === 0;
}
