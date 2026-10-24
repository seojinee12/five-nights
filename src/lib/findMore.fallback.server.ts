import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  dropExcluded,
  findMorePrompt,
  parseJsonObject,
  sanitizeFoundItems,
  type FindMoreInput,
  type FoundOpportunity,
} from "./findMore";

/**
 * Server-only backup for "Find more". If the primary search can't answer, this asks a second
 * service for the same thing. The user never sees which one answered.
 */

type Lists = { research: FoundOpportunity[]; projects: FoundOpportunity[] };

const BACKUP_URL = "https://api.x.ai/v1/chat/completions";
const BACKUP_MODEL = "grok-4.7";
const TIMEOUT_MS = 90_000;

function envValue(name: string): string {
  if (process.env[name]) return process.env[name] as string;
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx < 0) continue;
      if (trimmed.slice(0, idx).trim() !== name) continue;
      let value = trimmed.slice(idx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return value;
    }
  } catch {
    return "";
  }
  return "";
}

/**
 * Asks the backup service for additional opportunities. It cannot search the web here, so only
 * well-formed items with an official-looking https link survive, minus anything already shown.
 * Returns null when there is no key, the call fails, or the reply can't be read.
 */
export async function findMoreWithBackup(input: FindMoreInput): Promise<Lists | null> {
  const key = envValue("XAI_API_KEY");
  if (!key) return null;
  let response: Response;
  try {
    response = await fetch(BACKUP_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: BACKUP_MODEL,
        temperature: 0.2,
        reasoning_effort: "low",
        max_completion_tokens: 3000,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'Reply with strict JSON only: {"research":[{"name":"","sub":"","what":"","url":""}],"projects":[{"name":"","sub":"","what":"","url":""}]}',
          },
          { role: "user", content: findMorePrompt(input, { search: false }) },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!response.ok) {
    await response.text().catch(() => "");
    return null;
  }
  let text = "";
  try {
    const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    text = payload.choices?.[0]?.message?.content ?? "";
  } catch {
    return null;
  }
  const parsed = parseJsonObject(text);
  if (!parsed || typeof parsed !== "object") return null;
  const raw = parsed as { research?: unknown; projects?: unknown };
  const research = dropExcluded(sanitizeFoundItems(raw.research), input.exclude);
  const projects = dropExcluded(sanitizeFoundItems(raw.projects), [
    ...input.exclude,
    ...research.flatMap((r) => [r.name, r.url]),
  ]);
  return { research, projects };
}

/** Runs the primary search; on null or a thrown error, tries the backup. Null only if both fail. */
export async function findMoreWithFallback(
  input: FindMoreInput,
  primary: (input: FindMoreInput) => Promise<Lists | null>,
): Promise<Lists | null> {
  try {
    const first = await primary(input);
    if (first) return first;
  } catch {
    // fall through to the backup
  }
  try {
    return await findMoreWithBackup(input);
  } catch {
    return null;
  }
}
