/**
 * Life Brain B.8 (ADR-163) — the model picks; the sentence stays ours.
 *
 * The 2K suggestion guard still forbids any model call in the derivation, the
 * row, the chip and the chat page, and B.8 does not loosen it: the call lives in
 * `model-picks.ts`, reached only through one Server Action that one client
 * component fires. This guard holds the three rules ADR-163 adds:
 *
 *  1. what reaches the cache is `{category, id}` and nothing else;
 *  2. the page never waits for the model — it reads the cache and nothing more;
 *  3. the client hands the action a locale and nothing else, so it cannot choose
 *     the candidates, the day or the owner.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const REPO = process.cwd();
const read = (path: string) => readFileSync(join(REPO, path), "utf8");

const MODEL_PICKS = "src/features/conversation-cards/model-picks.ts";
const ACTION = "src/features/conversation-cards/suggestion-pick-action.ts";
const TRIGGER = "src/features/conversation-cards/suggestion-pick-trigger.tsx";
const CHAT_PAGE = "src/app/[locale]/app/chat/page.tsx";

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) found.push(path);
  }
  return found;
}

describe("Life Brain B.8 — the model picks, the sentence stays ours", () => {
  it("writes only {category, id} pairs to the cache", () => {
    const source = read(MODEL_PICKS);
    const call = source.match(/rpc\("record_conversation_suggestion_picks",[\s\S]*?\}\);/)?.[0];
    expect(call, "the cache writer call was not found").toBeDefined();
    expect(call).toContain("p_picks: picks.map((pick) => ({ category: pick.category, id: pick.id }))");
    expect(call).not.toMatch(/\bname\b|label|sentence|text/);
  });

  it("keeps the model call out of the page: it reads the cache and fires nothing itself", () => {
    const page = read(CHAT_PAGE);
    expect(page).toContain("readTodaysPicks(");
    // An unreadable cache (`undefined`) must not mount the trigger: nothing could be stored.
    expect(page).toContain("pickPending = picks === null;");
    expect(page).not.toMatch(/pickTodaysSuggestions|refreshTodaysSuggestionPicks|suggestion-pick-action/);
    expect(page).not.toMatch(/\bafter\(/);
  });

  it("reaches the action from exactly one client component", () => {
    const importers = sourceFiles(join(REPO, "src"))
      .filter((path) => readFileSync(path, "utf8").includes("suggestion-pick-action"))
      .map((path) => relative(REPO, path).replaceAll("\\", "/"));
    expect(importers).toEqual([TRIGGER]);
    expect(read(TRIGGER).startsWith('"use client";')).toBe(true);
  });

  it("takes a locale from the client and reads everything else again under RLS", () => {
    const action = read(ACTION);
    expect(action.startsWith('"use server";')).toBe(true);
    expect(action).toMatch(/export async function refreshTodaysSuggestionPicks\(locale: string\): Promise<void>/);
    expect(action).toContain("requireUser(");
    expect(action).toContain("loadSuggestionInputs(");
    expect(action).toContain("suggestionCandidates(");
  });

  it("records the spend as `background`, before the cache", () => {
    const source = read(MODEL_PICKS);
    const ledger = source.indexOf('operation: "background"');
    const cache = source.indexOf("await recordPicks(supabase, localDay, picks, answer.model)");
    expect(ledger).toBeGreaterThan(0);
    expect(cache).toBeGreaterThan(ledger);
  });
});
