import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OpportunitiesHeading, OpportunityList } from "./OpportunityList";
import { FIND_MORE_MESSAGES } from "@/lib/findMore";
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

  it("shows scores as plain text, with no tooltip button on each card", () => {
    render(<OpportunityList items={[1, 2].map(item)} />);
    expect(screen.getByText("99/100")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("OpportunitiesHeading", () => {
  it("has a labelled, focusable info icon next to the heading", () => {
    render(<OpportunitiesHeading />);
    expect(screen.getByRole("heading", { name: "Best fits for you" })).toBeInTheDocument();
    const icon = screen.getByLabelText("What the score means");
    expect(icon.tagName).toBe("BUTTON");
    icon.focus();
    expect(icon).toHaveFocus();
  });

  it("keeps the fuller description closed until the trigger is clicked", () => {
    render(<OpportunitiesHeading />);
    const trigger = screen.getByText("How is this scored?");
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    const closed = screen.queryByTestId("scoring-explainer");
    expect(closed?.textContent ?? "").toBe("");
    expect(closed).not.toHaveTextContent("up to");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const text = screen.getByTestId("scoring-explainer").textContent ?? "";
    for (const f of SCORING_EXPLAINER.factors) expect(text).toContain(`up to ${f.points}`);
    expect(text).toContain(SCORING_EXPLAINER.reductions.text);
    expect(text).not.toMatch(/gemini|openai|resume|\bAI\b/i);
  });
});

describe("OpportunitiesHeading find more", () => {
  it("shows no Find more button unless a handler is given", () => {
    render(<OpportunitiesHeading />);
    expect(screen.queryByRole("button", { name: /find more/i })).toBeNull();
  });

  it("calls the handler from a small Find more button", () => {
    const onFindMore = vi.fn();
    render(<OpportunitiesHeading onFindMore={onFindMore} />);
    fireEvent.click(screen.getByRole("button", { name: "Find more" }));
    expect(onFindMore).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("is aria-disabled, still focusable, and reads Finding… while loading", () => {
    const onFindMore = vi.fn();
    render(<OpportunitiesHeading onFindMore={onFindMore} finding />);
    const button = screen.getByRole("button", { name: "Finding…" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();
    button.focus();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(onFindMore).not.toHaveBeenCalled();
  });

  it("shows the empty and error messages inline", () => {
    const { rerender } = render(
      <OpportunitiesHeading onFindMore={() => {}} message={FIND_MORE_MESSAGES.empty} />,
    );
    const live = screen.getByRole("status");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toHaveTextContent("No new opportunities found this time.");
    rerender(<OpportunitiesHeading onFindMore={() => {}} message={FIND_MORE_MESSAGES.error} />);
    expect(screen.getByRole("status")).toHaveTextContent("Couldn't find more right now.");
  });
});

describe("OpportunityList expandSignal", () => {
  const items = [1, 2, 3, 4, 5].map(item);
  const detailsOpen = () => document.querySelector("details")!.hasAttribute("open");

  it("keeps the expander closed by default and opens it when the signal changes", () => {
    const { rerender } = render(<OpportunityList items={items} expandSignal={0} />);
    expect(detailsOpen()).toBe(false);
    rerender(<OpportunityList items={items} expandSignal={1} />);
    expect(detailsOpen()).toBe(true);
  });

  it("can be closed by hand and reopens on the next signal", () => {
    const { rerender } = render(<OpportunityList items={items} expandSignal={1} />);
    const details = document.querySelector("details")!;
    expect(details).toHaveAttribute("open");
    details.removeAttribute("open");
    fireEvent(details, new Event("toggle"));
    expect(detailsOpen()).toBe(false);
    rerender(<OpportunityList items={items} expandSignal={2} />);
    expect(detailsOpen()).toBe(true);
  });
});
