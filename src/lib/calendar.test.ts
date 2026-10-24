import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { mondayOf, parseCalendar } from "./calendar";

const ICS = `BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:ECE 15
DTSTART;TZID=America/Los_Angeles:20260302T140000
DTEND;TZID=America/Los_Angeles:20260302T145000
RRULE:FREQ=WEEKLY;BYDAY=MO,WE
END:VEVENT
BEGIN:VEVENT
SUMMARY:Office hours
DTSTART:20260302T170000Z
DTEND:20260302T180000Z
END:VEVENT
END:VCALENDAR
`;

describe("calendar import", () => {
  const week = mondayOf(new Date(2026, 2, 4));

  it("expands a weekly class and keeps a one-off in that week", async () => {
    const events = await parseCalendar(new TextEncoder().encode(ICS), "cal.ics", week);
    expect(events.filter((event) => event.title === "ECE 15").map((event) => event.day).sort()).toEqual([0, 2]);
    expect(events.find((event) => event.title === "ECE 15")?.kind).toBe("class");
    const hours = events.find((event) => event.title === "Office hours");
    expect(hours?.day).toBe(0);
    expect(hours?.start).toBe(9);
    expect(hours?.end).toBe(10);
  });

  it("reads an ics file inside a zip", async () => {
    const events = await parseCalendar(zipStore("calendar.ics", ICS), "takeout.zip", week);
    expect(events.some((event) => event.title === "ECE 15")).toBe(true);
  });

  it("reads a deflated zip the way Google Calendar exports one", async () => {
    const events = await parseCalendar(zipDeflate("calendar.ics", ICS), "takeout.zip", week);
    expect(events.filter((event) => event.title === "ECE 15")).toHaveLength(2);
  });
});

function zipStore(name: string, text: string): Uint8Array {
  return zip(name, new TextEncoder().encode(text), 0);
}

function zipDeflate(name: string, text: string): Uint8Array {
  const raw = new TextEncoder().encode(text);
  return zip(name, deflateRawSync(raw), 8, raw.length);
}

function zip(name: string, data: Uint8Array, method: number, uncompressed = data.length): Uint8Array {
  const nameBytes = new TextEncoder().encode(name);
  const header = new Uint8Array(30 + nameBytes.length + data.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(8, method, true);
  view.setUint32(18, data.length, true);
  view.setUint32(22, uncompressed, true);
  view.setUint16(26, nameBytes.length, true);
  header.set(nameBytes, 30);
  header.set(data, 30 + nameBytes.length);
  return header;
}
