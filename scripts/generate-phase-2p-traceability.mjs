/**
 * Phase 2P's traceability matrix, generated from the sources or refused.
 *
 * **No shebang, deliberately.** Every earlier phase's generator omits one, and
 * the reason is measured rather than stylistic: this module is imported by
 * `src/lib/closeout/phase-2p-traceability.test.ts`, and a leading `#!` line is
 * what makes Vite's transform fail to parse two `scripts/*.mjs` files on
 * Windows — the repository's recorded local baseline of failed *files* with
 * zero failed tests. `npm run docs:phase-2p:traceability` invokes it through
 * `node`, so the line buys nothing and costs a parse.
 *
 * `2P-CLOSE-001` asks for a matrix that classifies **every requirement exactly
 * once**. This reads the PRD (what was declared) and the slice acceptance
 * records (what was evidenced), applies the twelve refusals
 * `docs/reports/phase-2p/PHASE_2P_TRACEABILITY_CONTRACT.md` enumerates, and
 * either writes the matrix or refuses and says exactly why. It never writes a
 * partial matrix: a refusal means nothing is written at all, because a matrix
 * that is 86/87 correct is more dangerous than no matrix.
 *
 * ## The one structural difference from every earlier phase's generator
 *
 * Phases 2C … 2O wrote acceptance records that each carried a classification
 * section, so their generators could refuse a record that stated none. **Phase
 * 2P's records were not written that way**, and that is a measured fact rather
 * than an assumption: of the **eight that precede the closeout**, exactly three
 * carry a section this generator recognises —
 *
 * | Record | Section | Classifies |
 * |---|---|---|
 * | `SLICE_04` | `### Requirement classification` | `2P-AUTONOMY-001` … `-010` |
 * | `SLICE_05` | `## 12. Requirement classification` | `2P-SETTINGS-001` … `-008` |
 * | `SLICE_07` | `## 5. What each requirement is` | `2P-CALENDAR`/`2P-REMINDER` |
 *
 * The other six state their outcomes in prose. Refusing them would make this
 * generator unusable, and **rewriting them to add a section would edit records
 * the owner has instructed be preserved as written**. So the rule is inverted:
 * a record without a recognised section contributes nothing and that is legal,
 * while `2P-CLOSE-001` is enforced where it actually bites — every declared
 * requirement must end up classified exactly once, and the closeout record
 * carries whatever the earlier records did not.
 *
 * This still fails **closed**. If the closeout record's heading is misspelled,
 * its rows vanish, fifty-nine requirements become unclassified, and the run
 * refuses. Nothing passes by being absent.
 *
 * ## Reading a table without misreading it
 *
 * Two traps this repository has already paid for, both defended positionally:
 *
 * - **A re-audit table is not a classification.** `SLICE_03` §1 tabulates what
 *   was true *before* the slice — `partial`, `baseline` — and using those rows
 *   would produce a matrix describing the tree that was replaced. Only rows
 *   under a recognised classification heading are read.
 * - **An evidence cell cites other requirements.** The subject of a row is its
 *   **first cell**, never the first identifier anywhere on the line, and the
 *   class is its **second cell**, never the first class word on the line.
 *
 * ## Refusal 9 and the month
 *
 * The contract's ninth refusal is *"a product event with no deployed
 * vocabulary, producer or consumer"*. `2P-CALENDAR-MONTH-TELEMETRY` looks like
 * one and is not, and ADR-122's amendment of 2026-08-20 says so in the owner's
 * words: `calendar_viewed` keeps its deployed vocabulary, its producer and its
 * consumer for the three orientations that are in the enum. What does not exist
 * is an event **for the month**, deliberately, because widening the deployed
 * validator is a stop condition. So this generator checks the direction that
 * can actually be wrong — the client emitting a literal the database refuses —
 * and treats the absence as the signed remainder it is.
 *
 *     node scripts/generate-phase-2p-traceability.mjs
 *     node scripts/generate-phase-2p-traceability.mjs --check
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const PRD = "docs/initiatives/phase-2p/PHASE_2P_PRD.md";
const REPORTS = "docs/reports/phase-2p";
const OUTPUT = `${REPORTS}/PHASE_2P_TRACEABILITY_MATRIX.md`;
const TELEMETRY_CONTRACTS = "src/features/product-analytics/contracts.ts";
const TELEMETRY_MIGRATION = "supabase/migrations/202608110090_phase_2m_daily_cycle_telemetry.sql";

/**
 * What the PRD declares.
 *
 * Asserted rather than counted, because this number is what every later total
 * is derived from — and because the owner's amendment of 2026-08-20 fixes it:
 * the cumulative chain was one too high from slice 2P.5, `2P-CHAT-004`'s
 * remainder having been counted as a requirement it already was. **There is no
 * eighty-eighth requirement**, and a generator fed 88 could not produce a
 * matrix that classifies each of 87 exactly once.
 */
export const DECLARED_TOTAL = 87;

/**
 * The fourteen families and their sizes, pinned.
 *
 * Refusal 4 is *"a gap or duplicate inside a family"* and refusal 5 is *"a
 * family containing digits"*. Both are checked against this, and the sum is
 * checked against `DECLARED_TOTAL` — so a family that silently grows fails
 * twice rather than shifting the total underneath everything else.
 */
export const FAMILY_SIZES = Object.freeze({
  "2P-FOUNDATION": 7,
  "2P-ATTENTION": 8,
  "2P-CHAT": 7,
  "2P-CAPTURE": 10,
  "2P-AUTONOMY": 10,
  "2P-SETTINGS": 8,
  "2P-PERSON": 4,
  "2P-MEMORY": 4,
  "2P-RELATION": 4,
  "2P-CALENDAR": 5,
  "2P-REMINDER": 5,
  "2P-MOBILE": 5,
  "2P-ACCESS": 5,
  "2P-CLOSE": 5,
});

/**
 * The migration budget, by name — refusal 8.
 *
 * Both allocations are **spent**, which is the opposite of Phase 2O's outcome
 * and equally correct: ADR-122's amendment funded one for slice 2P.1 and
 * ADR-123 funded one for slice 2P.4, and each was applied through the gates.
 * **A third is a stop condition** (ADR-123), and this is where it fails.
 */
export const MIGRATION_BUDGET = Object.freeze({
  allocated: 2,
  expectedSpend: 2,
  named: Object.freeze({
    M1: "202608180098_phase_2p_slice_1_entry_lifecycle_rederivation.sql",
    M2: "202608190099_phase_2p_slice_4_automation_policy_and_calibration.sql",
  }),
});

export const CLASSES = Object.freeze(["built", "baseline", "partial", "not-built-by-rule", "undelivered"]);
const CLASS_SET = new Set(CLASSES);

/** The slice whose record may adjudicate a conflict — the phase's own close. */
export const CLOSEOUT_SLICE = "2P.8";

/**
 * The headings under which a Phase 2P record states its classifications.
 *
 * A **closed list of three spellings**, deliberately. Guessing from context
 * would make a misparse silent, and the failure this generator exists to catch
 * is precisely a record whose rows stopped being read. A record that grows a
 * fourth spelling produces unclassified ids and a refusal, which is loud.
 */
const CLASSIFICATION_HEADINGS =
  /^#{2,4}\s*(?:\d+\.\s*)?(?:Requirement classification|What each requirement is|Requirement by requirement)\s*$/im;

/** What counts as naming where a remainder goes — refusal 6's second half. */
const DESTINATION_TOKENS = [
  /\bdestination\b/i,
  /\bowner\b/i,
  /\bbacklog\b/i,
  /\bremainder\b/i,
  /\bcheckpoint\b/i,
  /\bslice\s*2[A-Z]?\.\d/i,
  /\bsuccessor\b/i,
  /→/,
];

/**
 * What counts as citing the rule a `not-built-by-rule` rests on.
 *
 * A named authority and nothing softer. `not-built-by-rule` is the one class
 * that asserts an external permission, so the citation has to be checkable —
 * the bare words *rule* and *decision* name nothing and are not accepted.
 */
const RULE_TOKENS = [/\bADR-\d{3}\b/, /\bOD-2P-\d+\b/, /\bDEC-\d+\b/, /\b2[A-Z]-[A-Z]+-[A-Z0-9-]+\b/];

/**
 * What makes an adjudication explicit — refusal 3.
 *
 * A later record overturning an earlier class must **say** it is doing so.
 * Without the marker a generator cannot tell a considered re-evaluation from
 * two records that simply disagree, and "later wins" would launder the second
 * into the first in silence.
 */
const ADJUDICATION_TOKENS = [
  /\bre-?evaluat/i,
  /\bre-?classif/i,
  /\bpromot/i,
  /\bsupersed/i,
  /\badjudicat/i,
  /\bcorrect(?:ed|ion)\b/i,
];

/**
 * Claims no acceptance record in this phase is allowed to make — refusal 7.
 *
 * ADR-122 Decision 6 gates closeout behind real hardware and a real VoiceOver
 * session, and every record from 2P.0 onward has honoured it. The check is for
 * a claim that one of those **was executed**, not for the words themselves: a
 * record must be free to say *"NOT EXECUTED"* about exactly this.
 */
const FORBIDDEN_EXECUTION_CLAIMS = [
  /\b(?:on|against)\s+(?:a\s+)?real\s+(?:iPhone|device|hardware)\b/i,
  /\bVoiceOver\s+(?:session\s+)?(?:was\s+)?(?:executed|run|completed)\b/i,
  /\breal\s+VoiceOver\s+evidence\s+(?:was\s+)?(?:captured|collected)\b/i,
];

/** The escape hatch that makes such a sentence legal: it must disclaim in place. */
const NOT_EXECUTED_TOKENS = [
  /\bNOT EXECUTED\b/,
  /\bnot executed\b/i,
  /\bnot claimed\b/i,
  /\bcannot be discharged\b/i,
  /\bowner-run\b/i,
  /\bremains?\b[^.]{0,40}\bgate\b/i,
];

/**
 * A remainder that says nothing — refusal 6's first half.
 *
 * Deliberately crude (length, after the boilerplate is stripped) because a
 * subtle test here fails open, and Phase 2L shipped two `partial`s whose
 * remainder was a restatement of the requirement.
 */
const VACUOUS_REMAINDER_MINIMUM = 40;

/**
 * Identifiers that are remainders rather than requirements.
 *
 * A record legitimately classifies these — slice 2P.5's table closes
 * `2P-CHAT-004-MOBILE` — and they are not declared in the PRD, so without this
 * list refusal 1 would fire on a correct row. Listing them is what keeps the
 * refusal sharp: an identifier that is neither declared nor registered here is
 * a typo or an invention, and it still refuses.
 */
export const REGISTERED_REMAINDERS = Object.freeze([
  "2P-CHAT-004-MOBILE",
  "2P-CHAT-007-JOURNEY",
  "2P-APPEARANCE-HYDRATION",
  "2P-REMINDER-RECURRENCE",
  "2P-REMINDER-REVALIDATE-HANG",
  "2P-CALENDAR-MONTH-TELEMETRY",
  "2P-AUTONOMY-FLOW-PROJECT",
  "2P-AUTONOMY-FLOW-ORGANIZATION",
  "2P-AUTONOMY-FLOW-MEMORY",
  "2P-AUTONOMY-FLOW-RELATION",
]);
const REMAINDER_SET = new Set(REGISTERED_REMAINDERS);

export function readFile(relativePath, root = REPOSITORY_ROOT) {
  return readFileSync(join(root, relativePath), "utf8");
}

/**
 * The 87 declared requirements, in PRD order.
 *
 * Every identifier must appear exactly once in the declaration shape the
 * contract fixes. Asserted here rather than trusted, because this list is what
 * every later count is derived from.
 */
export function declaredRequirements(prdSource = readFile(PRD)) {
  const declarations = [...prdSource.matchAll(/^- \*\*(2P-[A-Z]+-\d{3}):\*\*\s*([^\n]*)/gm)];
  const requirements = [];
  const seen = new Set();
  const duplicates = [];

  for (const declaration of declarations) {
    const id = declaration[1];
    if (seen.has(id)) {
      duplicates.push(id);
      continue;
    }
    seen.add(id);
    requirements.push({ id, family: id.replace(/-\d{3}$/, ""), summary: declaration[2].trim() });
  }

  return { requirements, duplicates };
}

/**
 * Every record that may classify, oldest first.
 *
 * The nine slice records, then the **owner device findings** — a correction
 * record rather than a tenth slice, and deliberately not named as one. ADR-122
 * authorized slices 2P.0 … 2P.8 and no more, so calling this work "2P.9" would
 * claim an authorization that does not exist; it is a correction inside the
 * phase, produced by the owner's real-device checkpoint.
 *
 * It sorts **last** so that where it disagrees with an earlier record it is the
 * later one, and the ordinary adjudication rule applies: it must say it is
 * adjudicating, or the run refuses with a conflict rather than laundering the
 * change through.
 */
export function acceptanceRecords(root = REPOSITORY_ROOT) {
  const directory = join(root, REPORTS);
  const slices = readdirSync(directory)
    .filter((name) => /^PHASE_2P_SLICE_\d+_ACCEPTANCE\.md$/.test(name))
    .sort()
    .map((name) => {
      const source = readFileSync(join(directory, name), "utf8");
      const slice = `2P.${/SLICE_0*(\d+)_/.exec(name)[1]}`;
      return { name, slice, source };
    });

  const findings = "PHASE_2P_OWNER_DEVICE_FINDINGS.md";
  if (!existsSync(join(directory, findings))) return slices;
  return [
    ...slices,
    {
      name: findings,
      slice: "device findings",
      source: readFileSync(join(directory, findings), "utf8"),
    },
  ];
}

/**
 * The classification section of one record, and nothing else.
 *
 * Returns `null` when the record states none — which for Phase 2P is legal and
 * common, and is handled by the caller rather than turned into a refusal. See
 * the header for why this phase inverts the earlier generators' rule.
 */
export function classificationSection(source) {
  const heading = CLASSIFICATION_HEADINGS.exec(source);
  if (heading === null) return null;
  const start = heading.index + heading[0].length;
  const rest = source.slice(start);
  // The next heading at the same level or higher ends the section. A deeper
  // heading (`####`) may legitimately sit inside it.
  const next = /^#{1,3}\s+\S/m.exec(rest);
  return next === null ? rest : rest.slice(0, next.index);
}

/** The family a bare `-NNN` suffix belongs to, taken from the record's own rows. */
export function primaryFamily(section) {
  const families = [...section.matchAll(/`(2P-[A-Z]+)-\d{3}`/g)].map((match) => match[1]);
  return families.length === 0 ? null : families[0];
}

/**
 * The identifier a row is **about**, which is not the first identifier on it.
 *
 * Read positionally: the first cell of a table row, or the text before the
 * class in prose. An evidence cell routinely cites other requirements, and
 * citing one is not classifying it.
 */
export function readRowKey(line, family) {
  const head = line.startsWith("|") ? (line.split("|")[1] ?? "") : line.slice(0, 80);
  const full = /`(2P-[A-Z]+-[A-Z0-9]+(?:-[A-Z]+)?)`/.exec(head);
  if (full !== null) return full[1];
  const bare = /`-(\d{3})`/.exec(head);
  if (bare === null || family === null) return null;
  return `${family}-${bare[1]}`;
}

/**
 * The class a row states.
 *
 * A table row's class lives in its **second cell**; prose states it right after
 * the identifier. Both are read positionally rather than by scanning the line
 * for any class word, because evidence prose routinely contains one.
 */
export function readClassification(line) {
  if (line.startsWith("|")) {
    const cells = line.split("|").slice(1, -1);
    if (cells.length < 2) return null;
    return normalizeClass(cells[1]);
  }
  const after = line.replace(/^.*?`(?:2P-[A-Z]+-[A-Z0-9-]+|-\d{3})`/, "");
  return normalizeClass(after.slice(0, 60));
}

/**
 * `baseline, extended` and `built (words)` resolve to their head token.
 *
 * Only **leading** dashes are stripped. Removing every one would turn
 * `not-built-by-rule` into `not built by rule` and make the four autonomy
 * refusals unclassifiable — a class name containing the separator character is
 * a real collision, and it is the separator that must be narrowed, never the
 * class.
 */
export function normalizeClass(text) {
  const cleaned = text
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/^[\s—–-]+/, "")
    .trim()
    .toLowerCase();
  for (const candidate of ["not-built-by-rule", "built", "baseline", "partial", "undelivered"]) {
    if (new RegExp(`^${candidate}\\b`).test(cleaned)) return candidate;
  }
  return null;
}

/** Every classification one record states. Line-oriented, so no row can reach into the next. */
export function readRecord(record) {
  const section = classificationSection(record.source);
  if (section === null) return { slice: record.slice, name: record.name, section: null, entries: [] };

  const family = primaryFamily(section);
  const entries = [];

  for (const rawLine of section.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "") continue;
    if (/^\|\s*-{2,}/.test(line)) continue;
    if (/^\|\s*Requirement\s*\|/i.test(line)) continue;

    const id = readRowKey(line, family);
    if (id === null) continue;

    const classification = readClassification(line);
    if (classification === null) continue;

    entries.push({
      id,
      classification,
      evidence: line,
      slice: record.slice,
      record: record.name,
      adjudicates: ADJUDICATION_TOKENS.some((token) => token.test(line)),
    });
  }

  return { slice: record.slice, name: record.name, section, entries };
}

/**
 * The evidence with the requirement's own identifier removed.
 *
 * A row may not discharge its destination or its rule by **containing its own
 * subject**. Stripping first is what lets the checks below fail on a row that
 * names nowhere, instead of passing because the id happened to match a token.
 */
export function evidenceWithoutSubject(entry) {
  const cells = entry.evidence.split("|");
  const body = cells.length > 3 ? cells.slice(3).join("|") : entry.evidence;
  return body.replaceAll(entry.id, "").replaceAll(entry.id.replace(/^2P-[A-Z]+/, ""), "");
}

export function namesDestination(entry) {
  return DESTINATION_TOKENS.some((token) => token.test(evidenceWithoutSubject(entry)));
}

export function citesRule(entry) {
  return RULE_TOKENS.some((token) => token.test(evidenceWithoutSubject(entry)));
}

export function remainderIsVacuous(entry) {
  const evidence = evidenceWithoutSubject(entry)
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return evidence.length < VACUOUS_REMAINDER_MINIMUM;
}

/** One final classification per id, with every disagreement surfaced — refusal 3. */
export function resolveClassifications(declared, records) {
  const declaredIds = new Set(declared.map((requirement) => requirement.id));
  const byId = new Map();
  const undeclared = [];
  const remainders = [];

  for (const record of records) {
    for (const entry of record.entries) {
      if (REMAINDER_SET.has(entry.id)) {
        remainders.push(entry);
        continue;
      }
      if (!declaredIds.has(entry.id)) {
        undeclared.push(entry);
        continue;
      }
      if (!byId.has(entry.id)) byId.set(entry.id, []);
      byId.get(entry.id).push(entry);
    }
  }

  const resolved = new Map();
  const conflicts = [];

  for (const [id, entries] of byId) {
    const classes = new Set(entries.map((entry) => entry.classification));
    if (classes.size === 1) {
      resolved.set(id, entries[entries.length - 1]);
      continue;
    }
    const last = entries[entries.length - 1];
    if (!last.adjudicates) {
      conflicts.push({ id, entries });
      continue;
    }
    resolved.set(id, { ...last, adjudicated: entries.slice(0, -1).map((entry) => entry.slice) });
  }

  return { resolved, conflicts, undeclared, remainders };
}

/** Every migration file attributable to this phase, by name. */
export function phaseMigrations(root = REPOSITORY_ROOT) {
  const directory = join(root, "supabase/migrations");
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter((name) => /phase[_-]?2p/i.test(name)).sort();
}

/**
 * The deployed `calendar_viewed` orientation vocabulary, read from the migration
 * that actually created the validator, and the client list beside it.
 *
 * This is refusal 9, pointed at the direction that can be wrong. An event the
 * client emits with a literal the database refuses is accepted by the caller,
 * rejected by the validator and lost with nothing anywhere saying so — the
 * failure this repository has already recorded. **The absence of an event for
 * the month is not that**, and ADR-122's amendment of 2026-08-20 signs it as an
 * unfunded remainder rather than a defect.
 */
export function telemetryVocabulary(root = REPOSITORY_ROOT) {
  const migration = readFile(TELEMETRY_MIGRATION, root);
  const deployed = /require_product_event_enum\(p_properties, 'orientation', array\[([^\]]+)\]\)/.exec(migration);
  const contracts = readFile(TELEMETRY_CONTRACTS, root);
  const client = /export const calendarOrientations = \[([^\]]+)\]/.exec(contracts);
  const parse = (match) =>
    match === null ? null : match[1].split(",").map((value) => value.trim().replace(/^['"]|['"]$/g, ""));
  return { deployed: parse(deployed), client: parse(client) };
}

/** Every refusal, collected rather than thrown one at a time. */
export function audit(root = REPOSITORY_ROOT) {
  const { requirements, duplicates } = declaredRequirements(readFile(PRD, root));
  const records = acceptanceRecords(root).map(readRecord);
  const refusals = [];

  // --- refusal 1's precondition, and the guard against a vacuous run --------
  if (requirements.length === 0) {
    refusals.push("the declaration extraction found nothing, so every check below would pass trivially");
  }
  if (requirements.length !== DECLARED_TOTAL) {
    refusals.push(
      `the PRD declares ${requirements.length} requirements and this phase's total is ${DECLARED_TOTAL} — the owner's amendment of 2026-08-20 fixes it at 87, with no eighty-eighth`,
    );
  }
  for (const duplicate of duplicates) {
    refusals.push(`\`${duplicate}\` is declared more than once (refusal 1)`);
  }

  // --- refusals 4 and 5: family shape --------------------------------------
  const byFamily = new Map();
  for (const requirement of requirements) {
    if (!byFamily.has(requirement.family)) byFamily.set(requirement.family, []);
    byFamily.get(requirement.family).push(Number(requirement.id.slice(-3)));
  }
  for (const [family, numbers] of byFamily) {
    if (/\d/.test(family.replace(/^2P-/, ""))) {
      refusals.push(`family \`${family}\` contains a digit (refusal 5)`);
    }
    const expected = FAMILY_SIZES[family];
    if (expected === undefined) {
      refusals.push(`family \`${family}\` is not one of the fourteen this phase declares (refusal 4)`);
      continue;
    }
    if (numbers.length !== expected) {
      refusals.push(`family \`${family}\` declares ${numbers.length} requirements and is pinned at ${expected} (refusal 4)`);
    }
    const sorted = [...numbers].sort((a, b) => a - b);
    for (let index = 0; index < sorted.length; index += 1) {
      if (sorted[index] !== index + 1) {
        refusals.push(`family \`${family}\` is not numbered from 001 without gaps — found ${sorted.join(", ")} (refusal 4)`);
        break;
      }
    }
  }
  const familySum = Object.values(FAMILY_SIZES).reduce((total, size) => total + size, 0);
  if (familySum !== DECLARED_TOTAL) {
    refusals.push(`the pinned family sizes sum to ${familySum}, not ${DECLARED_TOTAL} (refusal 4)`);
  }

  const { resolved, conflicts, undeclared, remainders } = resolveClassifications(requirements, records);

  // --- refusal 2: declared and unclassified --------------------------------
  for (const requirement of requirements) {
    if (!resolved.has(requirement.id) && !conflicts.some((conflict) => conflict.id === requirement.id)) {
      refusals.push(`\`${requirement.id}\` is declared and no acceptance record classifies it (refusal 2)`);
    }
  }

  // --- refusal 1: classified and undeclared --------------------------------
  for (const entry of undeclared) {
    refusals.push(
      `${entry.record} classifies \`${entry.id}\`, which the PRD does not declare and which is not a registered remainder (refusal 1)`,
    );
  }

  // --- refusal 3: silent conflict ------------------------------------------
  for (const conflict of conflicts) {
    const stated = conflict.entries.map((entry) => `${entry.slice} says ${entry.classification}`).join("; ");
    refusals.push(
      `\`${conflict.id}\` is classified differently by two records and the later one does not say it is adjudicating: ${stated} (refusal 3)`,
    );
  }

  // --- refusal 6: a class that asserts something must carry the evidence ----
  for (const [id, entry] of resolved) {
    if (!CLASS_SET.has(entry.classification)) {
      refusals.push(`\`${id}\` carries \`${entry.classification}\`, which is not one of the five classes`);
      continue;
    }
    if (entry.classification === "partial" || entry.classification === "undelivered") {
      if (remainderIsVacuous(entry)) {
        refusals.push(`\`${id}\` is \`${entry.classification}\` and its remainder says nothing (refusal 6)`);
      } else if (!namesDestination(entry)) {
        refusals.push(`\`${id}\` is \`${entry.classification}\` and its remainder names no destination (refusal 6, 2P-CLOSE-002)`);
      }
    }
    if (entry.classification === "not-built-by-rule" && !citesRule(entry)) {
      refusals.push(`\`${id}\` is \`not-built-by-rule\` and cites no signed rule (refusal 7's sibling — an unsigned refusal is an invention)`);
    }
  }

  // --- refusal 7: a claim the record does not execute -----------------------
  for (const record of records) {
    if (record.section === null) continue;
    for (const line of record.section.split(/\r?\n/)) {
      const claim = FORBIDDEN_EXECUTION_CLAIMS.find((pattern) => pattern.test(line));
      if (claim === undefined) continue;
      if (NOT_EXECUTED_TOKENS.some((token) => token.test(line))) continue;
      refusals.push(
        `${record.name} claims hardware or VoiceOver evidence without disclaiming it: ${line.trim().slice(0, 120)} (refusal 7)`,
      );
    }
  }

  // --- refusal 8: the migration budget, by name ----------------------------
  const migrations = phaseMigrations(root);
  const authorized = Object.values(MIGRATION_BUDGET.named).sort();
  if (migrations.length > MIGRATION_BUDGET.allocated) {
    refusals.push(
      `${migrations.length} Phase 2P migrations exceed the allocation of ${MIGRATION_BUDGET.allocated} — STOP CONDITION (ADR-123) (refusal 8)`,
    );
  }
  if (JSON.stringify(migrations) !== JSON.stringify(authorized)) {
    refusals.push(
      `the Phase 2P migrations present (${migrations.join(", ") || "none"}) are not exactly the two the owner authorized by name (refusal 8)`,
    );
  }

  // --- refusal 9: an event the database would refuse -----------------------
  const vocabulary = telemetryVocabulary(root);
  if (vocabulary.deployed === null || vocabulary.client === null) {
    refusals.push("the calendar telemetry vocabulary could not be read from both its sources (refusal 9)");
  } else {
    const undeployed = vocabulary.client.filter((value) => !vocabulary.deployed.includes(value));
    if (undeployed.length > 0) {
      refusals.push(
        `the client would emit \`calendar_viewed\` orientation(s) the deployed validator refuses: ${undeployed.join(", ")} — accepted by the caller and lost in silence (refusal 9)`,
      );
    }
    // The signed carve-out, asserted rather than assumed: the month is absent
    // from BOTH lists, which is what makes its absence a remainder instead of a
    // broken event. If it ever appears in the client list alone, the check
    // above is what fires.
    if (vocabulary.deployed.includes("month")) {
      refusals.push(
        "the deployed orientation enum now admits `month`, which would be a third Phase 2P migration — STOP CONDITION (refusal 8)",
      );
    }
  }

  // --- refusal 12: no successor before authorization -----------------------
  //
  // **Retargeted 2026-08-21 by ADR-126**, which authorized Phase 2Q for
  // planning. This is the third place in the repository that pins the
  // successor's letter — after `phase-2f-documentation.test.ts`'s A13 detector
  // and `phase-2o-declarations.test.ts`'s literal pin on it — and it is the one
  // that had to be discovered by running the suite rather than by reading the
  // governance documents, because nothing points at it from them.
  //
  // The pin is kept literal rather than derived. A derived version would move
  // itself and no author would ever have to think about it, which is the
  // opposite of what these pins are for: every retarget must consciously pass
  // through each one.
  const successorArtifacts = existsSync(join(root, "docs/initiatives/phase-2r"))
    || existsSync(join(root, "docs/reports/phase-2r"));
  if (successorArtifacts) {
    refusals.push("a Phase 2R governing artifact exists before any authorization (refusal 12)");
  }
  if (/^- \*\*2R-[A-Z]+-\d{3}:\*\*/m.test(readFile(PRD, root))) {
    refusals.push("a successor requirement is declared before authorization (refusal 12)");
  }

  return { requirements, records, resolved, conflicts, refusals, migrations, remainders, vocabulary };
}

/**
 * The comparison is about **content**, and a line terminator is not content.
 *
 * The repository stores LF and this generator writes LF, but `core.autocrlf`
 * checks the file out with CRLF on Windows — so a byte-for-byte comparison
 * against the working copy fails on a tree that is completely correct, and
 * passes in CI where no conversion happens. **A gate that fails on correct code
 * is the one that gets weakened later.** Every other difference — a reordered
 * row, a changed count, a hand edit — still fails, which is refusal 10.
 */
export function normalizeNewlines(text) {
  return text.replace(/\r\n/g, "\n");
}

export function counts(resolved) {
  const tally = Object.fromEntries(CLASSES.map((name) => [name, 0]));
  for (const entry of resolved.values()) tally[entry.classification] += 1;
  return tally;
}

function evidenceCell(entry) {
  const cells = entry.evidence.split("|");
  const evidence = cells.length > 3 ? cells.slice(3).join("|") : entry.evidence;
  return evidence.replace(/\|$/, "").replace(/\s+/g, " ").trim();
}

export function render({ requirements, resolved, migrations, records }) {
  const tally = counts(resolved);
  const classifying = records.filter((record) => record.entries.length > 0);
  const lines = [];

  lines.push("# Phase 2P — traceability matrix");
  lines.push("");
  lines.push("<!-- Do not edit by hand. Generated by scripts/generate-phase-2p-traceability.mjs -->");
  lines.push("");
  lines.push(
    "Generated from `docs/initiatives/phase-2p/PHASE_2P_PRD.md` (what was declared) and the slice",
  );
  lines.push(
    "acceptance records under `docs/reports/phase-2p/` (what was evidenced). Regenerate with `npm run",
  );
  lines.push("docs:phase-2p:traceability`; `--check` fails when this file and the sources disagree.");
  lines.push("");
  lines.push(`**${requirements.length} declared · ${resolved.size} classified · 0 unclassified.**`);
  lines.push("");
  lines.push("| Classification | Count |");
  lines.push("|---|---:|");
  for (const name of CLASSES) lines.push(`| \`${name}\` | ${tally[name]} |`);
  lines.push(`| **total** | **${resolved.size}** |`);
  lines.push("");
  lines.push("## Where the classifications come from");
  lines.push("");
  lines.push(
    "Five of the nine records state their outcomes in prose rather than in a section this generator",
  );
  lines.push(
    "recognises. That is a fact about how Phase 2P was written, and the records are preserved as",
  );
  lines.push(
    "written; the closeout record carries every requirement the earlier ones did not classify.",
  );
  lines.push("");
  lines.push("| Record | Slice | Classifies |");
  lines.push("|---|---|---:|");
  for (const record of classifying) {
    lines.push(`| \`${record.name}\` | ${record.slice} | ${record.entries.length} |`);
  }
  lines.push("");
  lines.push("## Migration budget");
  lines.push("");
  lines.push(
    `**${MIGRATION_BUDGET.allocated} allocated · ${migrations.length} spent · a third is a STOP CONDITION.**`,
  );
  lines.push("");
  lines.push("| Allocation | Destination | Outcome |");
  lines.push("|---|---|---|");
  lines.push(`| **M1** | slice 2P.1, entry lifecycle re-derivation (ADR-122 amendment) | SPENT — \`${MIGRATION_BUDGET.named.M1}\` |`);
  lines.push(`| **M2** | slice 2P.4, automation policy and calibration (ADR-123) | SPENT — \`${MIGRATION_BUDGET.named.M2}\` |`);
  lines.push("");
  lines.push("## Requirements");
  lines.push("");
  lines.push("| Requirement | Class | Slice | Evidence |");
  lines.push("|---|---|---|---|");

  for (const requirement of requirements) {
    const entry = resolved.get(requirement.id);
    const adjudicated = entry.adjudicated ? ` (adjudicates ${entry.adjudicated.join(", ")})` : "";
    lines.push(
      `| \`${requirement.id}\` | \`${entry.classification}\` | ${entry.slice}${adjudicated} | ${evidenceCell(entry)} |`,
    );
  }

  // One trailing newline, and not two. `join` already leaves the last row
  // without one, so pushing an empty string here produces a blank line at EOF —
  // which `git diff --check` reports and CI gates on.
  return `${lines.join("\n")}\n`;
}

function main() {
  const check = process.argv.includes("--check");
  const result = audit();

  if (result.refusals.length > 0) {
    console.error("REFUSED — the Phase 2P matrix was not written:\n");
    for (const refusal of result.refusals) console.error(`  - ${refusal}`);
    console.error(`\n${result.refusals.length} refusal(s).`);
    process.exit(1);
  }

  const rendered = render(result);
  const target = join(REPOSITORY_ROOT, OUTPUT);

  if (check) {
    if (!existsSync(target)) {
      console.error(`REFUSED — ${OUTPUT} does not exist. Run the generator.`);
      process.exit(1);
    }
    if (normalizeNewlines(readFileSync(target, "utf8")) !== normalizeNewlines(rendered)) {
      console.error(`REFUSED — ${OUTPUT} differs from what the sources generate. Regenerate it (refusal 10).`);
      process.exit(1);
    }
    const tally = counts(result.resolved);
    console.log(`${OUTPUT} matches its sources — ${result.resolved.size} classified.`);
    console.log(CLASSES.map((name) => `${name}=${tally[name]}`).join(" · "));
    return;
  }

  writeFileSync(target, rendered, "utf8");
  const tally = counts(result.resolved);
  console.log(`Wrote ${OUTPUT} — ${result.resolved.size} of ${result.requirements.length} classified.`);
  console.log(CLASSES.map((name) => `${name}=${tally[name]}`).join(" · "));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
