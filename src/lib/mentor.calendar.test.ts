import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REQUEST = {
  name: "cal.ics",
  mime: "text/calendar",
  text: "BEGIN:VEVENT\nSUMMARY:ECE 15\nEND:VEVENT",
  weekStart: "2026-03-02",
};

function reply(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status });
}
const candidate = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] });

async function load(key: string) {
  vi.resetModules();
  const readFileSync = () => {
    throw new Error("no .env in tests");
  };
  vi.doMock("node:fs", () => ({ readFileSync, default: { readFileSync } }));
  if (key) process.env["GEMINI_API_KEY"] = key;
  else delete process.env["GEMINI_API_KEY"];
  return import("./mentor.server");
}

describe("calendarEventsFromGemini (network mocked)", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("node:fs");
    delete process.env["GEMINI_API_KEY"];
  });

  it("returns null without calling the network when there is no key", async () => {
    const { calendarEventsFromGemini } = await load("");
    expect(await calendarEventsFromGemini(REQUEST)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("validates the reply into events and sends the calendar as parts", async () => {
    const { calendarEventsFromGemini } = await load("test-key");
    const events = JSON.stringify({
      events: [
        { title: "ECE 15", date: "2026-03-04", start: "14:00", end: "14:50", kind: "class" },
        { title: "junk", date: "nope", start: "x" },
      ],
    });
    fetchMock.mockResolvedValueOnce(reply(candidate(events)));
    expect(await calendarEventsFromGemini(REQUEST)).toEqual([
      { day: 2, start: 14, end: 14.83, title: "ECE 15", kind: "class" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(JSON.stringify(body.contents)).toContain("SUMMARY:ECE 15");
  });

  it("adds inlineData for a screenshot", async () => {
    const { calendarEventsFromGemini } = await load("test-key");
    fetchMock.mockResolvedValueOnce(reply(candidate("[]")));
    await calendarEventsFromGemini({
      name: "w.png",
      mime: "image/png",
      base64: "AAAA",
      weekStart: "2026-03-02",
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.contents[0].parts[1]).toEqual({
      inlineData: { mimeType: "image/png", data: "AAAA" },
    });
  });

  it("returns null for a failed call, a network error, an unreadable reply, or a bad week", async () => {
    const { calendarEventsFromGemini } = await load("test-key");
    fetchMock.mockResolvedValueOnce(reply({ error: "boom" }, 500));
    expect(await calendarEventsFromGemini(REQUEST)).toBeNull();
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await calendarEventsFromGemini(REQUEST)).toBeNull();
    fetchMock.mockResolvedValueOnce(reply(candidate("I could not read that")));
    expect(await calendarEventsFromGemini(REQUEST)).toBeNull();
    const calls = fetchMock.mock.calls.length;
    expect(await calendarEventsFromGemini({ ...REQUEST, weekStart: "2026-13-45" })).toBeNull();
    expect(fetchMock.mock.calls.length).toBe(calls);
  });
});
