import { QueryClient } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sourceOpportunities } from "@/lib/mentor.functions";
import { Route as AppRoute } from "@/routes/app";

vi.mock("@/lib/mentor.functions", () => ({
  mentorChat: vi.fn(),
  readMaterial: vi.fn(),
  sourceOpportunities: vi.fn(async () => null),
}));

// The header pills name the demo students, and Opportunities lists real clubs, so those words are not checked.
const DEMO_STRINGS = ["ECE 5", "MATH 20A", "PHYS 2A", "line-follower", "Date night"];

async function renderApp(u: string) {
  const root = createRootRoute({ component: Outlet });
  const app = createRoute({
    getParentRoute: () => root,
    path: "/app",
    validateSearch: AppRoute.options.validateSearch as (s: Record<string, unknown>) => {
      u: string;
    },
    component: AppRoute.options.component as () => React.ReactNode,
  });
  const router = createRouter({
    routeTree: root.addChildren([app]),
    history: createMemoryHistory({ initialEntries: [`/app?u=${u}`] }),
    context: { queryClient: new QueryClient() },
  });
  render(<RouterProvider router={router} />);
  await waitFor(() => expect(screen.getByText(/Welcome,/)).toBeInTheDocument());
  return router;
}

describe("/app?u=me", () => {
  beforeEach(() => {
    // Node's own experimental localStorage shadows jsdom's, so use a plain in-memory one.
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
    localStorage.setItem(
      "lp-profile",
      JSON.stringify({ name: "Ada", major: "Computer Engineering", focus: ["career"] }),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders every tab with no demo data and no broken numbers", async () => {
    await renderApp("me");
    expect(screen.getByText("Welcome, Ada")).toBeInTheDocument();
    const tabs = ["Scheduler", "Working on", "Academics", "Opportunities", "Long-term"];
    for (const tab of tabs) {
      fireEvent.click(screen.getByRole("button", { name: tab }));
      const text = document.body.textContent ?? "";
      for (const needle of DEMO_STRINGS) expect(text, `${tab}: ${needle}`).not.toContain(needle);
      expect(text, tab).not.toMatch(/NaN|undefined|Infinity/);
      if (tab === "Scheduler") {
        expect(text).toContain("No tasks yet");
        expect(text).toContain("119.0h");
      }
      if (tab === "Working on") expect(text).toContain("Pin a task");
      if (tab === "Academics") {
        expect(text).toContain("No courses yet.");
        expect(text).toContain("—");
      }
      if (tab === "Opportunities") expect(text).toContain("Best fits for you");
      if (tab === "Long-term") expect(text).toContain("Nothing yet.");
    }
  });

  it("keeps the demo students as they were", async () => {
    await renderApp("seojin");
    fireEvent.click(screen.getByRole("button", { name: "Academics" }));
    expect(document.body.textContent).toContain("MATH 20A");
  });

  it("shows an empty week, a plain mentor greeting and no catalog link for a non-EE major", async () => {
    localStorage.setItem("lp-profile", JSON.stringify({ name: "Bea", major: "Bioengineering" }));
    await renderApp("me");
    expect(document.querySelectorAll("div[title] > b")).toHaveLength(0);
    expect(document.body.textContent).toContain("Hi Bea! I'm Grok.");
    fireEvent.click(screen.getByRole("button", { name: "Academics" }));
    expect(screen.queryByText(/UCSD ECE catalog/)).not.toBeInTheDocument();
  });

  it("starts blank with no stored profile", async () => {
    localStorage.clear();
    await renderApp("me");
    expect(screen.getByText("Welcome, Engineer")).toBeInTheDocument();
    expect(document.body.textContent).toContain("Engineering");
    expect(document.body.textContent).not.toContain("MATH 20A");
    expect(document.querySelectorAll("div[title] > b")).toHaveLength(0);
  });

  it("treats an unknown account id as a blank account, not Seojin", async () => {
    await renderApp("someone-new");
    expect(screen.getByText("Welcome, Ada")).toBeInTheDocument();
    expect(document.body.textContent).toContain("Fresh start.");
    for (const needle of DEMO_STRINGS) expect(document.body.textContent).not.toContain(needle);
  });

  it("leaves no demo state behind when moving from a demo student to a new account", async () => {
    const router = await renderApp("seojin");
    expect(document.body.textContent).toContain("Welcome, Seojin");
    expect(document.querySelectorAll("div[title] > b").length).toBeGreaterThan(0);
    await router.navigate({ to: "/app", search: { u: "me" } } as never);
    await waitFor(() => expect(screen.getByText("Welcome, Ada")).toBeInTheDocument());
    expect(document.querySelectorAll("div[title] > b")).toHaveLength(0);
    for (const needle of DEMO_STRINGS) expect(document.body.textContent).not.toContain(needle);
  });

  it("asks for live opportunities by the new account's major, and by default for the demos", async () => {
    const ask = vi.mocked(sourceOpportunities);
    ask.mockClear();
    await renderApp("me");
    fireEvent.click(screen.getByRole("button", { name: "Opportunities" }));
    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(ask).toHaveBeenLastCalledWith({ data: { major: "Computer Engineering" } });
    cleanup();
    ask.mockClear();
    await renderApp("seojin");
    fireEvent.click(screen.getByRole("button", { name: "Opportunities" }));
    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(ask).toHaveBeenLastCalledWith(undefined);
  });
});
