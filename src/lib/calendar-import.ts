import { calendarTexts, mondayOf, parseCalendar } from "./calendar";
import { isoDate, slimIcs, type CalendarRequest } from "./calendar-gemini";
import type { CalEvent } from "./launchpad";

/**
 * Calendar upload flow. A calendar file (.ics, a zip of them, or pasted text) goes to the model
 * first; a screenshot or PDF can only go to the model. If the model path gives nothing (no key,
 * network failure, bad reply, no events) the plain parser reads calendar files instead.
 */

export type CalendarSource = { name: string; mime: string; bytes: Uint8Array };
export type CalendarImport = { events: CalEvent[]; via: "model" | "parser" | "none" };

export type CalendarDeps = {
  /** Resolves to validated events, or null when the model could not be used. */
  ask: (request: CalendarRequest) => Promise<CalEvent[] | null>;
  plain: (bytes: Uint8Array, name: string, weekMonday: Date) => Promise<CalEvent[]>;
};

const CALENDAR_NAME = /\.(ics|zip)$/i;
const CALENDAR_MIME = /^text\/calendar|zip/i;
const TEXT_FILE = /\.(txt|md|csv)$|^text\//i;

function isCalendarFile(source: CalendarSource): boolean {
  const bytes = source.bytes;
  const zipped = bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  return zipped || CALENDAR_NAME.test(source.name) || CALENDAR_MIME.test(source.mime);
}

export async function importCalendar(
  source: CalendarSource,
  deps: CalendarDeps,
  weekMonday = mondayOf(new Date()),
): Promise<CalendarImport> {
  const weekStart = isoDate(weekMonday);
  const calendar = isCalendarFile(source);
  const readable = calendar || TEXT_FILE.test(source.name) || TEXT_FILE.test(source.mime);
  let request: CalendarRequest | null = null;
  try {
    if (readable) {
      const texts = calendar
        ? await calendarTexts(source.bytes, source.name)
        : [new TextDecoder().decode(source.bytes)];
      const text = calendar ? slimIcs(texts.join("\n")) : texts.join("\n");
      if (text.trim()) request = { name: source.name, mime: source.mime, text, weekStart };
    } else if (source.bytes.length) {
      request = {
        name: source.name,
        mime: source.mime || "application/octet-stream",
        base64: toBase64(source.bytes),
        weekStart,
      };
    }
  } catch {
    request = null;
  }
  if (request) {
    try {
      const events = await deps.ask(request);
      if (events?.length) return { events, via: "model" };
    } catch {
      // fall through to the plain parser
    }
  }
  if (calendar) {
    try {
      const events = await deps.plain(source.bytes, source.name, weekMonday);
      return { events, via: events.length ? "parser" : "none" };
    } catch {
      return { events: [], via: "none" };
    }
  }
  return { events: [], via: "none" };
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Browser entry point: the real server call plus the plain parser. */
export async function importCalendarFile(file: File): Promise<CalEvent[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { parseCalendarWithGemini } = await import("./mentor.functions");
  const result = await importCalendar(
    { name: file.name, mime: file.type, bytes },
    {
      ask: async (request) => (await parseCalendarWithGemini({ data: request })).events,
      plain: parseCalendar,
    },
  );
  return result.events;
}
