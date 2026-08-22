import { readFileSync } from "node:fs";
import path from "node:path";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { beforeAll, describe, expect, it } from "vitest";

// `extraction-schema.ts` is the contract module and imports only Zod, so no
// `server-only` shim is needed here — the provider class, which does need one,
// is deliberately not imported: this lane calls the endpoint the *worker* calls.
import { entryExtractionSchema, type EntryExtraction } from "./extraction-schema";

/**
 * **The entity-classification lane — the only place the fix can actually be
 * proved.**
 *
 * ## Why this file exists
 *
 * The defect was a *model* defect. On the owner's reported record the shipped
 * prompt (`2026-07-25.1`) returned, for
 *
 *   "Preciso desenvolver um relatório de Sweepstakes pra Garo. Ele faz parte da
 *    Royal Caribbean. Coloca o prazo pra daqui a 15 dias (joga pra sexta-feira)."
 *
 * `people: []`, `organizations: ["Royal Caribbean"]` and
 * `projects: ["Relatório de Sweepstakes para Garo"]` — the task title filed as a
 * project, and the person missing entirely. Every structural test in the
 * repository was green throughout, and correctly so: the schema was satisfied.
 * A schema test can only say the shape is legal, never that the contents are
 * right, so a fix asserted only against the schema would be a fix asserted
 * against the one thing that never broke.
 *
 * ## What keeps it honest
 *
 * - The prompt is **read from the deployed worker source**, not restated here.
 *   A probe carrying its own copy of the prompt measures the probe.
 * - The examples inside that prompt are lexically disjoint from the sentences
 *   below — `extraction-contract.test.ts` asserts that the prompt contains no
 *   "Garo", "Royal Caribbean" or "Sweepstakes" — so this lane measures
 *   generalization rather than recall of an example.
 * - The primary sentence is sampled more than once. One sample of a stochastic
 *   system is an anecdote.
 * - Every returned name is checked against the entry text, so a build that
 *   improved recall by inventing people fails here rather than looking fixed.
 *
 * ## Cost, and why this is opt-in
 *
 * `ADR-059`: `vitest.config.ts` excludes `*.remote.test.ts`, so CI never runs
 * this and never needs a credential. It runs deliberately, locally, with
 *
 *     npm run test:remote:extraction
 *
 * against `BYOK_VALIDATION_OPENAI_API_KEY` — the dedicated, budgeted validation
 * key `src/features/byok/live-validation.remote.test.ts` already uses, never a
 * user's BYOK credential and never a process-wide project key (`BYOK-GUARD-001`).
 * Five completions per run, each bounded by `max_output_tokens`.
 */

const SECRET_NAME = "BYOK_VALIDATION_OPENAI_API_KEY";
const MODEL = "gpt-5.6-luna";
const TIMEZONE = "America/Sao_Paulo";
/** Mirrors `EXTRACTION_MAX_OUTPUT_TOKENS` in `openai-provider.ts`. */
const MAX_OUTPUT_TOKENS = 4_000;
/** How many times the reported sentence is sampled. */
const SAMPLES = 3;

const REPO = path.resolve(__dirname, "..", "..", "..");

/**
 * The prompt the **deployed worker** sends, extracted from its source.
 *
 * `supabase/functions/process-jobs/entry.ts` cannot be imported (Deno imports),
 * and `openai-provider.ts` is held byte-identical to it by
 * `extraction-contract.test.ts`, so reading either proves the same text. The
 * worker is read because the worker is what runs in production.
 */
function shippedPrompt(): string {
  const source = readFileSync(path.join(REPO, "supabase", "functions", "process-jobs", "entry.ts"), "utf8");
  const match = /const SYSTEM_PROMPT = `([\s\S]*?)`;/.exec(source);
  if (!match) throw new Error("SYSTEM_PROMPT could not be read from the worker source");
  return match[1];
}

function readValidationKey(): string | null {
  // Read from `.env.local` rather than `process.env`: Vitest does not load it,
  // and telling the operator to export the variable puts the key in a shell
  // history. Same rule, same reason, as the BYOK validation lane.
  try {
    const body = readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8");
    const match = body.match(new RegExp(`^${SECRET_NAME}=(.*)$`, "m"));
    const value = match?.[1]?.trim() ?? "";
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

const rawKey = readValidationKey();
let client: OpenAI;

beforeAll(() => {
  if (rawKey) client = new OpenAI({ apiKey: rawKey, maxRetries: 0, timeout: 120_000 });
});

/** The user message `extractEntry` builds, with no registered entities at all. */
function userMessage(entry: string): string {
  return [
    "Locale: pt-BR",
    `IANA timezone: ${TIMEZONE}`,
    `Current time: ${new Date().toISOString()}`,
    // Deliberately empty. An owner with no registered people is the condition
    // the defect appeared under, and the prompt now says explicitly that this
    // list is not the set of people the model may return.
    "Known user context: none",
    `Entry data:\n<entry>${entry}</entry>`,
  ].join("\n\n");
}

async function extract(entry: string): Promise<EntryExtraction> {
  const response = await client.responses.parse({
    model: MODEL,
    reasoning: { effort: "low" },
    max_output_tokens: MAX_OUTPUT_TOKENS,
    input: [
      { role: "system", content: shippedPrompt() },
      { role: "user", content: userMessage(entry) },
    ],
    text: { format: zodTextFormat(entryExtractionSchema, "entry_extraction") },
  });
  if (!response.output_parsed) throw new Error("the provider returned no structured extraction");
  // Provenance, for the same reason `ai_usage_events` records it: the id sent is
  // an alias, and the id that answered is the fact. A lane that reports "the
  // model classifies correctly" without saying which model did is unciteable.
  answeredBy.add(response.model ?? MODEL);
  return entryExtractionSchema.parse(response.output_parsed);
}

const answeredBy = new Set<string>();

const names = (candidates: EntryExtraction["people"]) => candidates.map((candidate) => candidate.name);

/** Comparison that survives casing and accent folding, but not invention. */
function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("und");
}

/**
 * The wrapper the model puts *around* a quotation, removed — and nothing else.
 *
 * This is a **probe** defect that was found by running the lane, not a product
 * one, and it is worth naming precisely because the first instinct was the
 * opposite. The production record read at the start of this work carries
 *
 *     "evidence": "“Ele faz parte da Royal Caribbean.”"
 *
 * — typographic quotes the entry itself does not contain. So a strict substring
 * check calls a **verbatim** quotation an invention, and does it only sometimes,
 * because whether the model quotes is not deterministic. A lane that fails at
 * random on a non-issue is worse than no lane: it teaches you to rerun it.
 *
 * Only the outermost quote and sentence punctuation come off, and only from the
 * ends. A paraphrase, a summary or a fabricated phrase still fails, which is the
 * whole point of the control.
 */
const WRAPPERS = /^[\s"'‘’“”«»().,;:…-]+|[\s"'‘’“”«»().,;:…-]+$/gu;

function unwrap(value: string): string {
  return value.replace(WRAPPERS, "");
}

function mentions(haystack: string, needle: string): boolean {
  return fold(haystack).includes(fold(unwrap(needle)));
}

/** Nothing named may be absent from the entry — the anti-invention control. */
function assertGrounded(entry: string, extraction: EntryExtraction) {
  for (const [field, candidates] of [
    ["people", extraction.people],
    ["organizations", extraction.organizations],
  ] as const) {
    for (const candidate of candidates) {
      expect(
        mentions(entry, candidate.name),
        `${field} contains "${candidate.name}", which the entry never says`,
      ).toBe(true);
      expect(
        mentions(entry, candidate.evidence),
        `the evidence for "${candidate.name}" is not a phrase from the entry: ${JSON.stringify(candidate.evidence)}`,
      ).toBe(true);
    }
  }
}


/**
 * The result of a call this lane may never have made.
 *
 * Without the credential the `beforeAll` hooks return without calling anything,
 * and every assertion below would otherwise die on `undefined` with a
 * `TypeError` that says nothing about why. An opt-in lane must fail *loudly and
 * legibly* when it is not configured — never quietly skip, because a skipped
 * classification lane and a passing one look identical in a summary.
 */
function required<T>(value: T | undefined, what: string): T {
  expect(
    value,
    `${what} was never produced: ${SECRET_NAME} is missing from .env.local, so this lane made no provider call and proves nothing`,
  ).toBeDefined();
  return value as T;
}

const REPORTED_ENTRY =
  "Preciso desenvolver um relatório de Sweepstakes pra Garo. Ele faz parte da Royal Caribbean. Coloca o prazo pra daqui a 15 dias (joga pra sexta-feira).";

/**
 * The probe's own comparison, checked without spending a call.
 *
 * `assertGrounded` is the control that stops a build from buying recall by
 * inventing people, so the comparison it rests on needs a control of its own —
 * otherwise a normalization loosened to silence a flake would quietly disarm it,
 * and every subsequent green run would mean less than it looked like.
 */
describe("the anti-invention comparison, before any call is made", () => {
  const entry = REPORTED_ENTRY;

  it("accepts a verbatim quotation the model wrapped in typographic quotes", () => {
    // Byte-for-byte the shape read from the reported production record.
    expect(mentions(entry, "“Ele faz parte da Royal Caribbean.”")).toBe(true);
    expect(mentions(entry, "“Preciso desenvolver um relatório de Sweepstakes pra Garo.”")).toBe(true);
  });

  it("accepts the same phrase unquoted, and with a trailing period either way", () => {
    expect(mentions(entry, "faz parte da Royal Caribbean")).toBe(true);
    expect(mentions(entry, "Ele faz parte da Royal Caribbean.")).toBe(true);
  });

  it("still refuses a paraphrase, a summary and an outright fabrication", () => {
    // The three ways the loosening could have gone too far.
    expect(mentions(entry, "o cliente do relatório trabalha em uma empresa de cruzeiros")).toBe(false);
    expect(mentions(entry, "menciona a organização")).toBe(false);
    expect(mentions(entry, "Ele é diretor da Royal Caribbean")).toBe(false);
    // And a name that is simply not there.
    expect(mentions(entry, "Marina")).toBe(false);
  });
});

describe("the extraction lane has a credential", () => {
  it(`has ${SECRET_NAME} available`, () => {
    // Presence only — never the length, never a prefix, never a hash.
    expect(
      rawKey !== null,
      `${SECRET_NAME} must be present in .env.local to run this lane`,
    ).toBe(true);
  });
});

describe("a person named beside their organization is classified as a person", () => {
  const results: EntryExtraction[] = [];

  beforeAll(async () => {
    if (!rawKey) return;
    for (let sample = 0; sample < SAMPLES; sample += 1) {
      results.push(await extract(REPORTED_ENTRY));
    }
  }, 180_000);

  it(`returns Garo in people on every one of ${SAMPLES} samples`, () => {
    expect(
      results.length,
      `only ${results.length} of ${SAMPLES} samples were taken: ${SECRET_NAME} is missing from .env.local, so this lane made no provider call and proves nothing`,
    ).toBe(SAMPLES);
    for (const [sample, extraction] of results.entries()) {
      expect(
        names(extraction.people).some((name) => mentions(name, "Garo")),
        `sample ${sample}: people was ${JSON.stringify(names(extraction.people))}`,
      ).toBe(true);
    }
  });

  it("returns Royal Caribbean in organizations, and never as a person", () => {
    expect(results.length, "no sample was taken").toBe(SAMPLES);
    for (const [sample, extraction] of results.entries()) {
      expect(
        extraction.organizations.some((candidate) => mentions(candidate.name, "Royal Caribbean")),
        `sample ${sample}: organizations was ${JSON.stringify(extraction.organizations.map((c) => c.name))}`,
      ).toBe(true);
      expect(
        names(extraction.people).some((name) => mentions(name, "Caribbean")),
        `sample ${sample}: the organization was filed as a person`,
      ).toBe(false);
    }
  });

  it("does not file the requested deliverable as a project", () => {
    // The other half of the same defect: `projects` held
    // "Relatório de Sweepstakes para Garo", which is the task's title.
    expect(results.length, "no sample was taken").toBe(SAMPLES);
    for (const [sample, extraction] of results.entries()) {
      const projects = extraction.projects.map((candidate) => candidate.name);
      expect(
        projects.some((name) => mentions(name, "Sweepstakes") || mentions(name, "relatório")),
        `sample ${sample}: projects was ${JSON.stringify(projects)}`,
      ).toBe(false);
    }
  });

  it("still produces the task the entry asks for", () => {
    // The classification must not have been bought by extracting less.
    expect(results.length, "no sample was taken").toBe(SAMPLES);
    for (const [sample, extraction] of results.entries()) {
      expect(extraction.taskCandidates.length, `sample ${sample}: no task candidate`).toBeGreaterThan(0);
    }
  });

  it("invents no name and no evidence", () => {
    expect(results.length, "no sample was taken").toBe(SAMPLES);
    for (const extraction of results) assertGrounded(REPORTED_ENTRY, extraction);
  });
});

describe("an organization named on its own produces no person", () => {
  const entry = "Assinei hoje o contrato anual com a Latam Airlines e já paguei a primeira parcela.";
  let sampled: EntryExtraction | undefined;

  beforeAll(async () => {
    if (rawKey) sampled = await extract(entry);
  }, 120_000);

  it("returns the organization and an empty people array", () => {
    const extraction = required(sampled, "the organization-only extraction");
    expect(
      extraction.organizations.some((candidate) => mentions(candidate.name, "Latam")),
      `organizations was ${JSON.stringify(extraction.organizations.map((c) => c.name))}`,
    ).toBe(true);
    expect(names(extraction.people), "a person was invented from a company name").toEqual([]);
    assertGrounded(entry, extraction);
  });
});

describe("an unnamed individual becomes a question rather than a name", () => {
  const entry = "Preciso alinhar com o pessoal do jurídico antes de fechar a proposta na sexta.";
  let sampled: EntryExtraction | undefined;

  beforeAll(async () => {
    if (rawKey) sampled = await extract(entry);
  }, 120_000);

  it("names nobody, because the entry names nobody", () => {
    const extraction = required(sampled, "the unnamed-individual extraction");
    expect(
      names(extraction.people),
      `a group reference produced ${JSON.stringify(names(extraction.people))}`,
    ).toEqual([]);
    assertGrounded(entry, extraction);
  });
});

describe("provenance", () => {
  it("records exactly which model answered every call in this run", () => {
    // Written as an assertion rather than a log so it cannot be scrolled past,
    // and so a run that silently fell back to a different model is a failure.
    expect(
      [...answeredBy],
      `no call was made, or more than one model answered: ${JSON.stringify([...answeredBy])}`,
    ).toHaveLength(1);
    expect(
      [...answeredBy][0]?.startsWith(MODEL),
      `the model that answered was ${JSON.stringify([...answeredBy][0])}, not a build of ${MODEL}`,
    ).toBe(true);
    console.log(`
  model that answered: ${[...answeredBy][0]}  (requested: ${MODEL})
`);
  });
});
