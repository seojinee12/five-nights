import { z } from "zod";
import { normalizeName, normalizeUrl } from "./opportunities";

/** Most opportunities kept across both lists after "Find more" merges new results in. */
export const MAX_TOTAL = 30;
const MAX_RESULTS_ASKED = 8;

const text = (max: number) => z.string().trim().min(1).max(max);

/**
 * What "Find more" sends to the server: names and links already shown, plus the few profile
 * fields used to tailor the search. Nothing from the resume or coursework goes in here.
 */
export const FindMoreInputSchema = z.object({
  exclude: z.array(text(300)).max(2 * MAX_TOTAL + 20),
  interests: z.array(text(120)).max(12).default([]),
  goals: z.array(text(120)).max(12).default([]),
  year: text(40).optional(),
  major: text(80).optional(),
});
export type FindMoreInput = z.infer<typeof FindMoreInputSchema>;

export function parseFindMoreInput(data: unknown): FindMoreInput {
  return FindMoreInputSchema.parse(data);
}

/** Trims, dedupes and caps a client-side list so it always passes the schema. */
export function cleanList(
  list: readonly string[] | undefined,
  count: number,
  max: number,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list ?? []) {
    const value = raw.replace(/\s+/g, " ").trim().slice(0, max).trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= count) break;
  }
  return out;
}

interface Named {
  name: string;
  url: string;
}

function isExcluded(item: Named, exclude: readonly string[]): boolean {
  const names = new Set<string>();
  const urls = new Set<string>();
  for (const e of exclude) {
    names.add(normalizeName(e));
    urls.add(normalizeUrl(e));
  }
  return names.has(normalizeName(item.name)) || urls.has(normalizeUrl(item.url));
}

/** Drops anything whose name or link matches an excluded entry, and repeats within the list. */
export function dropExcluded<T extends Named>(
  items: readonly T[],
  exclude: readonly string[],
): T[] {
  const names = new Set<string>();
  const urls = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (isExcluded(item, exclude)) continue;
    const n = normalizeName(item.name);
    const u = normalizeUrl(item.url);
    if (names.has(n) || urls.has(u)) continue;
    names.add(n);
    urls.add(u);
    out.push(item);
  }
  return out;
}

/**
 * Adds new items after the existing ones, skipping any with the same name or link, and stops
 * once `room` items have been added. Existing items always stay.
 */
export function mergeOpportunities<T extends Named>(
  existing: readonly T[],
  incoming: readonly T[],
  room: number,
): T[] {
  const fresh = dropExcluded(
    incoming,
    existing.flatMap((e) => [e.name, e.url]),
  );
  return [...existing, ...fresh.slice(0, Math.max(0, room))];
}

/** Merges new research and project items into the current lists without passing `cap` in total. */
export function mergeLists<R extends Named, P extends Named>(
  current: { research: readonly R[]; projects: readonly P[] },
  incoming: { research: readonly R[]; projects: readonly P[] },
  cap: number = MAX_TOTAL,
): { research: R[]; projects: P[]; added: number } {
  const before = current.research.length + current.projects.length;
  const research = mergeOpportunities(current.research, incoming.research, cap - before);
  const projects = mergeOpportunities(
    current.projects,
    incoming.projects,
    cap - before - (research.length - current.research.length),
  );
  const added = research.length + projects.length - before;
  return { research, projects, added };
}

/** One line of untrusted text, safe to place in a prompt. */
function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function findMorePrompt(input: FindMoreInput): string {
  const profile = [
    input.year ? `year: ${oneLine(input.year)}` : "",
    input.major ? `major: ${oneLine(input.major)}` : "",
    input.interests.length ? `interests: ${input.interests.map(oneLine).join("; ")}` : "",
    input.goals.length ? `goals: ${input.goals.map(oneLine).join("; ")}` : "",
  ].filter(Boolean);
  return [
    "Use Google Search. Find additional real, current opportunities for a UC San Diego undergraduate.",
    `Student: ${profile.join(" | ") || "no details given"}.`,
    "Tailor them to the student's interests and goals, and make sure they suit the student's year and major.",
    "Split them into research labs and project teams, internships or other programs.",
    `Return at most ${MAX_RESULTS_ASKED} items in total. Every item needs name, sub (person or host, optional), what (one sentence, including if applications are closed), and the official https URL.`,
    "Do not invent URLs. Prefer the organization's own site. Skip high-school-only programs.",
    `Do NOT include any of these, which the student already has (names or URLs): ${input.exclude.map(oneLine).join(" ; ")}`,
    'Return JSON only: {"research": [], "projects": []}.',
  ].join(" ");
}

export const FIND_MORE_MESSAGES = {
  error: "Couldn't find more right now.",
  empty: "No new opportunities found this time.",
  added: (n: number) => (n === 1 ? "Added 1 new opportunity." : `Added ${n} new opportunities.`),
} as const;

export type FindMoreOutcome<R, P> =
  | { status: "added"; research: R[]; projects: P[]; added: number; message: string }
  | { status: "empty" | "error"; message: string };

/**
 * Runs one "Find more" request. `ask` is the server call; it may throw or return null, which
 * both count as an error and leave the current lists untouched.
 */
export async function findMoreOutcome<R extends Named, P extends Named, I extends Named>(args: {
  current: { research: readonly R[]; projects: readonly P[] };
  /** Names and links of everything shown right now. */
  shown: readonly string[];
  profile: {
    interests?: readonly string[];
    goals?: readonly string[];
    year?: string;
    major?: string;
  };
  ask: (input: FindMoreInput) => Promise<{ research: I[]; projects: I[] } | null>;
  toResearch: (item: I) => R;
  toProject: (item: I) => P;
}): Promise<FindMoreOutcome<R, P>> {
  const { current, profile } = args;
  let found: { research: I[]; projects: I[] } | null;
  try {
    found = await args.ask({
      exclude: cleanList(args.shown, 2 * MAX_TOTAL + 20, 300),
      interests: cleanList(profile.interests, 12, 120),
      goals: cleanList(profile.goals, 12, 120),
      ...(profile.year?.trim() ? { year: profile.year.trim().slice(0, 40) } : {}),
      ...(profile.major?.trim() ? { major: profile.major.trim().slice(0, 80) } : {}),
    });
  } catch {
    return { status: "error", message: FIND_MORE_MESSAGES.error };
  }
  if (!found) return { status: "error", message: FIND_MORE_MESSAGES.error };
  const merged = mergeLists(current, {
    research: found.research.map(args.toResearch),
    projects: found.projects.map(args.toProject),
  });
  if (merged.added <= 0) return { status: "empty", message: FIND_MORE_MESSAGES.empty };
  return {
    status: "added",
    research: merged.research,
    projects: merged.projects,
    added: merged.added,
    message: FIND_MORE_MESSAGES.added(merged.added),
  };
}
