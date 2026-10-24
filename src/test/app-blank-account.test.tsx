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
});
