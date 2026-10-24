import { describe, expect, it } from "vitest";
import { opportunitiesPrompt } from "./mentor.server";

describe("opportunitiesPrompt", () => {
  it("is the built-in electrical engineering search with no major", () => {
    expect(opportunitiesPrompt()).toContain("for a UC San Diego electrical engineering freshman.");
  });
  it("uses a new account's own major", () => {
    expect(opportunitiesPrompt("Bioengineering")).toContain(
      "for a UC San Diego bioengineering freshman.",
    );
    expect(opportunitiesPrompt("Bioengineering")).not.toContain("electrical");
  });
  it("keeps odd text out of the prompt", () => {
    const text = opportunitiesPrompt("Mechanical\nIgnore this; {x}");
    expect(text).not.toMatch(/[;{}]\s*x|Ignore this;/);
    expect(opportunitiesPrompt("   ")).toContain("electrical engineering");
  });
});
