import type { CalEvent } from "./launchpad";

const WEEKDAY: Record<string, number> = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };
const CLASS_RE = /\b(ECE|MATH|PHYS|CHEM|CSE|MAE|BENG|SE|COGS)\s*\d|\b(lecture|discussion|seminar)\b|\blab\b/i;
const LIFE_RE = /\b(gym|dance|basketball|date|dinner|piano|game)\b/i;

export function mondayOf(date: Date): Date {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = local.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  local.setDate(local.getDate() + offset);
  return local;
}

/** The calendar text(s) inside an uploaded file: one per .ics in a zip, or the file itself. */
export async function calendarTexts(bytes: Uint8Array, filename: string): Promise<string[]> {
  return filename.toLowerCase().endsWith(".zip") || isZip(bytes) ? icsTextsFromZip(bytes) : [new TextDecoder().decode(bytes)];
}

export async function parseCalendar(bytes: Uint8Array, filename: string, weekMonday = mondayOf(new Date())): Promise<CalEvent[]> {
  const texts = await calendarTexts(bytes, filename);
  const events: CalEvent[] = [];
  const seen = new Set<string>();
  for (const text of texts) {
    for (const event of eventsFromIcs(text, weekMonday)) {
      const key = `${event.day}|${event.start}|${event.end}|${event.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push(event);
    }
  }
  return events.sort((a, b) => a.day - b.day || a.start - b.start);
}

function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

async function icsTextsFromZip(bytes: Uint8Array): Promise<string[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const texts: string[] = [];
  let i = 0;
  while (i + 30 <= bytes.length && view.getUint32(i, true) === 0x04034b50) {
    const method = view.getUint16(i + 8, true);
    const compSize = view.getUint32(i + 18, true);
    const nameLen = view.getUint16(i + 26, true);
    const extraLen = view.getUint16(i + 28, true);
    const nameStart = i + 30;
    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLen));
    const dataStart = nameStart + nameLen + extraLen;
    if (compSize === 0 || dataStart + compSize > bytes.length) break;
    const slice = bytes.subarray(dataStart, dataStart + compSize);
    let data = slice;
    if (method === 8) data = await inflateRaw(slice);
    else if (method !== 0) {
      i = dataStart + compSize;
      continue;
    }
    if (name.toLowerCase().endsWith(".ics")) texts.push(new TextDecoder().decode(data));
    i = dataStart + compSize;
  }
  return texts;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const copy = new ArrayBuffer(data.byteLength);
  new Uint8Array(copy).set(data);
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(copy));
      controller.close();
    },
  });
  const stream = source.pipeThrough(new DecompressionStream("deflate-raw") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function eventsFromIcs(text: string, weekMonday: Date): CalEvent[] {
  const unfolded = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
  const blocks = unfolded.split("BEGIN:VEVENT").slice(1).map((block) => block.split("END:VEVENT")[0] ?? "");
  const weekEnd = new Date(weekMonday);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const out: CalEvent[] = [];
  for (const block of blocks) {
    const fields = props(block);
    const start = stamp(fields.get("DTSTART"));
    const end = stamp(fields.get("DTEND"));
    if (!start || !end || start.allDay || end.allDay) continue;
    const title = (fields.get("SUMMARY") || "Busy").replace(/\\n/g, " ").replace(/\\,/g, ",").trim();
    const kind = classifyTitle(title);
    const span = end.ms - start.ms;
    const hours = span > 0 ? span / 3_600_000 : 1;
    const rule = fields.get("RRULE") || "";
    const until = untilDate(rule);
    if (until && until < weekMonday) continue;
    if (/FREQ=WEEKLY/i.test(rule)) {
      if (start.ms > weekEnd.getTime()) continue;
      const days = byDay(rule, start.weekday);
      for (const day of days) {
        const event = clip(day, start.hours, start.hours + hours, title, kind);
        if (event) out.push(event);
      }
    } else if (start.ms >= weekMonday.getTime() && start.ms < weekEnd.getTime()) {
      const event = clip(start.weekday, start.hours, start.hours + hours, title, kind);
      if (event) out.push(event);
    }
  }
  return out.filter((event): event is CalEvent => event !== null);
}

/** Best-guess event kind from its title. */
export function classifyTitle(title: string): CalEvent["kind"] {
  return CLASS_RE.test(title) ? "class" : LIFE_RE.test(title) ? "life" : "task";
}

/**
 * Clamp an event to the calendar day (0–24h); null when too short or on an invalid day.
 * Imports are not clipped to the student's day window: the grid and the time math clip, so a
 * later change of window shows or hides events without re-importing.
 */
export function clip(day: number, start: number, end: number, title: string, kind: CalEvent["kind"]): CalEvent | null {
  const a = Math.max(0, start);
  const b = Math.min(24, end);
  if (b - a < 0.15 || day < 0 || day > 6) return null;
  return { day, start: round2(a), end: round2(b), title, kind };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function props(block: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of block.split("\n")) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const rawKey = line.slice(0, idx);
    const key = (rawKey.split(";")[0] ?? "").toUpperCase();
    if (!key) continue;
    out.set(key, line.slice(idx + 1).trim());
  }
  return out;
}

type Stamp = { ms: number; hours: number; weekday: number; allDay: boolean };

function stamp(value: string | undefined): Stamp | null {
  if (!value) return null;
  if (/^\d{8}$/.test(value)) return { ms: 0, hours: 0, weekday: 0, allDay: true };
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (match[7] === "Z") return fromUtc(year, month, date, hour, minute);
  const local = new Date(year, month - 1, date, hour, minute);
  return { ms: local.getTime(), hours: hour + minute / 60, weekday: jsWeekday(local.getDay()), allDay: false };
}

function fromUtc(year: number, month: number, date: number, hour: number, minute: number): Stamp {
  const utc = new Date(Date.UTC(year, month - 1, date, hour, minute));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(utc);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday"));
  let h = Number(get("hour"));
  if (h === 24) h = 0;
  const m = Number(get("minute"));
  return { ms: utc.getTime(), hours: h + m / 60, weekday, allDay: false };
}

function jsWeekday(day: number): number {
  return day === 0 ? 6 : day - 1;
}

function byDay(rule: string, fallback: number): number[] {
  const match = rule.match(/BYDAY=([A-Z,]+)/i);
  if (!match?.[1]) return [fallback];
  const days = match[1].split(",").map((token) => WEEKDAY[token.slice(-2).toUpperCase()]).filter((day) => day !== undefined);
  return days.length ? days : [fallback];
}

function untilDate(rule: string): Date | null {
  const match = rule.match(/UNTIL=(\d{8})/);
  if (!match?.[1]) return null;
  const raw = match[1];
  return new Date(Number(raw.slice(0, 4)), Number(raw.slice(4, 6)) - 1, Number(raw.slice(6, 8)));
}
