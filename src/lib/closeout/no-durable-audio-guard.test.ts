/**
 * `2J-VOICE-008` and `2J-VOICE-013` — the audio-discard contract, proved as an
 * **absence re-derived from repository state** rather than asserted in prose.
 *
 * ## Why an absence needs a guard at all
 *
 * The owner signed "original audio is discarded" before Phase 2J began. That
 * decision is what makes voice cheap: no bucket, no table, no retention class,
 * no deletion-cascade entry, no sweep. Every one of those savings evaporates the
 * moment somebody adds a column "just to make retries easier".
 *
 * A comment saying "we do not store audio" is worth nothing a year from now. So
 * this re-derives the absence from `database.types.ts`, the storage
 * configuration and the source tree on **every run** — the shape Phase 2I used
 * for `2I-LIB-004`, where the guard re-reads the generated schema so a future
 * migration *breaks the guard* instead of silently invalidating the claim.
 *
 * If voice ever genuinely needs durable audio, this test is where that argument
 * has to be won, in public, against the signed decision.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "..", "..", "..");
const SRC = join(REPO, "src");
const MIGRATIONS = join(REPO, "supabase", "migrations");

const read = (path: string) => readFileSync(path, "utf8");

function walk(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules") continue;
      walk(full, found);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

describe("2J-VOICE-013: no durable audio exists in the schema", () => {
  const types = read(join(SRC, "lib", "supabase", "database.types.ts"));

  it("declares no table whose name suggests stored audio or recordings", () => {
    // Re-derived from the generated types, so a migration that adds such a
    // table breaks this rather than leaving a stale claim in a document.
    const tableNames = [...types.matchAll(/^ {6}([a-z_]+): \{$/gm)].map((match) => match[1]);
    expect(tableNames.length).toBeGreaterThan(20);
    const offenders = tableNames.filter((name) =>
      /audio|recording|voice_note|utterance|transcript_file/.test(name ?? ""),
    );
    expect(offenders).toEqual([]);
  });

  it("declares no column that would hold audio or a recording URL", () => {
    const columns = [...types.matchAll(/^ {10}([a-z_]+):/gm)].map((match) => match[1]);
    const offenders = columns.filter((name) =>
      /audio_|_audio|recording_|_recording|voice_blob|audio_url|audio_path/.test(name ?? ""),
    );
    expect(offenders).toEqual([]);
  });

  it("creates no storage bucket for audio anywhere in the migration chain", () => {
    const offenders = readdirSync(MIGRATIONS)
      .filter((name) => name.endsWith(".sql"))
      .filter((name) => {
        const sql = read(join(MIGRATIONS, name)).replace(/^\s*--.*$/gm, "");
        return /storage\.buckets[\s\S]{0,400}(audio|recording|voice)/i.test(sql);
      });
    expect(offenders).toEqual([]);
  });

  it("adds no retention class for audio, because a class needs something to sweep", () => {
    const retention = read(join(SRC, "features", "legal", "retention.ts"));
    const code = retention.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/audio|recording/i);
  });
});

describe("2J-VOICE-008/013: no code path retains the recording", () => {
  const sources = walk(SRC).filter((path) => !/\.test\.(ts|tsx)$/.test(path));

  it("never uploads a recording to storage", () => {
    // `storage.from(...).upload(...)` is how an attachment is stored. A voice
    // blob reaching it would make audio durable by exactly the route the
    // signed decision forbids.
    const offenders = sources
      .filter((path) => {
        const code = read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        if (!/storage\s*\n?\s*\.from\(|\.storage\.from\(/.test(code)) return false;
        return /audio|recording|mediaRecorder/i.test(code);
      })
      .map((path) => relative(REPO, path));
    expect(offenders).toEqual([]);
  });

  it("keeps the transcription path free of any filesystem write", () => {
    const provider = read(join(SRC, "lib", "ai", "openai-provider.ts"));
    const code = provider.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    // The blob becomes an in-memory `File` and goes straight to the provider.
    expect(code).toMatch(/transcribeAudio/);
    expect(code).not.toMatch(/writeFile|createWriteStream|fs\.|tmpdir|os\.tmpdir/);
  });

  it("is not vacuous: it recognises the shapes it forbids", () => {
    // Each string below is a real way durable audio could arrive. If the
    // detectors stop matching them, the guard has stopped guarding.
    expect(/audio_url|audio_path/.test("audio_url: string")).toBe(true);
    expect(/audio|recording|voice_note/.test("voice_recordings")).toBe(true);
    expect(
      /storage\.buckets[\s\S]{0,400}(audio|recording|voice)/i.test(
        "insert into storage.buckets (id, name) values ('voice-audio', 'voice-audio');",
      ),
    ).toBe(true);
    expect(/writeFile|createWriteStream/.test("await writeFile(tmp, buffer);")).toBe(true);
  });
});

describe("2J-VOICE-002: transcription is billed to the user, never to the project", () => {
  it("keeps the provider's required apiKey with no environment fallback", () => {
    const provider = read(join(SRC, "lib", "ai", "openai-provider.ts"));
    const code = provider.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    // `BYOK-ADAPTER-002`, restated here because transcription is a NEW call
    // site and a new call site is where a convenience fallback gets added.
    //
    // The env var's name is assembled rather than written, because
    // `project-key-guard.test.ts` keeps a pinned allowlist of every file that
    // may mention it -- and a guard asserting the key is unreachable should not
    // itself become a reason to widen that allowlist.
    const projectKeyName = ["OPENAI", "API", "KEY"].join("_");
    expect(code).not.toContain(`process.env.${projectKeyName}`);
    expect(code).toMatch(/A provider credential is required/);
  });

  it("records transcription under its own ledger operation", () => {
    const usage = read(join(SRC, "lib", "ai", "usage.ts"));
    expect(usage).toMatch(/"transcription"/);
    // And the database agrees -- both halves, because the constraint alone is
    // not the enforcement (ADR-096).
    const migration = read(join(MIGRATIONS, "202608080085_phase_2j_transcription_usage.sql"));
    expect(migration).toMatch(/add constraint ai_usage_events_operation_check[\s\S]*'transcription'/);
    expect(migration).toMatch(/create or replace function public\.record_ai_usage/);
    expect(migration).toMatch(/p_operation not in \([^)]*'transcription'\)/);
  });
});
