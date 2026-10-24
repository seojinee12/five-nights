import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { calendarPrompt, eventsFromModel, parseIsoDate, type CalendarRequest } from "./calendar-gemini";
import type { CalEvent } from "./launchpad";
import { sanitizePatch, type Patch } from "./patch";
import { classifyPatch, type PatchSize } from "./patchSize";

export type Turn = { reply: string; patch: Patch | null; size?: PatchSize };
export type Opportunity = { name: string; sub?: string; what: string; url: string };
export type OpportunityLists = { research: Opportunity[]; projects: Opportunity[] };

type ChatBody = {
  model: "Gemini" | "Grok";
  message: string;
  student: object;
};

type MaterialBody = { name: string; mime: string; base64?: string; text?: string; studentName: string; major: string };

const MODEL = "gemini-3.8-flash";

function envValue(name: string): string {
  if (process.env[name]) return process.env[name] as string;
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx < 0) continue;
      const key = trimmed.slice(0, idx).trim();
      if (key !== name) continue;
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      return value;
    }
  } catch {
    return "";
  }
  return "";
}

export async function chatWithMentor(body: ChatBody): Promise<Turn> {
  const prompt = [
    "You are the LaunchPad mentor. The student maximizes productivity. Academia and career come before projects and personal life unless they set an explicit priority.",
    "Free time can hold work. The ten minutes between classes is pseudo-free transition time and must stay empty. A short gap that is not a transition is still free.",
    "Timed work becomes addEvents (day 0=Mon, start/end as hours, kind class|task|life). Untimed work such as the gym becomes addTasks with timed false.",
    "Weekly hour totals such as 'study 20 hours outside class' belong in weeklyTargets, not on the clock.",
    "If they say they are behind, set status to behind. If they are ahead, set status to ahead. Do not invent an hour tracker.",
    "Long-term monthly or yearly reminders go in longTermAdd only.",
    "Return JSON only: {\"reply\": string, \"patch\": object|null}. patch may include status, statusNote, addEvents, addTasks, courses, longTermAdd, weeklyTargets.",
    "A small, specific change (exactly one task, one yearly goal or reminder, one weekly hour target, or one single calendar event that does not overlap any existing event) is applied immediately: the reply just says what you added and must not ask for confirmation.",
    "Anything bigger (several items, more than one event, an event that overlaps an existing one, moving or removing events, status changes, courses) is not applied until they say yes, so the reply describes it and asks them to say yes. If nothing should change, patch is null.",
    `Student: ${JSON.stringify(body.student)}`,
    `They said: ${body.message}`,
  ].join("\n");
  const events = existingEventsOf(body.student);
  if (body.model === "Grok") return grok(prompt, events);
  return geminiTurnParts([{ text: prompt }], true, events);
}

export async function readMaterial(body: MaterialBody): Promise<Turn> {
  const instruction = [
    `Read this file (${body.name}) for ${body.studentName}, ${body.major}.`,
    "Pull courses, deadlines, and weekly hour totals into a LaunchPad patch.",
    "Return JSON only: {\"reply\": string, \"patch\": object|null}.",
    "courses items are {code, name, units, grade?}. Deadlines are addTasks. A weekly study total is a weeklyTargets item.",
    "The reply lists what you found and asks them to say yes before anything is applied.",
  ].join(" ");
  const parts: Record<string, unknown>[] = [];
  if (body.base64) parts.push({ inlineData: { mimeType: body.mime || "application/pdf", data: body.base64 } });
  parts.push({ text: body.text ? `${instruction}\n\n${body.text.slice(0, 20000)}` : instruction });
  return geminiTurnParts(parts, false);
}

/**
 * Reads a calendar (ics text, schedule text, or a screenshot/PDF) with Gemini and returns
 * validated events for the week, or null when it cannot be used (no key, failed call, bad reply).
 */
export async function calendarEventsFromGemini(body: CalendarRequest): Promise<CalEvent[] | null> {
  const weekMonday = parseIsoDate(body.weekStart);
  if (!weekMonday) return null;
  const parts: Record<string, unknown>[] = [{ text: calendarPrompt(body.weekStart, Boolean(body.text)) }];
  if (body.base64) parts.push({ inlineData: { mimeType: body.mime || "application/pdf", data: body.base64 } });
  if (body.text) parts.push({ text: body.text });
  const result = await geminiText(parts, false);
  if (!result.text) return null;
  const parsed = jsonFrom(result.text);
  if (parsed === null) return null;
  return eventsFromModel(parsed, weekMonday);
}

export async function loadOpportunities(): Promise<OpportunityLists | null> {
  const prompt = [
    "Use Google Search. List real, current opportunities for a UC San Diego electrical engineering freshman.",
    "Split them into research labs and beginner-friendly project teams.",
    "Every item needs name, sub (person or host, optional), what (one sentence, including if applications are closed), and the official https URL.",
    "Do not invent URLs. Prefer the organization's own site. Skip high-school-only programs.",
    "Return JSON only: {\"research\": [], \"projects\": []}.",
  ].join(" ");
  const result = await geminiText([{ text: prompt }], true);
  const parsed = jsonFrom(result.text);
  const lists = listsFrom(parsed);
  if (!lists || lists.research.length < 2 || lists.projects.length < 2) return null;
  return lists;
}

async function geminiTurnParts(parts: Record<string, unknown>[], allowSmall: boolean, events?: unknown[]): Promise<Turn> {
  const result = await geminiText(parts, false);
  if (!result.text) {
    const reply = result.limited
      ? "Gemini is rate-limited right now. Nothing was changed."
      : "Gemini could not finish that. Nothing was changed.";
    return { reply, patch: null };
  }
  const parsed = jsonFrom(result.text) as { reply?: unknown; patch?: unknown } | null;
  const reply = typeof parsed?.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : result.text.trim();
  return turnOf(reply, parsed?.patch, allowSmall, events);
}

async function geminiText(parts: Record<string, unknown>[], search: boolean): Promise<{ text: string; limited: boolean }> {
  const key = envValue("GEMINI_API_KEY");
  if (!key) return { text: "", limited: false };
  const tools = search ? [[{ google_search: {} }], [{ googleSearch: {} }]] : [[]];
  let limited = false;
  for (const tool of tools) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const body: { contents: unknown; tools?: unknown; generationConfig?: { responseMimeType: string } } = { contents: [{ role: "user", parts }] };
      if (tool.length) body.tools = tool;
      if (!search) body.generationConfig = { responseMimeType: "application/json" };
      let response: Response;
      try {
        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch {
        return { text: "", limited };
      }
      if (response.status === 429 && attempt === 0) {
        limited = true;
        await response.text();
        await new Promise((resolve) => setTimeout(resolve, 1500));
        continue;
      }
      if (!response.ok) {
        if (response.status === 429) limited = true;
        await response.text();
        break;
      }
      const payload = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n") ?? "";
      if (text.trim()) return { text, limited: false };
      break;
    }
  }
  return { text: "", limited };
}

async function grok(prompt: string, events?: unknown[]): Promise<Turn> {
  const key = envValue("XAI_API_KEY");
  if (!key) return { reply: "Grok is in practice mode until an xAI key is set. Nothing was changed.", patch: null };
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "grok-4.7",
      temperature: 0.3,
      reasoning_effort: "low",
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    if (response.status === 401 || /api key/i.test(detail)) {
      return { reply: "Grok is in practice mode until a valid xAI key is set. Nothing was changed.", patch: null };
    }
    return { reply: "Grok could not finish that. Nothing was changed.", patch: null };
  }
  const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
  const text = payload.choices?.[0]?.message?.content ?? "";
  const parsed = jsonFrom(text) as { reply?: unknown; patch?: unknown } | null;
  const reply = typeof parsed?.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : "Grok could not finish that. Nothing was changed.";
  return turnOf(reply, parsed?.patch, true, events);
}

/**
 * The client sends its current events with the chat request. The server uses them
 * for the "does the new event overlap?" check; missing events mean no event can be
 * small. The client re-checks against its live events before applying.
 */
function existingEventsOf(student: object): unknown[] | undefined {
  const events = (student as { events?: unknown }).events;
  return Array.isArray(events) ? events : undefined;
}

function turnOf(reply: string, rawPatch: unknown, allowSmall: boolean, events?: unknown[]): Turn {
  const patch = sanitizePatch(rawPatch);
  const size = patch && allowSmall ? classifyPatch(rawPatch, events) : "big";
  return { reply: size === "small" ? reply : withAsk(reply, patch), patch, size };
}

function withAsk(reply: string, patch: Patch | null): string {
  if (!patch) return reply;
  if (/\byes\b/i.test(reply)) return reply;
  return `${reply}\n\nSay yes to apply this, or no to leave the week as it is.`;
}

function jsonFrom(text: string): unknown {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function listsFrom(value: unknown): OpportunityLists | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { research?: unknown; projects?: unknown };
  const research = itemsOf(raw.research);
  const projects = itemsOf(raw.projects);
  if (!research.length && !projects.length) return null;
  return { research, projects };
}

function itemsOf(value: unknown): Opportunity[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const name = textField(row, "name");
    const what = textField(row, "what");
    const url = textField(row, "url");
    const sub = textField(row, "sub");
    if (!name || !what || !officialUrl(url)) return [];
    const next: Opportunity = { name: name.slice(0, 80), what: what.slice(0, 280), url };
    if (sub) next.sub = sub.slice(0, 80);
    return [next];
  });
}

function textField(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value.trim() : "";
}

function officialUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (!url.startsWith("https://")) return false;
    if (host.includes("google.") || host.includes("vertexaisearch") || host === "example.com") return false;
    return true;
  } catch {
    return false;
  }
}
