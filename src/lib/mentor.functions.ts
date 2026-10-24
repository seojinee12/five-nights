import { createServerFn } from "@tanstack/react-start";
import { parseFindMoreInput } from "./findMore";
import { CalendarRequestSchema } from "./calendar-gemini";
import type { CalEvent } from "./launchpad";
import { defaultChips } from "./mentorChips";
import type { Turn, OpportunityLists } from "./mentor.server";

type ChatBody = {
  message: string;
  previous?: string;
  student: {
    name: string;
    major: string;
    status: "on-track" | "behind" | "ahead";
    statusNote: string;
    focus: ("academic" | "career" | "project" | "fun")[];
    courses: { code: string; name: string; units: number; grade?: string }[];
    events: { day: number; start: number; end: number; title: string; kind: "class" | "task" | "life" }[];
    tasks: { id: string; title: string; category: string; due?: string; hours?: number; priority?: string; timed: boolean }[];
    weeklyTargets: { label: string; hours: number; done: number }[];
    longTerm: { id: string; text: string; horizon: string }[];
  };
};

type MaterialBody = { name: string; mime: string; base64?: string; text?: string; studentName: string; major: string };

export const mentorChat = createServerFn({ method: "POST" })
  .validator((data: ChatBody) => data)
  .handler(async ({ data }): Promise<Turn> => {
    try {
      const { chatWithMentor } = await import("./mentor.server");
      return await chatWithMentor(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Mentor failed";
      return { reply: `The assistant could not finish that. ${message} Nothing was changed.`, patch: null, choices: defaultChips() };
    }
  });

export const readMaterial = createServerFn({ method: "POST" })
  .validator((data: MaterialBody) => data)
  .handler(async ({ data }): Promise<Turn> => {
    const { readMaterial: read } = await import("./mentor.server");
    return read(data);
  });

/** Gemini reads an uploaded calendar. events is null when it could not be used; the client then falls back to the plain parser. */
export const parseCalendarWithGemini = createServerFn({ method: "POST" })
  .validator((data: unknown) => CalendarRequestSchema.parse(data))
  .handler(async ({ data }): Promise<{ events: CalEvent[] | null }> => {
    try {
      const { calendarEventsFromGemini } = await import("./mentor.server");
      return { events: await calendarEventsFromGemini(data) };
    } catch {
      return { events: null };
    }
  });

export const sourceOpportunities = createServerFn({ method: "GET" }).handler(async (): Promise<OpportunityLists | null> => {
  const { loadOpportunities } = await import("./mentor.server");
  return loadOpportunities();
});

/** Asks for additional opportunities, skipping the ones in `exclude`. null means it could not search right now. */
export const findMoreOpportunities = createServerFn({ method: "POST" })
  .validator((data: unknown) => parseFindMoreInput(data))
  .handler(async ({ data }): Promise<OpportunityLists | null> => {
    try {
      const { findMoreOpportunities: find } = await import("./mentor.server");
      return await find(data);
    } catch {
      return null;
    }
  });
