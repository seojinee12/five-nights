import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OpportunitiesHeading, OpportunityList } from "./OpportunityList";
import { SCORING_EXPLAINER, type RankedOpportunity } from "@/lib/opportunities";

const item = (n: number): RankedOpportunity => ({
  name: `Opportunity ${n}`,
  sub: "",
  url: `https://example.edu/${n}`,
  type: "research",
  typeLabel: "Research lab",
  score: 100 - n,
  why: `Reason ${n}.`,
});

describe("OpportunityList", () => {
  it("shows three cards with a type label, a linked title, the score, and the why line", () => {
    render(<OpportunityList items={[1, 2, 3, 4, 5].map(item)} />);
    const first = screen.getAllByRole("listitem")[0]!;
    expect(within(first).getByText("Research lab")).toBeInTheDocument();
    expect(within(first).getByRole("link", { name: "Opportunity 1" })).toHaveAttribute(
      "href",
      "https://example.edu/1",
    );
    expect(within(first).getByText("99/100")).toBeInTheDocument();
    expect(within(first).getByText("Reason 1.")).toBeInTheDocument();
    expect(screen.getByText("See 2 more")).toBeInTheDocument();
    expect(screen.queryByText(/gemini/i)).toBeNull();
  });

  it("renders no expander for three or fewer opportunities", () => {
    for (const count of [0, 1, 3]) {
      const { unmount } = render(
        <OpportunityList items={Array.from({ length: count }, (_, i) => item(i + 1))} />,
      );
      expect(screen.queryByText(/see \d+ more/i)).toBeNull();
      expect(document.querySelector("details")).toBeNull();
      unmount();
    }
  });

  it("gives each score a focusable tooltip trigger", () => {
    render(<OpportunityList items={[1, 2].map(item)} />);
    const score = screen.getByRole("button", { name: "99/100" });
    score.focus();
    expect(score).toHaveFocus();
  });
});

describe("OpportunitiesHeading", () => {
  it("has a labelled, focusable info icon and a scoring disclosure that is closed by default", () => {
    render(<OpportunitiesHeading />);
    expect(screen.getByRole("heading", { name: "Best fits for you" })).toBeInTheDocument();
    const icon = screen.getByRole("button", { name: "How is this scored?" });
    icon.focus();
    expect(icon).toHaveFocus();
    const details = document.querySelector("details")!;
    expect(details).not.toHaveAttribute("open");
    expect(within(details).getByText("How is this scored?")).toBeInTheDocument();
    const text = screen.getByTestId("scoring-explainer").textContent ?? "";
    for (const f of SCORING_EXPLAINER.factors) expect(text).toContain(`up to ${f.points}`);
    expect(text).not.toMatch(/gemini|resume/i);
  });
});
