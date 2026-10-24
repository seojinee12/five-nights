import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { anyProviderName } from "@/test/providerNames";
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
const json = (payload: unknown) => new Response(JSON.stringify(payload), { status: 200 });
const task = { id: "t", title: "Buy a lab notebook", category: "academic", timed: false };

async function load(keys: { gemini?: string }) {
  vi.resetModules();
  const readFileSync = () => {
    throw new Error("no .env in tests");
  };
  vi.doMock("node:fs", () => ({ readFileSync, default: { readFileSync } }));
  if (keys.gemini) process.env["GEMINI_API_KEY"] = keys.gemini;
  else delete process.env["GEMINI_API_KEY"];
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
  });

  // Choice rule: a plain free-text reply with no choices shows no chips. The starters stay on
  // terminal-like turns (greeting, applied, undone, declined, file notes) and on error turns, which
  // end without the model; the starters are local flows that still work then. Yes/no stays while
  // a big change waits.
  it("is in practice mode with neutral wording and the starter chips when there is no key", async () => {
    const { chatWithMentor } = await load({});
    const turn = await chatWithMentor({ message: "hi", student });
    expect(turn.patch).toBeNull();
    expect(turn.reply).toMatch(/^The assistant is in practice mode/);
    expect(turn.reply).toMatch(/Nothing was changed/);
    expect(turn.reply).not.toMatch(anyProviderName);
    expect(turn.choices).toEqual(defaultChips());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the mentor request to the Gemini endpoint only", async () => {
    const { chatWithMentor } = await load({ gemini: "test-key" });
    fetchMock.mockResolvedValueOnce(json(candidate({ reply: "Hi.", patch: null })));
    const turn = await chatWithMentor({ message: "hello there", student });
    expect(turn.reply).toBe("Hi.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toMatch(
      /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.8-flash:generateContent\?/,
    );
    expect(init?.method).toBe("POST");
    const body = JSON.parse(String(init?.body));
    expect(body.generationConfig).toEqual({ responseMimeType: "application/json" });
    expect(JSON.stringify(body.contents)).toContain("hello there");
  });

  it("keeps the neutral error wording when the call fails or is rate-limited", async () => {
    const { chatWithMentor } = await load({ gemini: "test-key" });
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    const failed = await chatWithMentor({ message: "hi", student });
    expect(failed.reply).toBe("The assistant could not finish that. Nothing was changed.");
    fetchMock.mockImplementation(() => Promise.resolve(new Response("{}", { status: 429 })));
    const limited = await chatWithMentor({ message: "hi", student });
    expect(limited.reply).toBe("The assistant is rate-limited right now. Nothing was changed.");
  }, 10_000);

  it("keeps the starter chips when the call fails (terminal-like error)", async () => {
    const { chatWithMentor } = await load({ gemini: "test-key" });
    fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
    const turn = await chatWithMentor({ message: "hi", student });
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
    const turn = await chatWithMentor({ message: "I have a change", student });
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
    const turn = await chatWithMentor({ message: "hi", student });
    expect(turn.choices?.[0]).toHaveLength(40);
    expect(turn.choices?.[1]).toBe("Short");
    expect(turn.choiceTexts).toEqual([long, "Short"]);
    fetchMock.mockResolvedValueOnce(
      json(candidate({ reply: "Which?", patch: null, choices: ["A"] })),
    );
    expect((await chatWithMentor({ message: "hi", student })).choiceTexts).toBeUndefined();
  });

  it("shows no chips when the model returns none, and yes/no while a change waits", async () => {
    const { chatWithMentor } = await load({ gemini: "test-key" });
    fetchMock.mockResolvedValueOnce(json(candidate({ reply: "Okay.", patch: null })));
    expect((await chatWithMentor({ message: "hi", student })).choices).toEqual([]);
    fetchMock.mockResolvedValueOnce(
      json(candidate({ reply: "Okay.", patch: null, choices: [null, " "] })),
    );
    expect((await chatWithMentor({ message: "hi", student })).choices).toEqual([]);
    // A small change is applied right away; the client adds the starters after "Added …" itself.
    fetchMock.mockResolvedValueOnce(
      json(candidate({ reply: "Done.", patch: { addTasks: [task] }, choices: [] })),
    );
    const small = await chatWithMentor({ message: "add", student });
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
    const big = await chatWithMentor({ message: "add two", student });
    expect(big.size).toBe("big");
    expect(big.choices).toEqual(defaultChips(true));
  });
});
