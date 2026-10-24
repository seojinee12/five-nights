import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultChips } from "./mentorChips";

// The network is mocked and .env is never read, so these tests send no real request.
const student = {
  name: "Sam",
  major: "Electrical Engineering",
  status: "on-track",
  statusNote: "",
  focus: ["academic"],
  courses: [],
  events: [],
  tasks: [],
  weeklyTargets: [],
  longTerm: [],
};
const candidate = (payload: unknown) => ({
  candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
});
const grokReply = (payload: unknown) => ({
  choices: [{ message: { content: JSON.stringify(payload) } }],
});
const json = (payload: unknown) => new Response(JSON.stringify(payload), { status: 200 });
const task = { id: "t", title: "Buy a lab notebook", category: "academic", timed: false };

async function load(keys: { gemini?: string; xai?: string }) {
  vi.resetModules();
  const readFileSync = () => {
    throw new Error("no .env in tests");
  };
  vi.doMock("node:fs", () => ({ readFileSync, default: { readFileSync } }));
  for (const [name, value] of [
    ["GEMINI_API_KEY", keys.gemini],
    ["XAI_API_KEY", keys.xai],
  ] as const) {
    if (value) process.env[name] = value;
    else delete process.env[name];
  }
  return import("./mentor.server");
}

describe("chatWithMentor choices (network mocked)", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock("node:fs");
    delete process.env["GEMINI_API_KEY"];
    delete process.env["XAI_API_KEY"];
  });

  // Choice rule: a plain free-text reply with no choices shows no chips. The starters stay on
  // terminal-like turns (greeting, applied, undone, declined, file notes) and on error turns, which
  // end without the model; the starters are local flows that still work then. Yes/no stays while
  // a big change waits.
  it("keeps the starter chips when there is no key (terminal-like), without calling the network", async () => {
    for (const model of ["Gemini", "Grok"] as const) {
      const { chatWithMentor } = await load({});
      const turn = await chatWithMentor({ model, message: "hi", student });
      expect(turn.patch).toBeNull();
      expect(turn.choices).toEqual(defaultChips());
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the starter chips when the call fails (terminal-like error)", async () => {
    const { chatWithMentor } = await load({ gemini: "test-key" });
    fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
    const turn = await chatWithMentor({ model: "Gemini", message: "hi", student });
    expect(turn.choices).toEqual(defaultChips());
  });

  it("returns the model's choices sanitized: capped, trimmed, deduped, within 40 characters", async () => {
    const { chatWithMentor } = await load({ gemini: "test-key" });
    fetchMock.mockResolvedValueOnce(
      json(
        candidate({
          reply: "Which day?",
          patch: null,
          choices: [
            " Thursday ",
            "thursday",
            7,
            "",
            "Friday",
            "x".repeat(90),
            "Saturday",
            "Sunday",
          ],
        }),
      ),
    );
    const turn = await chatWithMentor({ model: "Gemini", message: "I have a change", student });
    expect(turn.reply).toBe("Which day?");
    expect(turn.choices).toHaveLength(4);
    expect(turn.choices?.slice(0, 2)).toEqual(["Thursday", "Friday"]);
    expect(turn.choices?.every((choice) => choice.length <= 40)).toBe(true);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(JSON.stringify(body.contents)).toContain("choices");
  });

  it("carries the full text of a model choice that was cut for display", async () => {
    const { chatWithMentor } = await load({ gemini: "test-key" });
    const long = "Move my calculus problem set to Thursday evening after the study group";
    fetchMock.mockResolvedValueOnce(
      json(candidate({ reply: "Which?", patch: null, choices: [long, "Short"] })),
    );
    const turn = await chatWithMentor({ model: "Gemini", message: "hi", student });
    expect(turn.choices?.[0]).toHaveLength(40);
    expect(turn.choices?.[1]).toBe("Short");
    expect(turn.choiceTexts).toEqual([long, "Short"]);
    fetchMock.mockResolvedValueOnce(
      json(candidate({ reply: "Which?", patch: null, choices: ["A"] })),
    );
    expect(
      (await chatWithMentor({ model: "Gemini", message: "hi", student })).choiceTexts,
    ).toBeUndefined();
  });

  it("shows no chips when the model returns none, and yes/no while a change waits", async () => {
    const { chatWithMentor } = await load({ gemini: "test-key" });
    fetchMock.mockResolvedValueOnce(json(candidate({ reply: "Okay.", patch: null })));
    expect((await chatWithMentor({ model: "Gemini", message: "hi", student })).choices).toEqual([]);
    fetchMock.mockResolvedValueOnce(
      json(candidate({ reply: "Okay.", patch: null, choices: [null, " "] })),
    );
    expect((await chatWithMentor({ model: "Gemini", message: "hi", student })).choices).toEqual([]);
    // A small change is applied right away; the client adds the starters after "Added …" itself.
    fetchMock.mockResolvedValueOnce(
      json(candidate({ reply: "Done.", patch: { addTasks: [task] }, choices: [] })),
    );
    const small = await chatWithMentor({ model: "Gemini", message: "add", student });
    expect(small.size).toBe("small");
    expect(small.choices).toEqual([]);
    fetchMock.mockResolvedValueOnce(
      json(
        candidate({
          reply: "Two things.",
          patch: { addTasks: [task, { ...task, id: "u", title: "Two" }] },
        }),
      ),
    );
    const big = await chatWithMentor({ model: "Gemini", message: "add two", student });
    expect(big.size).toBe("big");
    expect(big.choices).toEqual(defaultChips(true));
  });

  it("shows no chips for a plain xAI reply without choices", async () => {
    const { chatWithMentor } = await load({ xai: "test-key" });
    fetchMock.mockResolvedValueOnce(json(grokReply({ reply: "Sure.", patch: null })));
    expect((await chatWithMentor({ model: "Grok", message: "hi", student })).choices).toEqual([]);
  });

  it("returns choices from the xAI path too", async () => {
    const { chatWithMentor } = await load({ xai: "test-key" });
    fetchMock.mockResolvedValueOnce(
      json(grokReply({ reply: "Pick one.", patch: null, choices: ["A", "B"] })),
    );
    const turn = await chatWithMentor({ model: "Grok", message: "hi", student });
    expect(turn.choices).toEqual(["A", "B"]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.x.ai/v1/chat/completions");
  });
});
