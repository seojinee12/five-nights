import { z } from "zod";
import { classifyTitle, clip } from "./calendar";
import type { CalEvent } from "./launchpad";

/** Pure helpers for model-read calendars: request shape, prompt, and validation of the reply. */

export const MAX_EVENTS = 200;
export const MAX_TEXT_CHARS = 80_000;
export const MAX_BASE64_CHARS = 10_000_000;

export const CalendarRequestSchema = z
  .object({
    name: z.string().max(255),
    mime: z.string().max(100).default(""),
    text: z.string().max(400_000).optional(),
    base64: z.string().max(MAX_BASE64_CHARS).optional(),
    /** Local date (YYYY-MM-DD) of the Monday that starts the week to import. */
    weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((value) => Boolean(value.text?.trim() || value.base64), { message: "Nothing to read" });

export type CalendarRequest = z.infer<typeof CalendarRequestSchema>;

const timeValue = z.union([z.number(), z.string()]);

const RawEventSchema = z
  .object({
    title: z.string().trim().min(1),
    kind: z.string().optional(),
    day: z.number().int().min(0).max(6).optional(),
    date: z.string().optional(),
    start: timeValue,
    end: timeValue.optional(),
  })
  .refine((value) => value.day !== undefined || value.date !== undefined, { message: "No day" });

/** "2026-03-02" as a local Date, or null when it is not a real calendar date. */
export function parseIsoDate(value: string): Date | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

export function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Hours from 9.5, "09:30", "9:30 pm" or "17:00:00"; null when unreadable. */
export function hoursFrom(value: number | string | undefined): number | null {
  if (typeof value === "number")
    return Number.isFinite(value) && value >= 0 && value <= 24 ? value : null;
  if (!value) return null;
  const match = value
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  if (minute > 59) return null;
  if (match[3]) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (match[3] === "pm" ? 12 : 0);
  }
  return hour > 24 || (hour === 24 && minute > 0) ? null : hour + minute / 60;
}

function dayIndex(
  raw: { day?: number | undefined; date?: string | undefined },
  weekMonday: Date,
): number | null {
  if (raw.date !== undefined) {
    const date = parseIsoDate(raw.date);
    if (!date) return null;
    const diff = Math.round(
      (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
        Date.UTC(weekMonday.getFullYear(), weekMonday.getMonth(), weekMonday.getDate())) /
        86_400_000,
    );
    return diff >= 0 && diff <= 6 ? diff : null;
  }
  return raw.day ?? null;
}

const KINDS: CalEvent["kind"][] = ["class", "task", "life"];

/**
 * Validates a model reply (an array, or {events: [...]}) into calendar events for the week.
 * Each item is checked on its own, so one bad item never drops the rest. Events outside the
 * week, with unreadable times, or too short to show are skipped; duplicates are merged.
 * Returns [] when nothing usable is found.
 */
export function eventsFromModel(raw: unknown, weekMonday: Date): CalEvent[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { events?: unknown }).events)
      ? (raw as { events: unknown[] }).events
      : [];
  const out: CalEvent[] = [];
  const seen = new Set<string>();
  for (const item of list.slice(0, MAX_EVENTS * 2)) {
    const parsed = RawEventSchema.safeParse(item);
    if (!parsed.success) continue;
    const { title: rawTitle, kind: rawKind, start: rawStart, end: rawEnd, ...when } = parsed.data;
    const day = dayIndex(when, weekMonday);
    const start = hoursFrom(rawStart);
    if (day === null || start === null) continue;
    let end = hoursFrom(rawEnd);
    if (end === null || end <= start) end = start + 1;
    const title = rawTitle.slice(0, 80);
    const kind =
      KINDS.find((candidate) => candidate === rawKind?.toLowerCase()) ?? classifyTitle(title);
    const event = clip(day, start, end, title, kind);
    if (!event) continue;
    const key = `${event.day}|${event.start}|${event.end}|${event.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(event);
    if (out.length >= MAX_EVENTS) break;
  }
  return out.sort((a, b) => a.day - b.day || a.start - b.start);
}

const KEEP =
  /^(BEGIN:VEVENT|END:VEVENT|SUMMARY|DTSTART|DTEND|DURATION|RRULE|EXDATE|RDATE|RECURRENCE-ID)[;:]?/i;

/** Drops everything but the lines that decide when an event happens, so big exports fit. */
export function slimIcs(text: string): string {
  const unfolded = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
  const kept = unfolded.split("\n").filter((line) => KEEP.test(line.trim()));
  return kept.join("\n").slice(0, MAX_TEXT_CHARS);
}

export function calendarPrompt(weekStart: string, hasText: boolean): string {
  return [
    `Read this ${hasText ? "calendar or schedule" : "calendar or schedule file"} and list every event that happens in the week starting Monday ${weekStart} through the following Sunday.`,
    "Times are in America/Los_Angeles; convert UTC times (ending in Z) to that zone. Expand recurring events (RRULE) onto the dates they fall on in that week, honoring EXDATE and UNTIL. Skip all-day events and events outside that week.",
    'Return JSON only: {"events": [{"title": string, "date": "YYYY-MM-DD", "start": "HH:MM", "end": "HH:MM", "kind": "class"|"task"|"life"}]}.',
    "Use 24-hour local times. kind is class for lectures, labs, discussions, and seminars; life for social, fitness, meals, and hobbies; task for everything else such as study, work, meetings, and interviews.",
    'If there are no events, return {"events": []}.',
  ].join(" ");
}
