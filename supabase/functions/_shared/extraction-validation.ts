// Runtime validation for AI extraction output, for the Deno worker.
//
// WHY THIS EXISTS
// `supabase/functions/process-jobs/entry.ts` is the only production path that
// persists model output. Before this module it did `JSON.parse(...) as
// Extraction` — an unchecked assertion — while the strict Zod schema
// (`src/lib/ai/extraction-schema.ts`) validated only the *read* side, where a
// mismatch silently degrades the interpretation to `null` in the UI. The AI
// boundary was the loosest-validated write path in the system, which
// `docs/ENGINEERING_STANDARDS.md` explicitly forbids.
//
// WHY NOT `npm:zod`
// A dependency-free module can be imported by BOTH runtimes: Deno resolves the
// relative `.ts` path, and Vitest imports it directly. That is what makes
// `src/lib/ai/extraction-parity.test.ts` possible — a behavioural test that
// runs one corpus through this validator and through the Zod schema and fails
// when the two disagree. A `npm:` specifier cannot be imported by Vitest, so a
// zod-based validator would only ever be verifiable by a manual deploy.
//
// SOURCE OF TRUTH
// `src/lib/ai/extraction-schema.ts`. Every bound here mirrors it. The parity
// test is the enforcement; this comment is not.
//
// ERROR CONTENT
// Issues carry a field path and a machine code only — never a value. Model
// output is untrusted and must not travel into logs, `jobs.error`, or
// analytics.

export const EXTRACTION_CONCEPTS = [
  "raw_record",
  "completed_activity",
  "task",
  "subtask",
  "reminder",
  "appointment",
  "reference",
  "decision",
  "idea",
  "person_note",
  "project_note",
  "pending_question",
  "blocker",
  "dependency",
  "status_update",
  "lasting_preference",
  "personal_memory",
  "request_received",
  "waiting_for_third_party",
] as const;

export const EXTRACTION_LANGUAGES = ["pt-BR", "en"] as const;

export type ExtractionConcept = (typeof EXTRACTION_CONCEPTS)[number];
export type ExtractionLanguage = (typeof EXTRACTION_LANGUAGES)[number];

export type EntityCandidateValue = {
  name: string;
  confidence: number;
  evidence: string;
  inferred: boolean;
};

export type TaskCandidateValue = {
  title: string;
  description: string | null;
  dueAt: string | null;
  waitingOn: string | null;
  parentIndex: number | null;
  confidence: number;
  explicit: boolean;
};

export type PendingQuestionValue = {
  question: string;
  reason: string;
  confidence: number;
};

export type ExtractionValue = {
  language: ExtractionLanguage;
  occurredAt: string;
  isRetroactive: boolean;
  summary: string;
  concepts: ExtractionConcept[];
  contexts: EntityCandidateValue[];
  organizations: EntityCandidateValue[];
  projects: EntityCandidateValue[];
  people: EntityCandidateValue[];
  taskCandidates: TaskCandidateValue[];
  pendingQuestions: PendingQuestionValue[];
  confidence: number;
};

export type ExtractionIssue = {
  /** Dotted field path, e.g. `taskCandidates.2.dueAt`. */
  path: string;
  /** Machine-readable reason. Never contains the offending value. */
  code: string;
};

export type ExtractionValidationResult =
  | { ok: true; value: ExtractionValue }
  | { ok: false; issues: ExtractionIssue[] };

const CONCEPT_SET: ReadonlySet<string> = new Set(EXTRACTION_CONCEPTS);
const LANGUAGE_SET: ReadonlySet<string> = new Set(EXTRACTION_LANGUAGES);

// ISO 8601 instant with a required timezone designator. Seconds and fractional
// seconds are optional, matching the source-of-truth schema's accepted shape.
const ISO_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

function isPlainObject(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

/**
 * Calendar-real ISO instant. The regex alone would accept 2026-02-30, so the
 * date parts are re-derived from a UTC Date and compared.
 */
export function isIsoInstant(input: unknown): input is string {
  if (typeof input !== "string") return false;
  const match = ISO_INSTANT.exec(input);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (hour > 23 || minute > 59 || second > 59) return false;

  const asUtc = new Date(Date.UTC(year, month - 1, day));
  return (
    asUtc.getUTCFullYear() === year &&
    asUtc.getUTCMonth() === month - 1 &&
    asUtc.getUTCDate() === day
  );
}

type Collector = { issues: ExtractionIssue[] };

function fail(collector: Collector, path: string, code: string): void {
  collector.issues.push({ path, code });
}

/** Trimmed string within an inclusive length range, mirroring `.trim().min().max()`. */
function readString(
  collector: Collector,
  raw: unknown,
  path: string,
  min: number,
  max: number,
): string | null {
  if (typeof raw !== "string") {
    fail(collector, path, "expected_string");
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed.length < min) {
    fail(collector, path, "too_short");
    return null;
  }
  if (trimmed.length > max) {
    fail(collector, path, "too_long");
    return null;
  }
  return trimmed;
}

function readNullableString(
  collector: Collector,
  raw: unknown,
  path: string,
  min: number,
  max: number,
): string | null | undefined {
  if (raw === null) return null;
  const value = readString(collector, raw, path, min, max);
  return value === null ? undefined : value;
}

/** Finite number within an inclusive range, mirroring `z.number().min().max()`. */
function readNumber(
  collector: Collector,
  raw: unknown,
  path: string,
  min: number,
  max: number,
): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    fail(collector, path, "expected_number");
    return null;
  }
  if (raw < min || raw > max) {
    fail(collector, path, "out_of_range");
    return null;
  }
  return raw;
}

function readBoolean(collector: Collector, raw: unknown, path: string): boolean | null {
  if (typeof raw !== "boolean") {
    fail(collector, path, "expected_boolean");
    return null;
  }
  return raw;
}

function readArray(collector: Collector, raw: unknown, path: string, min: number): unknown[] | null {
  if (!Array.isArray(raw)) {
    fail(collector, path, "expected_array");
    return null;
  }
  if (raw.length < min) {
    fail(collector, path, "too_short");
    return null;
  }
  return raw;
}

function readEntityCandidates(
  collector: Collector,
  raw: unknown,
  path: string,
): EntityCandidateValue[] {
  const items = readArray(collector, raw, path, 0);
  if (items === null) return [];

  const values: EntityCandidateValue[] = [];
  items.forEach((item, index) => {
    const itemPath = `${path}.${index}`;
    if (!isPlainObject(item)) {
      fail(collector, itemPath, "expected_object");
      return;
    }
    const name = readString(collector, item.name, `${itemPath}.name`, 1, 160);
    const confidence = readNumber(collector, item.confidence, `${itemPath}.confidence`, 0, 1);
    const evidence = readString(collector, item.evidence, `${itemPath}.evidence`, 1, 500);
    const inferred = readBoolean(collector, item.inferred, `${itemPath}.inferred`);
    if (name === null || confidence === null || evidence === null || inferred === null) return;
    values.push({ name, confidence, evidence, inferred });
  });
  return values;
}

function readTaskCandidates(
  collector: Collector,
  raw: unknown,
  path: string,
): TaskCandidateValue[] {
  const items = readArray(collector, raw, path, 0);
  if (items === null) return [];

  const values: TaskCandidateValue[] = [];
  items.forEach((item, index) => {
    const itemPath = `${path}.${index}`;
    if (!isPlainObject(item)) {
      fail(collector, itemPath, "expected_object");
      return;
    }

    const title = readString(collector, item.title, `${itemPath}.title`, 1, 240);
    const description = readNullableString(
      collector,
      item.description,
      `${itemPath}.description`,
      0,
      2000,
    );
    const waitingOn = readNullableString(collector, item.waitingOn, `${itemPath}.waitingOn`, 0, 160);
    const confidence = readNumber(collector, item.confidence, `${itemPath}.confidence`, 0, 1);
    const explicit = readBoolean(collector, item.explicit, `${itemPath}.explicit`);

    let dueAt: string | null | undefined;
    if (item.dueAt === null) {
      dueAt = null;
    } else if (isIsoInstant(item.dueAt)) {
      dueAt = item.dueAt;
    } else {
      fail(collector, `${itemPath}.dueAt`, "expected_iso_instant");
      dueAt = undefined;
    }

    let parentIndex: number | null | undefined;
    if (item.parentIndex === null) {
      parentIndex = null;
    } else if (typeof item.parentIndex === "number" && Number.isInteger(item.parentIndex) && item.parentIndex >= 0) {
      parentIndex = item.parentIndex;
    } else {
      fail(collector, `${itemPath}.parentIndex`, "expected_non_negative_integer");
      parentIndex = undefined;
    }

    if (
      title === null ||
      description === undefined ||
      waitingOn === undefined ||
      confidence === null ||
      explicit === null ||
      dueAt === undefined ||
      parentIndex === undefined
    ) {
      return;
    }

    values.push({ title, description, dueAt, waitingOn, parentIndex, confidence, explicit });
  });
  return values;
}

function readPendingQuestions(
  collector: Collector,
  raw: unknown,
  path: string,
): PendingQuestionValue[] {
  const items = readArray(collector, raw, path, 0);
  if (items === null) return [];

  const values: PendingQuestionValue[] = [];
  items.forEach((item, index) => {
    const itemPath = `${path}.${index}`;
    if (!isPlainObject(item)) {
      fail(collector, itemPath, "expected_object");
      return;
    }
    const question = readString(collector, item.question, `${itemPath}.question`, 1, 500);
    const reason = readString(collector, item.reason, `${itemPath}.reason`, 1, 500);
    const confidence = readNumber(collector, item.confidence, `${itemPath}.confidence`, 0, 1);
    if (question === null || reason === null || confidence === null) return;
    values.push({ question, reason, confidence });
  });
  return values;
}

/**
 * Validate parsed model output against the extraction contract.
 *
 * Unknown properties are ignored rather than rejected, mirroring the
 * source-of-truth Zod schema (the provider's own JSON Schema already sets
 * `additionalProperties: false`, so extra keys cannot arrive from OpenAI).
 */
export function validateExtraction(input: unknown): ExtractionValidationResult {
  const collector: Collector = { issues: [] };

  if (!isPlainObject(input)) {
    return { ok: false, issues: [{ path: "", code: "expected_object" }] };
  }

  const language =
    typeof input.language === "string" && LANGUAGE_SET.has(input.language)
      ? (input.language as ExtractionLanguage)
      : null;
  if (language === null) fail(collector, "language", "expected_enum");

  const occurredAt = isIsoInstant(input.occurredAt) ? input.occurredAt : null;
  if (occurredAt === null) fail(collector, "occurredAt", "expected_iso_instant");

  const isRetroactive = readBoolean(collector, input.isRetroactive, "isRetroactive");
  const summary = readString(collector, input.summary, "summary", 1, 2000);

  const rawConcepts = readArray(collector, input.concepts, "concepts", 1);
  const concepts: ExtractionConcept[] = [];
  if (rawConcepts !== null) {
    rawConcepts.forEach((concept, index) => {
      if (typeof concept === "string" && CONCEPT_SET.has(concept)) {
        concepts.push(concept as ExtractionConcept);
        return;
      }
      fail(collector, `concepts.${index}`, "expected_enum");
    });
  }

  const contexts = readEntityCandidates(collector, input.contexts, "contexts");
  const organizations = readEntityCandidates(collector, input.organizations, "organizations");
  const projects = readEntityCandidates(collector, input.projects, "projects");
  const people = readEntityCandidates(collector, input.people, "people");
  const taskCandidates = readTaskCandidates(collector, input.taskCandidates, "taskCandidates");
  const pendingQuestions = readPendingQuestions(collector, input.pendingQuestions, "pendingQuestions");
  const confidence = readNumber(collector, input.confidence, "confidence", 0, 1);

  if (collector.issues.length > 0) {
    return { ok: false, issues: collector.issues };
  }

  return {
    ok: true,
    value: {
      language: language as ExtractionLanguage,
      occurredAt: occurredAt as string,
      isRetroactive: isRetroactive as boolean,
      summary: summary as string,
      concepts,
      contexts,
      organizations,
      projects,
      people,
      taskCandidates,
      pendingQuestions,
      confidence: confidence as number,
    },
  };
}

/** Compact, value-free description of why validation failed. Safe to log. */
export function describeExtractionIssues(issues: readonly ExtractionIssue[], limit = 8): string {
  const shown = issues
    .slice(0, limit)
    .map((issue) => (issue.path === "" ? issue.code : `${issue.path}:${issue.code}`))
    .join(", ");
  return issues.length > limit ? `${shown}, +${issues.length - limit} more` : shown;
}
