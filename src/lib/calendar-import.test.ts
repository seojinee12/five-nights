import { describe, expect, it, vi } from "vitest";
import { importCalendar, type CalendarDeps } from "./calendar-import";
import type { CalEvent } from "./launchpad";

const MONDAY = new Date(2026, 2, 2);
const ICS = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "SUMMARY:ECE 15",
  "DTSTART;TZID=America/Los_Angeles:20260302T140000",
  "DTEND;TZID=America/Los_Angeles:20260302T145000",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\n");
const bytes = (text: string) => new TextEncoder().encode(text);
const plainEvent: CalEvent = { day: 0, start: 14, end: 14.83, title: "ECE 15", kind: "class" };
const modelEvent: CalEvent = { day: 1, start: 9, end: 10, title: "From model", kind: "task" };

function deps(ask: CalendarDeps["ask"], plain: CalendarDeps["plain"] = async () => [plainEvent]) {
  return { ask: vi.fn(ask), plain: vi.fn(plain) };
}

describe("importCalendar", () => {
  it("uses the model's events for an ics file and sends slimmed text and the week", async () => {
    const d = deps(async () => [modelEvent]);
    const result = await importCalendar(
      { name: "cal.ics", mime: "text/calendar", bytes: bytes(ICS) },
      d,
      MONDAY,
    );
    expect(result).toEqual({ events: [modelEvent], via: "model" });
    expect(d.plain).not.toHaveBeenCalled();
    const request = d.ask.mock.calls[0]?.[0];
    expect(request?.weekStart).toBe("2026-03-02");
    expect(request?.text).toContain("SUMMARY:ECE 15");
  });
  it("falls back to the plain parser when the model returns null (no key or failed call)", async () => {
    const d = deps(async () => null);
    const result = await importCalendar(
      { name: "cal.ics", mime: "", bytes: bytes(ICS) },
      d,
      MONDAY,
    );
    expect(result).toEqual({ events: [plainEvent], via: "parser" });
  });
  it("falls back when the model throws", async () => {
    const d = deps(async () => {
      throw new Error("network");
    });
    const result = await importCalendar(
      { name: "cal.ics", mime: "", bytes: bytes(ICS) },
      d,
      MONDAY,
    );
    expect(result.via).toBe("parser");
  });
  it("falls back when the model finds no events", async () => {
    const d = deps(async () => []);
    const result = await importCalendar(
      { name: "cal.ics", mime: "", bytes: bytes(ICS) },
      d,
      MONDAY,
    );
    expect(result).toEqual({ events: [plainEvent], via: "parser" });
  });
  it("reports none when both paths find nothing, or the parser throws", async () => {
    const empty = deps(
      async () => null,
      async () => [],
    );
    expect(
      await importCalendar({ name: "cal.ics", mime: "", bytes: bytes(ICS) }, empty, MONDAY),
    ).toEqual({ events: [], via: "none" });
    const broken = deps(
      async () => null,
      async () => {
        throw new Error("bad zip");
      },
    );
    expect(
      await importCalendar({ name: "cal.zip", mime: "", bytes: bytes(ICS) }, broken, MONDAY),
    ).toEqual({ events: [], via: "none" });
  });
  it("sends a screenshot to the model as base64 and has no plain fallback", async () => {
    const d = deps(async () => [modelEvent]);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const ok = await importCalendar(
      { name: "calendar-week.png", mime: "image/png", bytes: png },
      d,
      MONDAY,
    );
    expect(ok.via).toBe("model");
    expect(d.ask.mock.calls[0]?.[0]).toMatchObject({
      mime: "image/png",
      base64: btoa(String.fromCharCode(...png)),
    });
    expect(d.ask.mock.calls[0]?.[0].text).toBeUndefined();
    const down = deps(async () => null);
    expect(
      await importCalendar({ name: "week.png", mime: "image/png", bytes: png }, down, MONDAY),
    ).toEqual({ events: [], via: "none" });
    expect(down.plain).not.toHaveBeenCalled();
  });
  it("passes plain schedule text through unslimmed", async () => {
    const d = deps(async () => [modelEvent]);
    await importCalendar(
      { name: "week.txt", mime: "text/plain", bytes: bytes("Mon 9am Calculus\nTue 2pm Lab") },
      d,
      MONDAY,
    );
    expect(d.ask.mock.calls[0]?.[0].text).toBe("Mon 9am Calculus\nTue 2pm Lab");
  });
  it("does not call the model for an empty file", async () => {
    const d = deps(async () => [modelEvent]);
    expect(
      await importCalendar(
        { name: "empty.png", mime: "image/png", bytes: new Uint8Array() },
        d,
        MONDAY,
      ),
    ).toEqual({ events: [], via: "none" });
    expect(d.ask).not.toHaveBeenCalled();
  });
});
