/**
 * Opportunity ranking for the Opportunities tab.
 *
 * Scores each opportunity from 0 to 100 against what we know about the student, with a short
 * "why it fits" line. It runs locally with no API key, on live search results or the built-in
 * list. Live results often lack a type or tags, so both are inferred from the text we have.
 *
 * Points: topic match 40, year 20, kind of opportunity the goals ask for 15, major 15, beginner
 * fit 10. A major mismatch, a year outside the range, or closed applications scale the total down.
 */

export type OpportunityType =
  "research" | "project" | "internship" | "club" | "hackathon" | "scholarship" | "event";

export const TYPE_LABEL: Record<OpportunityType, string> = {
  research: "Research lab",
  project: "Project team",
  internship: "Internship",
  club: "Club",
  hackathon: "Hackathon",
  scholarship: "Scholarship",
  event: "Event",
};

const TYPE_NOUN: Record<OpportunityType, string> = {
  research: "research lab",
  project: "project team",
  internship: "internship",
  club: "club",
  hackathon: "hackathon",
  scholarship: "scholarship",
  event: "event",
};

/** One opportunity as it arrives from live search or the built-in list. Only the first three fields are needed. */
export interface SourcedOpportunity {
  name: string;
  what: string;
  url: string;
  /** Person or host, when known. */
  sub?: string | undefined;
  /** Set when the type is known. Otherwise it is inferred. */
  type?: OpportunityType;
  /** Which list it came from. Only a weak hint for type inference. */
  listHint?: OpportunityType;
  tags?: string[];
  /** Major keywords it suits. Empty or missing means any major. */
  majors?: string[];
  minYear?: number;
  maxYear?: number;
  beginnerFriendly?: boolean;
}

/** What we know about the student. Every field is optional. */
export interface OpportunityProfile {
  year?: string | undefined;
  major?: string | undefined;
  goals?: string[];
  interests?: string[];
  skills?: string[];
  /** Anything else that describes them: classes, current work, resume lines. */
  context?: string[];
}

export interface RankedOpportunity {
  name: string;
  sub: string;
  url: string;
  type: OpportunityType;
  typeLabel: string;
  score: number;
  why: string;
}

const TOPIC_POINTS = 40;
const YEAR_POINTS = 20;
const GOAL_TYPE_POINTS = 15;
const MAJOR_POINTS = 15;
const LEVEL_POINTS = 10;

/**
 * Plain-language copy for how the score works, shown in the Opportunities tab. Built from the
 * point constants above so the numbers shown to students can't drift from the ranking.
 */
export const SCORING_EXPLAINER = {
  short: "Out of 100, based on how well it fits your interests, goals, year and major.",
  intro: "Each opportunity gets a score from 0 to 100, highest first. The points add up:",
  factors: [
    {
      label: "Topic match",
      points: TOPIC_POINTS,
      text: "how well its topics match your interests, goals, skills, major and coursework.",
    },
    { label: "Year fit", points: YEAR_POINTS, text: "whether it suits your year." },
    {
      label: "Kind you want",
      points: GOAL_TYPE_POINTS,
      text: "whether its type (research, internship, project team...) is what your goals ask for.",
    },
    { label: "Major fit", points: MAJOR_POINTS, text: "whether it fits your major." },
    {
      label: "Beginner fit",
      points: LEVEL_POINTS,
      text: "early-year students score higher on beginner-friendly ones.",
    },
  ],
  reductions: {
    label: "Lowered by",
    text: "a major mismatch, a year outside its range, or closed applications.",
  },
} as const;

type Source = "interests" | "goals" | "skills" | "major" | "context";
const SOURCE_WEIGHT: Record<Source, number> = {
  interests: 1,
  goals: 1,
  skills: 0.5,
  major: 0.4,
  context: 0.3,
};

const STOPWORDS = new Set(["and", "of", "the", "a", "an", "to", "in", "for", "on", "with", "or"]);
const SUFFIXES = ["ics", "ing", "ers", "er", "ed", "es", "s"];

function stem(word: string): string {
  if (word.length > 4) {
    for (const suffix of SUFFIXES) {
      if (word.endsWith(suffix) && word.length - suffix.length >= 3) {
        return word.slice(0, -suffix.length);
      }
    }
  }
  return word;
}

function stems(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z0-9]+(?:\+\+|#)?/g) ?? [];
  return new Set(words.filter((w) => !STOPWORDS.has(w)).map(stem));
}

function hasPhrase(textStems: Set<string>, phrase: string): boolean {
  const parts = [...stems(phrase)];
  return parts.length > 0 && parts.every((p) => textStems.has(p));
}

// ---- Type inference -------------------------------------------------------------------------

const TYPE_WORDS: Record<OpportunityType, string[]> = {
  research: ["research", "laboratory", "lab", "professor", "faculty", "phd"],
  internship: ["internship", "intern", "co-op"],
  club: ["club", "student organization", "organization", "society", "chapter", "association"],
  project: ["project", "build", "team", "competition"],
  hackathon: ["hackathon", "hack"],
  scholarship: ["scholarship", "fellowship", "grant", "funding", "tuition"],
  event: ["event", "career fair", "workshop", "talk", "conference", "info session", "open house"],
};
const TYPES = Object.keys(TYPE_WORDS) as OpportunityType[];

function urlText(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")} ${u.pathname}`.replace(/[/_.-]+/g, " ");
  } catch {
    return "";
  }
}

/** Picks a type from the name and URL (strong), the description (weaker), and the list it came from. */
export function inferType(item: SourcedOpportunity): OpportunityType {
  if (item.type) return item.type;
  const fields: [Set<string>, number][] = [
    [stems(item.name), 3],
    [stems(urlText(item.url)), 3],
    [stems(item.sub ?? ""), 1],
    [stems(item.what), 1.5],
  ];
  let best: OpportunityType = item.listHint ?? "project";
  let bestScore = 0;
  for (const type of TYPES) {
    let score = type === item.listHint ? 1 : 0;
    for (const [set, weight] of fields) {
      score += weight * TYPE_WORDS[type].filter((w) => hasPhrase(set, w)).length;
    }
    if (score > bestScore) {
      best = type;
      bestScore = score;
    }
  }
  return best;
}

// ---- Tag, major, level inference ------------------------------------------------------------

const TOPIC_VOCAB = [
  "robotics",
  "embedded systems",
  "sensors",
  "hardware",
  "firmware",
  "circuits",
  "fpga",
  "controls",
  "wireless",
  "signal processing",
  "computer vision",
  "machine learning",
  "ai",
  "perception",
  "mapping",
  "autonomous systems",
  "field science",
  "wearable",
  "arduino",
  "c++",
  "python",
  "software",
  "web",
  "data",
  "high performance computing",
  "supercomputing",
  "algorithms",
  "surgical robots",
  "medical devices",
  "bioengineering",
  "biotech",
  "biology",
  "lab",
  "undergraduate research",
  "research",
  "internship",
  "industry",
  "scholarship",
  "funding",
  "hackathon",
  "networking",
  "teamwork",
  "projects",
];
const BIO_TAGS = ["medical devices", "bioengineering", "biotech", "biology", "surgical robots"];
const ECE_TAGS = [
  "robotics",
  "embedded systems",
  "firmware",
  "circuits",
  "fpga",
  "wireless",
  "signal processing",
  "controls",
  "sensors",
  "hardware",
];
const BIO_MAJORS = ["bioengineering", "biomedical", "biology", "bioe", "chemical"];
const ECE_MAJORS = ["electrical", "computer", "ece", "cse", "robotics"];

const BEGINNER_RE =
  /\b(beginners?|new students?|first[- ]year|freshm[ae]n|no experience|all majors|open to (all|new))\b/i;
const ADVANCED_RE = /\b(upper[- ]division|juniors? and seniors?|ph\.?d\.? students)\b/i;
const CLOSED_RE = /\b(closed|not (currently )?accepting|no longer accepting)\b/i;

/** Topic keywords found in the name, description, host and URL. */
export function inferTags(item: SourcedOpportunity): string[] {
  if (item.tags?.length) return item.tags;
  const text = stems(`${item.name} ${item.sub ?? ""} ${item.what} ${urlText(item.url)}`);
  return TOPIC_VOCAB.filter((tag) => hasPhrase(text, tag));
}

interface Facts {
  type: OpportunityType;
  tags: string[];
  majors: string[];
  majorsExplicit: boolean;
  minYear: number;
  maxYear: number;
  beginner: boolean;
  closed: boolean;
}

function factsFor(item: SourcedOpportunity): Facts {
  const type = inferType(item);
  const tags = inferTags(item);
  const text = `${item.name} ${item.sub ?? ""} ${item.what}`;
  const advanced = ADVANCED_RE.test(`${item.sub ?? ""} ${item.what}`);
  const bio = tags.some((t) => BIO_TAGS.includes(t));
  const ece = tags.some((t) => ECE_TAGS.includes(t));
  const inferred = bio && !ece ? BIO_MAJORS : ece && !bio ? ECE_MAJORS : [];
  const explicit = Boolean(item.majors?.length);
  const easyType = type !== "research" && type !== "internship";
  return {
    type,
    tags,
    majors: explicit ? (item.majors as string[]) : inferred,
    majorsExplicit: explicit,
    minYear: item.minYear ?? (advanced ? 3 : 1),
    maxYear: item.maxYear ?? 4,
    beginner: item.beginnerFriendly ?? (!advanced && (BEGINNER_RE.test(text) || easyType)),
    closed: CLOSED_RE.test(item.what),
  };
}

// ---- Scoring --------------------------------------------------------------------------------

/** Reads "First year", "sophomore", "3rd year" and similar as 1 to 4. Returns null when unknown. */
export function parseYear(text: string | undefined): number | null {
  const lowered = (text ?? "").toLowerCase();
  const words: [number, string[]][] = [
    [1, ["first", "freshman", "1st", "frosh"]],
    [2, ["second", "sophomore", "2nd"]],
    [3, ["third", "junior", "3rd"]],
    [4, ["fourth", "senior", "4th", "fifth"]],
  ];
  for (const [year, list] of words) {
    if (list.some((w) => new RegExp(`\\b${w}\\b`).test(lowered))) return year;
  }
  const digit = lowered.match(/\b([1-5])\b/);
  return digit ? Math.min(Number(digit[1]), 4) : null;
}

interface TopicMatch {
  weight: number;
  tag: string;
  source: Source;
}

function topicMatches(tags: string[], sources: Record<Source, Set<string>>): TopicMatch[] {
  const found: TopicMatch[] = [];
  for (const tag of tags) {
    const tagStems = [...stems(tag)];
    if (!tagStems.length) continue;
    let best: TopicMatch | null = null;
    for (const source of Object.keys(sources) as Source[]) {
      const share = tagStems.filter((s) => sources[source].has(s)).length / tagStems.length;
      const strength = share === 1 ? 1 : share >= 0.5 && tagStems.length > 1 ? 0.5 : 0;
      const weight = strength * SOURCE_WEIGHT[source];
      if (weight > (best?.weight ?? 0)) best = { weight, tag, source };
    }
    if (best) found.push(best);
  }
  return found.sort((a, b) => b.weight - a.weight);
}

function majorFit(facts: Facts, major: string): { fit: number; match: boolean } {
  const words = major.toLowerCase().match(/[a-z]+/g) ?? [];
  if (!words.length) return { fit: 0.6, match: false };
  if (!facts.majors.length) return { fit: 0.65, match: false };
  const match = facts.majors.some((k) => words.some((w) => w.startsWith(k)));
  return { fit: match ? 1 : 0, match };
}

function yearFit(facts: Facts, year: number | null): number {
  if (year === null) return 0.5;
  if (year >= facts.minYear && year <= facts.maxYear) return 1;
  const gap = year < facts.minYear ? facts.minYear - year : year - facts.maxYear;
  return gap === 1 ? 0.4 : 0;
}

function levelFit(facts: Facts, year: number | null): number {
  if (year === null) return 0.6;
  const early = year <= 2;
  if (facts.beginner) return early ? 1 : 0.6;
  return early ? 0.2 : 1;
}

function typeFit(
  type: OpportunityType,
  intent: Record<"goals" | "interests" | "context", Set<string>>,
): number {
  const all = [intent.goals, intent.interests, intent.context];
  if (!all.some((set) => set.size > 0)) return 0.4;
  const words = TYPE_WORDS[type];
  let best = 0;
  for (const source of ["goals", "interests", "context"] as const) {
    if (words.some((w) => hasPhrase(intent[source], w))) {
      best = Math.max(best, source === "context" ? 0.4 : 1);
    }
  }
  return best;
}

const YEAR_LABEL = ["", "first-years", "second-years", "third-years", "fourth-years"];

function whyLine(
  facts: Facts,
  matches: TopicMatch[],
  year: number | null,
  majorMatch: boolean,
  yFit: number,
  tFit: number,
): string {
  const parts: string[] = [];
  const grouped = new Map<Source, string[]>();
  // Matches on "context" (courses, tasks, resume) only affect the score. They are never cited, so
  // resume content cannot show up in the UI.
  for (const m of matches.filter((x) => x.source !== "context").slice(0, 3))
    grouped.set(m.source, [...(grouped.get(m.source) ?? []), m.tag]);
  const topics = [...grouped].map(([source, tags]) => `your ${source} (${tags.join(", ")})`);
  if (topics.length) parts.push(`Fits ${topics.slice(0, 2).join(" and ")}`);
  if (tFit >= 0.9) parts.push(`the kind of ${TYPE_NOUN[facts.type]} you are after`);
  const beginner = facts.beginner && (year === null || year <= 2) && yFit > 0;
  if (year !== null && yFit === 1) {
    parts.push(`open to ${YEAR_LABEL[year]}${beginner ? " and beginner-friendly" : ""}`);
  } else if (year !== null && yFit === 0.4) {
    parts.push("a stretch for your year");
  } else if (beginner) {
    parts.push("beginner-friendly");
  }
  if (majorMatch && parts.length < 3) parts.push("suits your major");
  if (facts.closed) parts.push("applications look closed for now");
  if (!parts.length) return "A general campus opportunity worth a look.";
  const line = parts.join("; ");
  return `${line.charAt(0).toUpperCase()}${line.slice(1)}.`;
}

export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/** Scores and sorts opportunities for a student, highest first. Duplicates (same name or URL) keep the best score. */
export function rankOpportunities(
  items: SourcedOpportunity[],
  profile: OpportunityProfile = {},
): RankedOpportunity[] {
  const join = (list?: string[]) => (list ?? []).join(" ");
  const sources: Record<Source, Set<string>> = {
    interests: stems(join(profile.interests)),
    goals: stems(join(profile.goals)),
    skills: stems(join(profile.skills)),
    major: stems(profile.major ?? ""),
    context: stems(join(profile.context)),
  };
  const intent = { goals: sources.goals, interests: sources.interests, context: sources.context };
  const year = parseYear(profile.year);
  const major = profile.major ?? "";

  const scored = items
    .filter((item) => item && item.name && item.url)
    .map((item, index) => {
      const facts = factsFor(item);
      const matches = topicMatches(facts.tags, sources);
      const topic = 1 - Math.exp(-matches.reduce((sum, m) => sum + m.weight, 0) / 2.5);
      const { fit: mFit, match } = majorFit(facts, major);
      const yFit = yearFit(facts, year);
      const tFit = typeFit(facts.type, intent);
      let total =
        TOPIC_POINTS * topic +
        YEAR_POINTS * yFit +
        GOAL_TYPE_POINTS * tFit +
        MAJOR_POINTS * mFit +
        LEVEL_POINTS * levelFit(facts, year);
      if (facts.majors.length && major.trim() && !match) total *= facts.majorsExplicit ? 0.6 : 0.85;
      if (yFit === 0) total *= 0.7;
      if (facts.closed) total *= 0.8;
      const ranked: RankedOpportunity = {
        name: item.name,
        sub: item.sub ?? "",
        url: item.url,
        type: facts.type,
        typeLabel: TYPE_LABEL[facts.type],
        score: Math.round(Math.max(0, Math.min(100, total))),
        why: whyLine(facts, matches, year, match, yFit, tFit),
      };
      return { ranked, index };
    })
    .sort((a, b) => b.ranked.score - a.ranked.score || a.index - b.index);

  const seenNames = new Set<string>();
  const seenUrls = new Set<string>();
  const out: RankedOpportunity[] = [];
  for (const { ranked } of scored) {
    const nameKey = normalizeName(ranked.name);
    const urlKey = normalizeUrl(ranked.url);
    if (seenNames.has(nameKey) || seenUrls.has(urlKey)) continue;
    seenNames.add(nameKey);
    seenUrls.add(urlKey);
    out.push(ranked);
  }
  return out;
}

/** Ranks the research and project lists together. The list each item came from is only a hint for its type. */
export function rankSourced(
  lists: { research: SourcedOpportunity[]; projects: SourcedOpportunity[] },
  profile: OpportunityProfile = {},
): RankedOpportunity[] {
  const research = lists.research.map((item) => ({
    ...item,
    listHint: item.listHint ?? ("research" as const),
  }));
  const projects = lists.projects.map((item) => ({
    ...item,
    listHint: item.listHint ?? ("project" as const),
  }));
  return rankOpportunities([...research, ...projects], profile);
}

// ---- Student → profile ----------------------------------------------------------------------

interface ResumeEntryLike {
  title: string;
  org?: string;
  bullets?: string[];
}

/**
 * The parts of a student record the ranker reads. Matches the Student type in launchpad.ts; the
 * demo fields (interests, skills, goals, preferences, resume) are optional and may be absent.
 */
export interface StudentLike {
  id?: string;
  major?: string | undefined;
  year?: string | undefined;
  courses?: { name: string }[];
  tasks?: { title: string; category: string }[];
  longTerm?: { text: string }[];
  interests?: string[];
  skills?: string[];
  goals?: { title: string }[];
  preferences?: { opportunityTypes?: string[] };
  resume?: {
    coursework?: string[];
    skills?: string[];
    projects?: ResumeEntryLike[];
    activities?: ResumeEntryLike[];
  };
}

function entries(list: ResumeEntryLike[] | undefined): string[] {
  return (list ?? []).flatMap((e) => [e.title, e.org ?? "", ...(e.bullets ?? [])]);
}

/**
 * Builds the ranking profile from a student. The custom "me" student starts blank (major and
 * focus only), and the personal profile fields (interests, skills, goals, preferences, resume)
 * are still ignored for "me", so nothing but the major, courses, tasks and reminders is ranked on.
 */
export function profileFromStudent(s: StudentLike): OpportunityProfile {
  const own = s.id !== "me";
  const tasks = s.tasks ?? [];
  const wanted = own
    ? (s.preferences?.opportunityTypes ?? []).map((t) => t.replace(/-/g, " "))
    : [];
  const resume = own ? s.resume : undefined;
  return {
    year: s.year,
    major: s.major,
    goals: [
      ...(s.longTerm ?? []).map((r) => r.text),
      ...(own ? (s.goals ?? []).map((g) => g.title) : []),
      ...wanted,
      ...tasks.filter((t) => t.category === "career").map((t) => t.title),
    ],
    interests: [
      ...(own ? (s.interests ?? []) : []),
      ...tasks.filter((t) => t.category === "project").map((t) => t.title),
    ],
    skills: own ? (s.skills ?? []) : [],
    context: [
      ...(resume?.skills ?? []),
      ...(s.courses ?? []).map((c) => c.name),
      ...tasks.map((t) => t.title),
      ...(resume?.coursework ?? []),
      ...entries(resume?.projects),
      ...entries(resume?.activities),
    ],
  };
}
