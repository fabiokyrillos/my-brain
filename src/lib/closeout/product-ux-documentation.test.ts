import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The permanent documents must agree with the ledger, and with each other.
 *
 * Slice H's first finding was that they did not: fourteen detail records in
 * `PRODUCT_UX_FINDINGS.md` still read `OPEN` while its own summary table called
 * the same finding RESOLVED, and one row — UX-19 — was simply wrong for four
 * slices because Slice D1 closed it and nobody updated the table. Slice G4
 * noticed the contradiction, wrote it down, and explicitly declined to
 * adjudicate it. Prose noticing prose is how that survives; a test is how it
 * stops.
 *
 * So the counts are **derived from the ledger's own summary table** and every
 * other document is checked against them. Nothing here is a hard-coded
 * expectation of "35" — if a finding is added tomorrow, this passes as long as
 * the documents are updated together, and fails the moment one of them is not.
 *
 * Scope is deliberately narrow: the load-bearing, mechanically checkable facts.
 * It does not review wording, and it is not a substitute for reading the
 * documents.
 */

const ROOT = process.cwd();
const read = (relative: string) => readFileSync(path.join(ROOT, relative), "utf8");

const FINDINGS = "docs/reports/product-ux/PRODUCT_UX_FINDINGS.md";
const CLOSEOUT = "docs/reports/product-ux/PRODUCT_UX_CLOSEOUT.md";
const STATE = "docs/STATE.md";
const TODO = "docs/TODO.md";
const CHANGELOG = "docs/CHANGELOG.md";
const DECISIONS = "docs/DECISIONS.md";

/** The parity both sides of the deployment are at, asserted as one string. */
const PARITY = "202607310064";

type Row = {
  readonly id: string;
  readonly number: number;
  readonly priority: string;
  readonly disposition: "RESOLVED" | "RETAINED" | "DEFERRED" | "BLOCKED" | "OPEN" | "PARTIAL" | "UNPARSED";
};

const DISPOSITIONS = ["RESOLVED", "RETAINED", "DEFERRED", "BLOCKED", "PARTIAL", "OPEN"] as const;

function summaryRows(): Row[] {
  return read(FINDINGS)
    .split(/\r?\n/)
    .filter((line) => /^\|\s*UX-\d+\s*\|/.test(line))
    .map((line) => {
      const cells = line.split("|").map((cell) => cell.trim());
      const id = cells[1]!;
      const upper = (cells[6] ?? "").toUpperCase();
      // `PARTIAL` before `RESOLVED` would misread "PARTIAL (… RESOLVED …)";
      // the order here is the order the closeout forbids, most-severe first.
      const disposition = DISPOSITIONS.find((candidate) => upper.includes(candidate)) ?? "UNPARSED";
      return {
        id,
        number: Number(id.slice(3)),
        priority: (cells[4] ?? "").replace(/\*/g, "").trim(),
        disposition,
      };
    });
}

function count(rows: Row[], disposition: Row["disposition"]): number {
  return rows.filter((row) => row.disposition === disposition).length;
}

describe("the product UX ledger is internally consistent", () => {
  const rows = summaryRows();

  it("has at least the findings the initiative recorded", () => {
    expect(rows.length).toBeGreaterThanOrEqual(35);
  });

  it("lists every finding id exactly once", () => {
    const ids = rows.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("leaves no gap in the id sequence", () => {
    const numbers = rows.map((row) => row.number).sort((a, b) => a - b);
    const expected = Array.from({ length: numbers.length }, (_, index) => index + 1);
    expect(numbers).toEqual(expected);
  });

  /** The closeout's own rule: OPEN and PARTIAL are not final dispositions. */
  it("carries no OPEN, PARTIAL or unparsed disposition", () => {
    const offenders = rows
      .filter((row) => row.disposition === "OPEN" || row.disposition === "PARTIAL" || row.disposition === "UNPARSED")
      .map((row) => `${row.id} = ${row.disposition}`);
    expect(offenders).toEqual([]);
  });

  it("resolves every P0", () => {
    const unresolved = rows
      .filter((row) => row.priority === "P0" && row.disposition !== "RESOLVED")
      .map((row) => row.id);
    expect(unresolved).toEqual([]);
  });

  /**
   * The specific defect that survived four slices: a detail record frozen at
   * `OPEN` while the table says otherwise. Slice H's convention is that such a
   * record carries a `Reconciled in H` line rather than being rewritten, so the
   * original wording survives beside the current disposition.
   */
  it("gives every detail record still reading OPEN a reconciliation line", () => {
    const lines = read(FINDINGS).split(/\r?\n/);
    const headings: { id: string; line: number }[] = [];
    lines.forEach((line, index) => {
      if (/^#{2,3}\s+UX-\d+/.test(line)) headings.push({ id: line.match(/UX-\d+/)![0], line: index });
    });

    const bare = headings.filter((heading, index) => {
      const end = index + 1 < headings.length ? headings[index + 1]!.line : lines.length;
      const section = lines.slice(heading.line, end);
      const readsOpen = section.some((line) => /\*\*Disposition\*\* — OPEN/.test(line));
      const reconciled = section.some((line) => /Reconciled in H/.test(line));
      return readsOpen && !reconciled;
    });

    expect(bare.map((heading) => heading.id)).toEqual([]);
  });
});

describe("the permanent documents agree with the ledger", () => {
  const rows = summaryRows();
  const totals = {
    findings: rows.length,
    resolved: count(rows, "RESOLVED"),
    retained: count(rows, "RETAINED"),
    deferred: count(rows, "DEFERRED"),
    blocked: count(rows, "BLOCKED"),
    p0: rows.filter((row) => row.priority === "P0").length,
  };

  /**
   * Every document that quotes a count must quote the ledger's count. This is
   * the assertion that would have caught `STATE.md` and `TODO.md` saying "34
   * findings, 29 RESOLVED" after UX-35 was added — which is exactly what
   * happened, and what the pre-merge review caught by hand.
   */
  const quoting = [STATE, TODO, CLOSEOUT] as const;

  it.each(quoting)("%s quotes the ledger's finding count", (document) => {
    expect(read(document)).toContain(`${totals.findings} findings`);
  });

  it.each(quoting)("%s quotes the ledger's disposition counts", (document) => {
    const text = read(document);
    expect(text, "RESOLVED").toContain(`${totals.resolved} RESOLVED`);
    expect(text, "RETAINED").toContain(`${totals.retained} RETAINED`);
    expect(text, "DEFERRED").toContain(`${totals.deferred} DEFERRED`);
  });

  it.each(quoting)("%s states that every P0 is resolved", (document) => {
    expect(read(document)).toContain(`${totals.p0} P0`);
  });

  it("records no blocked finding anywhere", () => {
    expect(totals.blocked).toBe(0);
  });
});

describe("the permanent documents agree on the facts that outlive the slice", () => {
  const everywhere = [STATE, CHANGELOG, FINDINGS, CLOSEOUT] as const;

  it.each(everywhere)("%s states the current migration parity", (document) => {
    expect(read(document)).toContain(PARITY);
  });

  /**
   * The one deferred finding must name where it goes. A deferral without a
   * destination is an open item wearing a different word.
   */
  it("names UX-22's destination in the backlog, not only in the report", () => {
    const todo = read(TODO);
    expect(todo).toMatch(/UX-22/);
    expect(todo.toLowerCase()).toContain("localization maintenance");
  });

  /** Repository maintenance stays outside the product recommendation. */
  it("keeps the CRLF fix a separate maintenance recommendation", () => {
    const todo = read(TODO);
    expect(todo).toContain(".gitattributes");
    expect(todo).toMatch(/maintenance/i);
    // And it is not in the tree: adding it here would make the local counter
    // green while hiding why the closeout could be trusted without it.
    expect(() => readFileSync(path.join(ROOT, ".gitattributes"), "utf8")).toThrow();
  });

  /**
   * Asserted on a matched excerpt rather than on the whole file: `STATE.md` is
   * an append-only history tens of thousands of characters long, and a failing
   * `expect(text).toMatch(...)` prints all of it. A test whose failure output
   * has to be scrolled past is a test people stop reading.
   */
  it.each([STATE, CLOSEOUT] as const)("%s says Phase 2G is not authorized or started", (document) => {
    const claims = read(document).match(/[^.\n]*Phase 2G[^.\n]*/g) ?? [];
    const disclaims = claims.filter((claim) =>
      /not (authorized|started)|has not started|is a recommendation|remains a recommendation|not begin/i.test(claim),
    );
    expect(
      disclaims.length > 0,
      `${document} mentions Phase 2G ${claims.length}× but never says it is unauthorized/unstarted`,
    ).toBe(true);

    const authorized = claims.filter((claim) => /Phase 2G (is|has been) (authorized|started|begun)/i.test(claim));
    expect(authorized, `${document} claims Phase 2G has begun`).toEqual([]);
  });

  /**
   * The initiative may be declared COMPLETE in exactly one place, and only
   * after the merge SHA's CI is green. Before then §10 still carries its
   * pending marker, and nothing else may contradict it.
   *
   * This is the assertion the pre-merge review had to make by hand: `STATE.md`
   * called the remediation COMPLETE while Slice H was still an unmerged PR.
   */
  it("declares completion in one place, consistently with the closeout's own §10", () => {
    const closeout = read(CLOSEOUT);
    const pending = closeout.includes("NOT COMPLETE — awaiting integration");
    const state = read(STATE);

    if (pending) {
      expect(state, "STATE.md calls the remediation complete while the closeout does not").not.toMatch(
        /remediation is COMPLETE/,
      );
      expect(state).toMatch(/IMPLEMENTED THROUGH SLICE H AND PR-READY/);
    } else {
      expect(state, "the closeout is integrated but STATE.md was not updated").toMatch(
        /remediation is COMPLETE/,
      );
    }
  });

  /**
   * Every document that talks about Slice H must say the same thing about
   * whether it has landed. Before integration that is "PR #50, not merged";
   * after it, §10 stops being pending and they must all move together.
   */
  it.each([STATE, TODO, CHANGELOG, FINDINGS, CLOSEOUT] as const)(
    "%s states Slice H's integration status",
    (document) => {
      const text = read(document);
      const pending = read(CLOSEOUT).includes("NOT COMPLETE — awaiting integration");
      const says = /PR #50/.test(text);
      expect(says, `${document} never names Slice H's PR`).toBe(true);
      if (pending) {
        expect(
          /not yet merged|not yet integrated|awaiting integration|PR-ready|not been merged/i.test(text),
          `${document} names PR #50 but does not say it is unmerged`,
        ).toBe(true);
      }
    },
  );

  /**
   * The ADRs Slice H recorded must exist, because three of its decisions are
   * only defensible with their reasoning attached.
   */
  it.each(["ADR-064", "ADR-065", "ADR-066"])("%s is recorded", (adr) => {
    expect(read(DECISIONS)).toContain(adr);
  });
});
