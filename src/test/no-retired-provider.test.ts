import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FIND_MORE_MESSAGES } from "@/lib/findMore";
import { anyProviderName, retiredProvider } from "./providerNames";

const src = resolve(__dirname, "..");
const self = resolve(__filename);

/**
 * Server-only code that may name the backup provider (its URL, model and key name). Nothing here
 * reaches the page: it is only imported on the server, and the next tests check what the page shows.
 * Key names also live in `.env.example`, which is outside src.
 */
const SERVER_ONLY_ALLOWED = [
  "lib/findMore.fallback.server.ts",
  "lib/findMore.fallback.server.test.ts",
];
const slash = (path: string) => relative(src, path).split(/[\\/]/).join("/");

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

describe("the web app's provider", () => {
  it("names the backup provider only in the allowlisted server-only files", () => {
    const hits = files(src)
      .filter((path) => path !== self && /\.(tsx?|css|md|json)$/.test(path))
      .filter((path) => !SERVER_ONLY_ALLOWED.includes(slash(path)))
      .filter((path) => retiredProvider.test(readFileSync(path, "utf8")))
      .map(slash);
    expect(hits).toEqual([]);
  });

  it("imports the server-only backup from nowhere but the server function", () => {
    const importers = files(src)
      .filter((path) => path !== self && /\.tsx?$/.test(path))
      .filter((path) => !SERVER_ONLY_ALLOWED.includes(slash(path)))
      .filter((path) => readFileSync(path, "utf8").includes("findMore.fallback.server"))
      .map(slash);
    expect(importers).toEqual(["lib/mentor.functions.ts"]);
  });

  it("never shows a provider name in Find more's messages", () => {
    for (const message of [
      FIND_MORE_MESSAGES.error,
      FIND_MORE_MESSAGES.empty,
      FIND_MORE_MESSAGES.added(1),
      FIND_MORE_MESSAGES.added(3),
    ]) {
      expect(message).not.toMatch(anyProviderName);
    }
    expect(FIND_MORE_MESSAGES.error).toBe("Couldn't find more right now.");
  });

  it("never names the model provider in what the page shows", () => {
    const ui = files(src)
      .filter((path) => /[\\/](routes|components)[\\/]/.test(path) && /\.tsx$/.test(path))
      .filter((path) => !/\.test\.tsx$/.test(path))
      .filter((path) => anyProviderName.test(readFileSync(path, "utf8")))
      .map((path) => relative(src, path));
    expect(ui).toEqual([]);
  });
});
