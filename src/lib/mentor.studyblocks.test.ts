import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalEvent } from "./launchpad";
import { SEOJIN } from "./launchpad";
import { applyPatch, sanitizePatch } from "./patch";
import { classifyPatch, eventsOverlap } from "./patchSize";
import { routeMessage } from "./mentorChips";

// The demo line. The model is mocked, the network is never reached and .env is never read.
const LINE =
  "Make me study blocks for the week: weekdays 3-hour study blocks, Saturday a 5-hour study block";

const block = (day: number, start: number, end: number): CalEvent => ({
  day,
  start,
  end,
  title: "Study block",
  kind: "task",
});
// What a good model answers for Seojin's week: free gaps, a 10 minute walk after classes left empty.
const SIX = [
  block(0, 17.5, 20.5),
  block(1, 7.5, 10.5),
  block(2, 17.5, 20.5),
  block(3, 7.5, 10.5),
  block(4, 14, 17),
  block(5, 9, 14),
];
const overlaps = (events: CalEvent[]) =>
  events.flatMap((a, i) => events.slice(i + 1).filter((b) => eventsOverlap(a, b)));

const candidate = (payload: unknown) => ({
  candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
});
const json = (payload: unknown) => new Response(JSON.stringify(payload), { status: 200 });

async function load() {
  vi.resetModules();
  const readFileSync = () => {
    throw new Error("no .env in tests");
  };
  vi.doMock("node:fs", () => ({ readFileSync, default: { readFileSync } }));
  process.env["GEMINI_API_KEY"] = "test-key";
  return import("./mentor.server");
}

describe("the study-block demo line", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("node:fs");
    delete process.env["GEMINI_API_KEY"];
  });

  it("starts from a week that really has room (the sample reply overlaps nothing)", () => {
    for (const e of SIX) expect(SEOJIN.events.some((old) => eventsOverlap(e, old))).toBe(false);
    expect(overlaps(SIX)).toEqual([]);
  });

  it("keeps all six events through the sanitizer (there is no cap) and classifies them big", () => {
    const patch = sanitizePatch({ addEvents: SIX });
    expect(patch?.addEvents).toEqual(SIX);
    expect(classifyPatch({ addEvents: SIX }, SEOJIN.events)).toBe("big");
    const many = Array.from({ length: 21 }, (_, i) => block(i % 7, 6 + (i % 3), 7 + (i % 3)));
    expect(sanitizePatch({ addEvents: many })?.addEvents).toHaveLength(21);
  });

  it("tells the model the schema, day numbers, day window, existing events and transition rule", async () => {
    const { chatWithMentor } = await load();
    fetchMock.mockResolvedValueOnce(json(candidate({ reply: "Hi.", patch: null })));
    await chatWithMentor({ message: LINE, student: SEOJIN });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const prompt: string = body.contents[0].parts[0].text;
    expect(prompt).toContain("{day, start, end, title, kind}");
    expect(prompt).toContain("0=Mon");
    expect(prompt).toContain("4=Fri, 5=Sat");
    expect(prompt).toContain("24-hour clock");
    expect(prompt).toContain("day window 6 to 23");
    expect(prompt).toMatch(/ten.minute transition/);
    expect(prompt).toContain('"title":"MATH 20A"'); // the student's existing events
    expect(prompt).toContain(LINE);
  });

  it("returns the six blocks as one big change that asks for a yes", async () => {
    const { chatWithMentor } = await load();
    fetchMock.mockResolvedValueOnce(
      json(
        candidate({
          reply:
            "Here is a week of study blocks: 3 hours Mon to Fri and 5 hours Saturday. Say yes to add them.",
          patch: { addEvents: SIX },
        }),
      ),
    );
    const turn = await chatWithMentor({ message: LINE, student: SEOJIN });
    expect(turn.size).toBe("big");
    expect(turn.patch?.addEvents).toEqual(SIX);
    expect(turn.reply).toMatch(/yes/i);
    expect(turn.choices).toEqual(["Yes, apply it", "No, leave it"]);
  });

  it("confirm applies all six without overlaps, and the earlier week is kept for Undo", async () => {
    const { chatWithMentor } = await load();
    fetchMock.mockResolvedValueOnce(
      json(candidate({ reply: "Say yes.", patch: { addEvents: SIX } })),
    );
    const turn = await chatWithMentor({ message: LINE, student: SEOJIN });
    const { route } = routeMessage("Yes, apply it", SEOJIN, true, true);
    expect(route.kind).toBe("apply");
    const before = structuredClone(SEOJIN);
    const next = applyPatch(SEOJIN, turn.patch!);
    const added = next.events.slice(SEOJIN.events.length);
    expect(added).toEqual(SIX);
    expect(added.filter((e) => e.day <= 4).map((e) => e.end - e.start)).toEqual([3, 3, 3, 3, 3]);
    expect(added.find((e) => e.day === 5)).toMatchObject({ start: 9, end: 14 });
    for (const e of added) expect(SEOJIN.events.some((old) => eventsOverlap(e, old))).toBe(false);
    expect(overlaps(added)).toEqual([]);
    // Undo restores the previous state object: applying never changes it.
    expect(SEOJIN).toEqual(before);
    expect(next).not.toBe(SEOJIN);
  });

  it("moves an overlapping block into the nearest free gap and says so", async () => {
    const { chatWithMentor } = await load();
    // Monday 2-5pm overlaps the existing 3-5pm MATH 20A study block.
    const proposal = [block(0, 14, 17), ...SIX.slice(1)];
    fetchMock.mockResolvedValueOnce(
      json(candidate({ reply: "Say yes.", patch: { addEvents: proposal } })),
    );
    const turn = await chatWithMentor({ message: LINE, student: SEOJIN });
    expect(turn.size).toBe("big");
    const monday = turn.patch?.addEvents?.find((e) => e.day === 0);
    expect(monday).toMatchObject({ start: 17, end: 20 });
    expect(turn.patch?.addEvents).toHaveLength(6);
    expect(turn.reply).toContain('I moved "Study block" from Mon 2p-5p to Mon 5p-8p');
    const added = applyPatch(SEOJIN, turn.patch!).events.slice(SEOJIN.events.length);
    for (const e of added) expect(SEOJIN.events.some((old) => eventsOverlap(e, old))).toBe(false);
  });

  it("leaves out a block no gap can hold, tells the student, and keeps the rest", async () => {
    const { chatWithMentor } = await load();
    const proposal = [...SIX.slice(0, 5), block(5, 6, 24)]; // 18 hours do not fit the 17 hour window
    fetchMock.mockResolvedValueOnce(
      json(candidate({ reply: "Say yes.", patch: { addEvents: proposal } })),
    );
    const turn = await chatWithMentor({ message: LINE, student: SEOJIN });
    expect(turn.patch?.addEvents).toEqual(SIX.slice(0, 5));
    expect(turn.reply).toContain("I left out");
    expect(turn.reply).toContain("Sat");
  });

  it("applyPatch also repairs an overlap that slipped through, and skips exact repeats", () => {
    const clash = block(0, 14, 17);
    const once = applyPatch(SEOJIN, { addEvents: [clash] });
    const added = once.events.slice(SEOJIN.events.length);
    expect(added).toEqual([block(0, 17, 20)]);
    expect(applyPatch(once, { addEvents: added }).events).toHaveLength(once.events.length);
  });
});
