/** Landing-page focus options, including the student's own ones ("+" chip). Pure helpers, no DOM. */
import type { Category } from "./launchpad";

export const FOCUS_OPTIONS: { id: Category; label: string }[] = [
  { id: "academic", label: "Academics" },
  { id: "career", label: "Career & research" },
  { id: "project", label: "Projects" },
  { id: "fun", label: "Personal life" },
];

export const CUSTOM_FOCUS_MAX_LENGTH = 40;
/** At most this many own focus areas, so the profile and the model prompt stay small. */
export const CUSTOM_FOCUS_MAX_COUNT = 6;

const key = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

/** Letters, numbers, spaces and & , - . only; whitespace collapsed and trimmed; capped at the max length. */
export function cleanFocusLabel(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} &,.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CUSTOM_FOCUS_MAX_LENGTH)
    .trim();
}

export type CustomFocusResult =
  | { ok: true; label: string }
  | { ok: false; reason: "empty" }
  | { ok: false; reason: "duplicate"; existing: string };

/**
 * Checks a typed focus. Duplicates are compared case-insensitively against the built-in labels and
 * ids and the student's other own focus areas; a duplicate reports the existing label so the caller can select it.
 */
export function validateCustomFocus(
  input: string,
  customLabels: readonly string[] = [],
): CustomFocusResult {
  const label = cleanFocusLabel(input);
  if (!label) return { ok: false, reason: "empty" };
  const wanted = key(label);
  for (const option of FOCUS_OPTIONS) {
    if (key(option.label) === wanted || option.id === wanted)
      return { ok: false, reason: "duplicate", existing: option.label };
  }
  const same = customLabels.find((existing) => key(existing) === wanted);
  if (same !== undefined) return { ok: false, reason: "duplicate", existing: same };
  return { ok: true, label };
}

export interface OwnFocus {
  label: string;
  on: boolean;
}

export interface FocusSelection {
  /** Selected built-in focus ids. */
  focus: string[];
  /** Every own focus chip, selected or not. */
  own: OwnFocus[];
}

/**
 * Folds a typed draft into the selection. A new focus is added selected; a duplicate selects the
 * chip that already exists; an empty draft changes nothing. `status` says which happened.
 */
export function commitFocusDraft(
  state: FocusSelection,
  draft: string,
): FocusSelection & { status: "empty" | "added" | "selected" } {
  const result = validateCustomFocus(
    draft,
    state.own.map((o) => o.label),
  );
  if (result.ok) {
    if (state.own.length >= CUSTOM_FOCUS_MAX_COUNT) return { ...state, status: "empty" };
    return {
      focus: state.focus,
      own: [...state.own, { label: result.label, on: true }],
      status: "added",
    };
  }
  if (result.reason === "empty") return { ...state, status: "empty" };
  const builtIn = FOCUS_OPTIONS.find((f) => f.label === result.existing);
  if (builtIn) {
    const focus = state.focus.includes(builtIn.id) ? state.focus : [...state.focus, builtIn.id];
    return { focus, own: state.own, status: "selected" };
  }
  return {
    focus: state.focus,
    own: state.own.map((o) => (o.label === result.existing ? { ...o, on: true } : o)),
    status: "selected",
  };
}

/** Cleans and dedupes a list of own focus areas, keeping order and dropping built-in names. */
export function cleanCustomFocus(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const item of list) {
    const result = validateCustomFocus(typeof item === "string" ? item : "", out);
    if (result.ok) out.push(result.label);
    if (out.length >= CUSTOM_FOCUS_MAX_COUNT) break;
  }
  return out;
}

/** The own focus areas as they may appear inside a model prompt. */
export const sanitizeFocusForPrompt = cleanCustomFocus;

/** A student snapshot with its own focus areas sanitized (or removed) before it goes into a prompt. */
export function studentForPrompt<T extends object>(student: T): T {
  const copy = { ...student } as Record<string, unknown>;
  const safe = sanitizeFocusForPrompt(copy["customFocus"]);
  if (safe.length) copy["customFocus"] = safe;
  else delete copy["customFocus"];
  return copy as T;
}

export interface StoredFocusProfile {
  name?: string;
  major?: string;
  focus: Category[];
  customFocus: string[];
}

/** Reads the landing-page profile from localStorage text. Bad or missing text gives an empty profile. */
export function parseFocusProfile(raw: string | null): StoredFocusProfile {
  let value: unknown;
  try {
    value = JSON.parse(raw || "{}");
  } catch {
    value = null;
  }
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const ids = FOCUS_OPTIONS.map((option) => option.id);
  const picked = (Array.isArray(record["focus"]) ? record["focus"] : []).filter(
    (f, i, all): f is Category => ids.includes(f as Category) && all.indexOf(f) === i,
  );
  const profile: StoredFocusProfile = {
    focus: picked,
    customFocus: cleanCustomFocus(record["customFocus"]),
  };
  if (typeof record["name"] === "string") profile.name = record["name"];
  if (typeof record["major"] === "string") profile.major = record["major"];
  return profile;
}
