import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { anyProviderName, retiredProvider } from "./providerNames";

const src = resolve(__dirname, "..");
const self = resolve(__filename);

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

describe("the web app's provider", () => {
  it("has no trace of the retired provider in src", () => {
    const hits = files(src)
      .filter((path) => path !== self && /\.(tsx?|css|md|json)$/.test(path))
      .filter((path) => retiredProvider.test(readFileSync(path, "utf8")))
      .map((path) => relative(src, path));
    expect(hits).toEqual([]);
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
