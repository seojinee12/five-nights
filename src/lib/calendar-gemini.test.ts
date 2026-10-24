import { describe, expect, it } from "vitest";
import {
  CalendarRequestSchema,
  eventsFromModel,
  hoursFrom,
  isoDate,
  parseIsoDate,
  slimIcs,
} from "./calendar-gemini";

const MONDAY = new Date(2026, 2, 2); // Mon 2026-03-02

describe("hoursFrom", () => {
  it("reads numbers, 24h and 12h strings", () => {
    expect(hoursFrom(9.5)).toBe(9.5);
    expect(hoursFrom("09:30")).toBe(9.5);
    expect(hoursFrom("17:00:00")).toBe(17);
    expect(hoursFrom("9:30 pm")).toBe(21.5);
    expect(hoursFrom("12am")).toBe(0);
    expect(hoursFrom("12 pm")).toBe(12);
  });
  it("rejects nonsense", () => {
    for (const bad of ["", "noon", "25:00", "10:75", "13pm", -1, 30, Number.NaN, undefined])
      expect(hoursFrom(bad as string)).toBeNull();
  });
});

describe("dates", () => {
  it("round-trips local dates and rejects impossible ones", () => {
    expect(isoDate(MONDAY)).toBe("2026-03-02");
    expect(parseIsoDate("2026-03-02")?.getDate()).toBe(2);
    expect(parseIsoDate("2026-02-30")).toBeNull();
    expect(parseIsoDate("March 2")).toBeNull();
  });
});

describe("eventsFromModel", () => {
  it("accepts {events: []} with dates, maps them onto the week, and sorts", () => {
    const events = eventsFromModel(
      {
        events: [
          { title: "ECE 15", date: "2026-03-04", start: "14:00", end: "14:50", kind: "class" },
          { title: "Office hours", date: "2026-03-02", start: "09:00", end: "10:00", kind: "task" },
        ],
      },
      MONDAY,
    );
    expect(events).toEqual([
      { day: 0, start: 9, end: 10, title: "Office hours", kind: "task" },
      { day: 2, start: 14, end: 14.83, title: "ECE 15", kind: "class" },
    ]);
  });
  it("accepts a bare array and the day index form", () => {
    const events = eventsFromModel(
      [{ title: "Gym", day: 4, start: 7, end: 8, kind: "life" }],
      MONDAY,
    );
    expect(events).toEqual([{ day: 4, start: 7, end: 8, title: "Gym", kind: "life" }]);
  });
  it("skips dates outside the week and unreadable items but keeps the good ones", () => {
    const events = eventsFromModel(
      [
        { title: "last week", date: "2026-03-01", start: "10:00", end: "11:00" },
        { title: "next week", date: "2026-03-09", start: "10:00", end: "11:00" },
        { title: "bad time", date: "2026-03-03", start: "soon", end: "11:00" },
        { title: "no day", start: "10:00", end: "11:00" },
        { title: "", date: "2026-03-03", start: "10:00", end: "11:00" },
        "not an object",
        null,
        { title: "ok", date: "2026-03-08", start: "10:00", end: "11:00" },
      ],
      MONDAY,
    );
    expect(events.map((e) => [e.title, e.day])).toEqual([["ok", 6]]);
  });
  it("guesses the kind when it is missing or invalid", () => {
    const events = eventsFromModel(
      [
        { title: "MATH 20C", date: "2026-03-02", start: "09:00", end: "09:50" },
        { title: "Dinner", date: "2026-03-02", start: "18:00", end: "19:00", kind: "party" },
        { title: "Sync", date: "2026-03-02", start: "11:00", end: "11:30", kind: "TASK" },
      ],
      MONDAY,
    );
    expect(events.map((e) => e.kind)).toEqual(["class", "task", "life"]);
  });
  it("gives a missing or backwards end one hour and clips to the visible day", () => {
    const events = eventsFromModel(
      [
        { title: "no end", date: "2026-03-02", start: "10:00" },
        { title: "backwards", date: "2026-03-02", start: "12:00", end: "11:00" },
        { title: "late", date: "2026-03-02", start: "22:00", end: "23:59" },
        { title: "too early", date: "2026-03-02", start: "03:00", end: "05:00" },
      ],
      MONDAY,
    );
    expect(events.map((e) => [e.title, e.start, e.end])).toEqual([
      ["no end", 10, 11],
      ["backwards", 12, 13],
      ["late", 22, 23],
    ]);
  });
  it("drops duplicates", () => {
    const item = { title: "ECE 15", date: "2026-03-02", start: "14:00", end: "14:50" };
    expect(eventsFromModel([item, { ...item }], MONDAY)).toHaveLength(1);
  });
  it("returns [] for anything that is not a list of events", () => {
    for (const raw of [null, undefined, "text", 5, {}, { events: "x" }, { items: [] }])
      expect(eventsFromModel(raw, MONDAY)).toEqual([]);
  });
  it("caps very long replies", () => {
    const many = Array.from({ length: 500 }, (_, i) => ({
      title: `e${i}`,
      date: "2026-03-02",
      start: "09:00",
      end: "10:00",
    }));
    expect(eventsFromModel(many, MONDAY)).toHaveLength(200);
  });
});

describe("slimIcs", () => {
  it("keeps timing lines and drops descriptions, attendees, and other noise", () => {
    const slim = slimIcs(
      [
        "BEGIN:VCALENDAR",
        "X-WR-CALNAME:Private",
        "BEGIN:VEVENT",
        "SUMMARY:ECE 15",
        "DESCRIPTION:Zoom link and",
        " secret notes",
        "ATTENDEE:mailto:a@b.c",
        "DTSTART;TZID=America/Los_Angeles:20260302T140000",
        "DTEND;TZID=America/Los_Angeles:20260302T145000",
        "RRULE:FREQ=WEEKLY",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
    );
    expect(slim.split("\n")).toEqual([
      "BEGIN:VEVENT",
      "SUMMARY:ECE 15",
      "DTSTART;TZID=America/Los_Angeles:20260302T140000",
      "DTEND;TZID=America/Los_Angeles:20260302T145000",
      "RRULE:FREQ=WEEKLY",
      "END:VEVENT",
    ]);
  });
});

describe("CalendarRequestSchema", () => {
  const base = { name: "cal.ics", mime: "text/calendar", weekStart: "2026-03-02" };
  it("needs content and a valid week", () => {
    expect(CalendarRequestSchema.safeParse({ ...base, text: "BEGIN:VEVENT" }).success).toBe(true);
    expect(CalendarRequestSchema.safeParse({ ...base, base64: "AAAA" }).success).toBe(true);
    expect(CalendarRequestSchema.safeParse(base).success).toBe(false);
    expect(CalendarRequestSchema.safeParse({ ...base, text: "   " }).success).toBe(false);
    expect(
      CalendarRequestSchema.safeParse({ ...base, text: "x", weekStart: "tomorrow" }).success,
    ).toBe(false);
  });
});
