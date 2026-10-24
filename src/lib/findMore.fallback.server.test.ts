import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findMoreWithBackup, findMoreWithFallback } from "./findMore.fallback.server";
import { findMoreOpportunities } from "./mentor.server";
import {
  FIND_MORE_MESSAGES,
  findMoreOutcome,
  looksOfficial,
  parseFindMoreInput,
  sanitizeFoundItems,
} from "./findMore";

const input = parseFindMoreInput({
  exclude: ["Triton Robotics", "https://tritonrobotics.org/"],
  interests: ["robotics"],
  goals: ["research internship"],
  year: "Freshman",
  major: "Electrical Engineering",
});

const item = (
  name: string,
  url = `https://${name.toLowerCase().replace(/\W+/g, "")}.ucsd.edu/`,
) => ({
  name,
  what: `${name} offers things.`,
  url,
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const geminiOk = (lists: unknown) =>
  json({ candidates: [{ content: { parts: [{ text: JSON.stringify(lists) }] } }] });
const grokOk = (lists: unknown) =>
  json({ choices: [{ message: { content: JSON.stringify(lists) } }] });

const isGemini = (url: string) => url.includes("generativelanguage.googleapis.com");
const isGrok = (url: string) => url.includes("api.x.ai");

let calls: string[];
function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(url);
      return handler(url, init);
    }),
  );
}

/** Runs a promise to completion while skipping the retry sleeps inside the Gemini call. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  const done = promise.then(
    (v) => v,
    (e) => {
      throw e;
    },
  );
  await vi.runAllTimersAsync();
  return done;
}

beforeEach(() => {
  vi.useFakeTimers();
  // Keep the tests off any real .env file: with no environment variable set, there is no key.
  vi.spyOn(process, "cwd").mockReturnValue("/nonexistent-dir-for-tests");
  vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
  vi.stubEnv("XAI_API_KEY", "test-backup-key");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("findMoreWithFallback", () => {
  it("uses the first search when it works and never calls the backup", async () => {
    stubFetch((url) =>
      isGemini(url) ? geminiOk({ research: [item("Lab A")], projects: [] }) : grokOk({}),
    );
    const result = await settle(findMoreWithFallback(input, findMoreOpportunities));
    expect(result?.research.map((r) => r.name)).toEqual(["Lab A"]);
    expect(calls.some(isGrok)).toBe(false);
  });

  it("falls back to the backup on a 429 and the results merge into the lists", async () => {
    stubFetch((url) =>
      isGemini(url)
        ? json({ error: { code: 429 } }, 429)
        : grokOk({ research: [item("Lab B")], projects: [item("Team C")] }),
    );
    const outcome = await settle(
      findMoreOutcome({
        current: { research: [item("Existing Lab")], projects: [] },
        shown: ["Existing Lab"],
        profile: { interests: ["robotics"], year: "Freshman" },
        ask: (i) => findMoreWithFallback(i, findMoreOpportunities),
        toResearch: (x) => x,
        toProject: (x) => x,
      }),
    );
    expect(calls.some(isGemini)).toBe(true);
    expect(calls.some(isGrok)).toBe(true);
    expect(outcome.status).toBe("added");
    if (outcome.status === "added") {
      expect(outcome.research.map((r) => r.name)).toEqual(["Existing Lab", "Lab B"]);
      expect(outcome.projects.map((r) => r.name)).toEqual(["Team C"]);
    }
  });

  it("falls back when there is no first key, or the first call throws", async () => {
    vi.stubEnv("GEMINI_API_KEY", undefined);
    vi.stubEnv("XAI_API_KEY", "test-backup-key");
    stubFetch(() => grokOk({ research: [item("Lab D")], projects: [] }));
    expect(
      (await settle(findMoreWithFallback(input, findMoreOpportunities)))?.research,
    ).toHaveLength(1);
    const thrown = await findMoreWithFallback(input, async () => {
      throw new Error("boom");
    });
    expect(thrown?.research).toHaveLength(1);
  });

  it("returns null only when both fail, which becomes the error outcome", async () => {
    stubFetch((url) => (isGemini(url) ? json({}, 429) : json({ error: "x" }, 500)));
    const outcome = await settle(
      findMoreOutcome({
        current: { research: [item("Existing Lab")], projects: [] },
        shown: [],
        profile: {},
        ask: (i) => findMoreWithFallback(i, findMoreOpportunities),
        toResearch: (x) => x,
        toProject: (x) => x,
      }),
    );
    expect(calls.some(isGrok)).toBe(true);
    expect(outcome).toEqual({ status: "error", message: "Couldn't find more right now." });
  });

  it("returns null when the backup is not reachable or has no key", async () => {
    stubFetch(() => {
      throw new Error("network");
    });
    expect(await settle(findMoreWithFallback(input, async () => null))).toBeNull();
    vi.stubEnv("XAI_API_KEY", undefined);
    stubFetch(() => grokOk({}));
    expect(await findMoreWithBackup(input)).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe("findMoreWithBackup", () => {
  it("asks for strict JSON with the same profile and exclusions, and no resume", async () => {
    let body = "";
    let auth = "";
    stubFetch((_url, init) => {
      body = String(init?.body);
      auth = String((init?.headers as Record<string, string>)["authorization"]);
      return grokOk({ research: [], projects: [] });
    });
    expect(await findMoreWithBackup(input)).toEqual({ research: [], projects: [] });
    expect(auth).toBe("Bearer test-backup-key");
    const sent = JSON.parse(body);
    expect(sent.model).toBe("grok-4.7");
    expect(sent.response_format).toEqual({ type: "json_object" });
    expect(sent.reasoning_effort).toBe("low");
    const prompt = JSON.stringify(sent.messages);
    for (const part of [
      "Freshman",
      "Electrical Engineering",
      "robotics",
      "research internship",
      "Triton Robotics",
      "https://tritonrobotics.org/",
    ]) {
      expect(prompt).toContain(part);
    }
    expect(prompt).not.toMatch(/resume|google search/i);
  });

  it("drops excluded items, repeats, non-https links and placeholder hosts", async () => {
    stubFetch(() =>
      grokOk({
        research: [
          item("Triton Robotics", "https://tritonrobotics.org/"),
          item("Good Lab"),
          item("good lab", "https://other.ucsd.edu/"),
          item("Http Lab", "http://lab.ucsd.edu/"),
          item("Fake Lab", "https://example.com/lab"),
          item("Search Page", "https://www.google.com/search?q=x"),
          { name: "No url", what: "x" },
          "nonsense",
        ],
        projects: [item("Good Lab", "https://goodlab.ucsd.edu/"), item("Team E")],
      }),
    );
    const result = await findMoreWithBackup(input);
    expect(result?.research.map((r) => r.name)).toEqual(["Good Lab"]);
    expect(result?.projects.map((r) => r.name)).toEqual(["Team E"]);
  });

  it("returns null for an unreadable reply or a non-OK status", async () => {
    stubFetch(() => json({ choices: [{ message: { content: "not json at all" } }] }));
    expect(await findMoreWithBackup(input)).toBeNull();
    stubFetch(() => json({}, 429));
    expect(await findMoreWithBackup(input)).toBeNull();
  });
});

describe("official-looking links and copy", () => {
  it("accepts real https hosts and rejects the rest", () => {
    expect(looksOfficial("https://e4e.ucsd.edu/open-opportunities")).toBe(true);
    for (const bad of [
      "http://a.edu/",
      "https://localhost/",
      "https://127.0.0.1/",
      "https://intranet/",
      "https://example.org/x",
      "not a url",
    ]) {
      expect(looksOfficial(bad)).toBe(false);
    }
    expect(sanitizeFoundItems("x")).toEqual([]);
  });

  it("keeps provider names out of every user-visible message", () => {
    const messages = [
      FIND_MORE_MESSAGES.error,
      FIND_MORE_MESSAGES.empty,
      FIND_MORE_MESSAGES.added(1),
      FIND_MORE_MESSAGES.added(4),
    ].join(" ");
    expect(messages).not.toMatch(/grok|xai|x\.ai|gemini|google|openai/i);
  });
});
