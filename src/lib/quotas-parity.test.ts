import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { QUOTAS, RETAINED_CLASSES, RETENTION_DAYS, SWEPT_CLASSES } from "./quotas";

/**
 * SH-QUOTA-010 / SH-RETENTION-001 — the code and the signed table are one table.
 *
 * PRD §20 is what the owner approved (amendment P-1: "no value changed between
 * proposal and approval"). This compares it to `quotas.ts` **in both
 * directions**, the `version-parity.test.ts` shape: a constant §20 does not name
 * fails, and a §20 row nothing implements fails too.
 *
 * The one-directional version of this test is worthless, and in a predictable
 * way: it passes when somebody deletes the constant it was guarding.
 */

const PRD = readFileSync(
  join(process.cwd(), "docs/SIGNUP_HARDENING_PRD.md"),
  "utf8",
);

/**
 * The third corner of the same triangle (SH-QUOTA-010).
 *
 * The PRD is what the owner signed and `quotas.ts` is what the product reads,
 * but the number that actually refuses a capture is the one seeded into
 * `private.quota_ceilings`. Two of the three agreeing proves nothing about the
 * third, and the failure that matters — a page promising 300 while the database
 * refuses at 250 — lives exactly in that gap.
 */
const QUOTA_MIGRATION = readFileSync(
  join(process.cwd(), "supabase/migrations/202608050076_quota_enforcement.sql"),
  "utf8",
).replace(/\r\n/g, "\n");

/** The seeded ceilings, as `key -> value`, read out of the migration's INSERT. */
function seededCeilings(): Map<string, number> {
  const start = QUOTA_MIGRATION.indexOf(
    "insert into private.quota_ceilings (key, value, note) values",
  );
  expect(start, "the quota migration must seed its ceilings").toBeGreaterThan(-1);
  const block = QUOTA_MIGRATION.slice(start, QUOTA_MIGRATION.indexOf("\n\n", start));
  const seeded = new Map<string, number>();
  for (const [, key, value] of block.matchAll(/\('([a-z_]+)',\s*(\d+),/g)) {
    seeded.set(key, Number(value));
  }
  return seeded;
}

const SEEDED = seededCeilings();

/** `entriesPerDay` -> `entries_per_day`, the naming contract between the two. */
function snakeCase(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/** The §20 value sheet, as `label -> raw value cell`. */
function valueSheet(): Map<string, string> {
  const start = PRD.indexOf("| Control | Proposed default | Rationale |");
  expect(start, "PRD §20 value sheet must exist").toBeGreaterThan(-1);
  const table = PRD.slice(start, PRD.indexOf("\n## ", start));
  const rows = new Map<string, string>();
  for (const line of table.split("\n")) {
    const cells = line.split("|").map((cell) => cell.trim());
    // `| control | default | rationale |` splits to ["", c, d, r, ""].
    if (cells.length !== 5) continue;
    if (cells[1] === "Control" || cells[1].startsWith("---")) continue;
    rows.set(cells[1].replace(/`/g, ""), cells[2]);
  }
  return rows;
}

const SHEET = valueSheet();

/** Every §20 row this module is responsible for, and how it maps. */
const QUOTA_ROWS: Record<string, () => number> = {
  "Entries per user per day": () => QUOTAS.entriesPerDay,
  "Live jobs per user": () => QUOTAS.liveJobsPerUser,
  "Drain claims per owner per invocation": () => QUOTAS.drainClaimsPerOwnerPerTick,
  "Attachments per entry / per day": () => QUOTAS.attachmentsPerEntry,
};

describe("SH-QUOTA-010: the constants are the signed §20 values", () => {
  it("parses a value sheet that is not vacuous", () => {
    // A regex that silently matched nothing would make every assertion below
    // pass by having nothing to compare.
    expect(SHEET.size).toBeGreaterThanOrEqual(15);
  });

  it.each(Object.keys(QUOTA_ROWS))("%s matches the PRD", (label) => {
    const cell = SHEET.get(label);
    expect(cell, `PRD §20 must still name "${label}"`).toBeDefined();
    const first = Number(/(\d[\d\s]*)/.exec(cell!.replace(/\s/g, ""))?.[1]);
    expect(first).toBe(QUOTA_ROWS[label]());
  });

  it("storage matches both halves of its row", () => {
    const cell = SHEET.get("Storage per user");
    expect(cell).toBeDefined();
    // "500 MiB / 200 objects"
    const [mib, objects] = [...cell!.matchAll(/(\d+)/g)].map((m) => Number(m[1]));
    expect(QUOTAS.storageBytesPerUser).toBe(mib * 1024 * 1024);
    expect(QUOTAS.storageObjectsPerUser).toBe(objects);
  });

  it("attachments match BOTH numbers in their row, not just the first", () => {
    // The per-day half is the one a lazy parse drops.
    const cell = SHEET.get("Attachments per entry / per day");
    const [perEntry, perDay] = [...cell!.matchAll(/(\d+)/g)].map((m) => Number(m[1]));
    expect(QUOTAS.attachmentsPerEntry).toBe(perEntry);
    expect(QUOTAS.attachmentsPerDay).toBe(perDay);
  });

  it("every quota constant is a positive integer", () => {
    for (const [name, value] of Object.entries(QUOTAS)) {
      expect(Number.isInteger(value), `${name} must be an integer`).toBe(true);
      expect(value, `${name} must be positive`).toBeGreaterThan(0);
    }
  });
});

describe("SH-QUOTA-010: the database enforces the number the product states", () => {
  it("parses a seed that is not vacuous", () => {
    expect(SEEDED.size).toBe(7);
  });

  it("every constant is seeded into private.quota_ceilings with the same value", () => {
    for (const [name, value] of Object.entries(QUOTAS)) {
      const key = snakeCase(name);
      expect(SEEDED.has(key), `the migration must seed "${key}"`).toBe(true);
      expect(SEEDED.get(key), `${name} disagrees with its seeded ceiling`).toBe(value);
    }
  });

  it("every seeded ceiling maps back to a constant", () => {
    // The other direction, and the one that catches a ceiling the database
    // enforces but no surface knows about — a limit users hit with no copy to
    // explain it.
    const fromConstants = new Set(Object.keys(QUOTAS).map(snakeCase));
    for (const key of SEEDED.keys()) {
      expect(fromConstants.has(key), `seeded ceiling "${key}" has no constant`).toBe(true);
    }
  });

  it("the mechanism reads every ceiling it seeds", () => {
    // A seeded row nothing reads is a number that looks enforced and is not.
    for (const key of SEEDED.keys()) {
      expect(
        QUOTA_MIGRATION.includes(`private.quota_ceiling('${key}')`),
        `nothing reads the seeded ceiling "${key}"`,
      ).toBe(true);
    }
  });

  it("an absent ceiling refuses rather than admitting", () => {
    // The failure direction is the whole design: a quota system whose broken
    // state is "no limit" is not a quota system.
    expect(QUOTA_MIGRATION).toContain("QUOTA_CEILING_MISSING");
    expect(QUOTA_MIGRATION).not.toMatch(/coalesce\(\s*ceiling\s*,/);
  });
});

describe("SH-RETENTION-001: the retention windows are the signed §20 windows", () => {
  const RETENTION_ROWS: Record<string, number> = {
    "jobs terminal retention": RETENTION_DAYS.jobsTerminal,
    "notifications retention": RETENTION_DAYS.notifications,
    "product_events retention": RETENTION_DAYS.productEvents,
    "heartbeat_runs retention": RETENTION_DAYS.heartbeatRuns,
    "undo_operations retention": RETENTION_DAYS.undoOperationsPastExpiry,
    "auth_event_attempts retention": RETENTION_DAYS.authEventAttempts,
  };

  it.each(Object.keys(RETENTION_ROWS))("%s matches the PRD", (label) => {
    const cell = SHEET.get(label);
    expect(cell, `PRD §20 must still name "${label}"`).toBeDefined();
    expect(Number(/(\d+)/.exec(cell!)?.[1])).toBe(RETENTION_ROWS[label]);
  });

  it("the retained classes are declared retained, with a reason each", () => {
    const cell = SHEET.get("audit_logs, ai_usage_events, interpretation versions");
    expect(cell).toBe("retained");
    for (const name of ["auditLogs", "aiUsageEvents", "interpretationVersions"] as const) {
      expect(RETENTION_DAYS[name], `${name} must be retained (null)`).toBeNull();
      expect(RETAINED_CLASSES[name]?.length, `${name} needs a recorded reason`).toBeGreaterThan(20);
    }
  });

  it("swept and retained partition the schedule with nothing left over", () => {
    // A class that is neither swept nor deliberately retained is a class nobody
    // decided about, which is the state SH-RETENTION-001 exists to forbid.
    const all = Object.keys(RETENTION_DAYS).sort();
    const accounted = [...SWEPT_CLASSES, ...Object.keys(RETAINED_CLASSES)].sort();
    expect(accounted).toEqual(all);
  });

  it("undo_operations is measured past EXPIRY, not past creation", () => {
    // The distinction is the whole of SH-RETENTION-005: `undo_operation`'s
    // lazy-expiry contract is unchanged, so the window starts where expiry ends.
    expect(Object.keys(RETENTION_DAYS)).toContain("undoOperationsPastExpiry");
    expect(SHEET.get("undo_operations retention")).toMatch(/past expiry/i);
  });
});
