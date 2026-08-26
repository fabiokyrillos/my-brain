/**
 * Phase 2S — slice 2S.2. **One authority for the verbs, proved by census.**
 *
 * `2S-ACT-011`: *"The verb set and its copy are read from ONE source and
 * asserted equal across `/app/notifications` and the attention surface; a verb
 * present in one and absent from the other fails."*
 *
 * `2S-TRUST-010`: *"A census names every Server Action the new surface
 * dispatches to, and each already existed before this phase. A requirement that
 * needs a new writer is a stop condition that halts the phase."*
 *
 * ## Why this is a census and not a pair of component tests
 *
 * Two component tests can only ever assert that the two surfaces agree **as
 * they are written today**. Convergence "by construction" is a claim about the
 * import graph, and the import graph is what this file reads.
 *
 * Four properties, each with a control that can fail:
 *
 * 1. The vocabulary is defined **once**, and nothing else defines one.
 * 2. Every surface mounts the verbs through **one function**, handing it the
 *    projection's own row — so no surface can filter, re-order or invent a verb
 *    set of its own.
 * 3. Every surface dispatches through **one handler bundle**, so no surface can
 *    add a sixth destination without the census seeing it.
 * 4. The five destinations are exactly the pre-existing authorities, enumerated
 *    by name.
 *
 * ## The non-vacuity control
 *
 * A census that found no surfaces would satisfy every "no surface does X" clause
 * by finding no surfaces at all — the failure mode this repository has paid for
 * more than once. So the surface list is **derived** from the tree and asserted
 * to hold **at least two** members, and the two known ones are asserted by name.
 * A scan whose result set is empty fails before any closed-set assertion runs.
 *
 * ## A guard must forbid the act, not the word
 *
 * This file's own first run found two false positives and neither was a defect:
 * every module in the feature *describes* `isEligibleStatus` in prose, and the
 * notifications page carries a JSX comment naming `<NotificationRowActions>`.
 * Failing on those would have taught the next author to delete an accurate
 * comment to make a guard pass. So every scan below runs over the source with
 * its comments removed, and the eligibility scan looks for an **import** rather
 * than for the identifier.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const REPO = resolve(__dirname, "../../..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");

const VOCABULARY = "src/features/notifications/verbs.ts";
const MOUNT = "src/features/notifications/notification-row-actions.tsx";
const HANDLERS = "src/features/notifications/verb-handlers.ts";
const PROJECTION = "src/features/notifications/row-projection.ts";
const HOME_DATA = "src/features/shell/home-dashboard.tsx";

/** The two surfaces, named — and re-derived below rather than trusted. */
const NOTIFICATIONS_PAGE = "src/app/[locale]/app/notifications/page.tsx";
const ATTENTION_ROW = "src/features/notifications/attention-notice-row.tsx";

/** Every non-test source file, so a census cannot miss a caller by guessing a directory. */
function sourceFiles(dir = "src", acc: string[] = []): string[] {
  for (const entry of readdirSync(join(REPO, dir), { withFileTypes: true })) {
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) sourceFiles(relative, acc);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) acc.push(relative);
  }
  return acc;
}

const SOURCES = sourceFiles();

const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /^\s*\/\/.*$/gm;

/** The source with its comments removed, so a scan measures the act. */
function code(relative: string): string {
  return read(relative).replace(BLOCK_COMMENT, "").replace(LINE_COMMENT, "");
}

/** Files that actually render a notice's verbs: they mount `<NotificationVerbs`. */
function mountingSurfaces(): string[] {
  return SOURCES.filter((file) => code(file).includes("<NotificationVerbs"));
}

describe("2S-ACT-011 (1/4): the vocabulary is defined once", () => {
  it("finds the verb set in exactly one module", () => {
    const definers = SOURCES.filter((file) => /export const VERBS\b/.test(code(file)));
    expect(definers).toEqual([VOCABULARY]);
  });

  it("finds no second table of verb copy anywhere in the tree", () => {
    /*
     * The control that can fail: `getVerbCopy` is the only way to a label, so a
     * surface that hard-coded "Concluir tarefa" or "Complete task" beside its
     * own button would be a second copy of the vocabulary even though `VERBS`
     * stayed singular. Both locales are checked, because a drift that only
     * happened in one would still be a drift.
     */
    const vocabulary = read(VOCABULARY);
    for (const label of ["Concluir tarefa", "Silenciar este assunto", "Complete task", "Silence this subject"]) {
      expect(vocabulary, `${label} must live in the vocabulary`).toContain(label);
      const elsewhere = SOURCES.filter((file) => file !== VOCABULARY && code(file).includes(label));
      expect(elsewhere, `${label} is spelled out outside the one vocabulary`).toEqual([]);
    }
  });

  it("asks the command taxonomy for eligibility in exactly one place", () => {
    /*
     * `2S-ACT-005`. Two surfaces asking `isEligibleStatus` separately would be
     * two eligibility rules that agree until one of them is edited. The
     * vocabulary asks; nothing else in the notification feature does.
     */
    const askers = SOURCES.filter(
      (file) =>
        file.startsWith("src/features/notifications/") &&
        /import\s*\{[^}]*\bisEligibleStatus\b/.test(code(file)),
    );
    expect(askers).toEqual([VOCABULARY]);
  });
});

describe("2S-ACT-011 (2/4): every surface mounts the verbs through one function", () => {
  it("finds at least two surfaces, and both known ones by name", () => {
    /*
     * THE NON-VACUITY CONTROL. Every closed-set assertion below is about what
     * the surfaces do NOT do, and an empty set satisfies all of them. So the set
     * is derived from the tree first and asserted non-trivial.
     */
    const surfaces = mountingSurfaces();
    expect(surfaces.length, "the census found no surface mounting the verbs").toBeGreaterThanOrEqual(2);
    expect(surfaces).toContain(NOTIFICATIONS_PAGE);
    expect(surfaces).toContain(ATTENTION_ROW);
  });

  it("has every surface hand over the projection's own row, and build no verb props itself", () => {
    /*
     * SCOPED TO THE MOUNT'S OWN ATTRIBUTES, and the first version was not.
     *
     * It scanned the whole file for the four derived prop names, and slice 2S.3
     * failed it immediately -- because the attention row grew an *Abrir* control
     * that legitimately needs `notificationId` and `subjectLabel` of its own.
     * That control mounts no verbs at all.
     *
     * **A guard must forbid the act, not the word**, for the second time in this
     * phase. The act is *assembling a verb set at the call site*, so the scan
     * reads the `<NotificationVerbs …/>` element's attributes and nothing else.
     * That is stricter than the file-wide version, not looser: it also proves
     * every mount really carries `row={row}` rather than merely that the file
     * mentions it somewhere.
     */
    for (const surface of mountingSurfaces()) {
      const mounts = [...code(surface).matchAll(/<NotificationVerbs([^>]*)\/>/g)].map((m) => m[1]);
      expect(mounts.length, `${surface} mounts the verbs in a shape this scan cannot read`)
        .toBeGreaterThan(0);
      for (const attributes of mounts) {
        expect(attributes, `${surface} does not hand over the projected row`).toContain("row={row}");
        for (const derived of ["primaryVerb=", "menuVerbs=", "subjectLabel=", "notificationId="]) {
          expect(attributes, `${surface} assembles ${derived} at the mount`).not.toContain(derived);
        }
      }
    }
  });

  it("has no surface reach past the mount to the row component directly", () => {
    const direct = SOURCES.filter(
      (file) => file !== MOUNT && /<NotificationRowActions\b/.test(code(file)),
    );
    expect(direct).toEqual([]);
  });

  it("derives the verb set inside the projection, from the one authority", () => {
    const projection = code(PROJECTION);
    expect(projection).toContain("verbsForRow");
    expect(projection).toContain("primaryVerbFor");
    expect(projection).toContain("menuVerbsFor");
  });
});

describe("2S-TRUST-010 (3/4): every surface dispatches through one handler bundle", () => {
  it("declares the bundle in exactly one module", () => {
    const definers = SOURCES.filter((file) => /export const NOTIFICATION_VERB_HANDLERS\b/.test(code(file)));
    expect(definers).toEqual([HANDLERS]);
  });

  it("has no surface assemble a bundle of its own", () => {
    /*
     * A second literal typed as `NotificationVerbHandlers` would be a second
     * place the five destinations are chosen. Type-only imports are how a
     * surface legitimately refers to the shape (Home threads it as a prop), so
     * the search is for a VALUE annotation, not for the word.
     */
    const assemblers = SOURCES.filter(
      (file) => file !== HANDLERS && /:\s*NotificationVerbHandlers\s*=/.test(code(file)),
    );
    expect(assemblers).toEqual([]);
  });

  it("reaches both surfaces from that one bundle", () => {
    /*
     * The notifications page imports it directly; Home imports it in its data
     * half and threads it to the view, because `home-view.tsx` renders under
     * jsdom and must not import a `server-only` module. Both paths are asserted,
     * so neither can quietly become a locally-built bundle.
     */
    expect(code(NOTIFICATIONS_PAGE)).toContain('from "@/features/notifications/verb-handlers"');
    expect(code(HOME_DATA)).toContain('from "@/features/notifications/verb-handlers"');
    expect(code(HOME_DATA)).toContain("noticeHandlers={NOTIFICATION_VERB_HANDLERS}");
  });
});

describe("2S-TRUST-010 (4/4): the five destinations, enumerated and all pre-existing", () => {
  /**
   * The closed set, by module and export. Each already existed before Phase 2S —
   * `suppressNotificationSubject` is the youngest, and it shipped in slice 2S.1
   * as the caller the RPC had been deployed without, not as a writer invented to
   * make these controls possible.
   */
  const DESTINATIONS = [
    ["markNotification", "@/features/agent/actions", "src/features/agent/actions.ts"],
    ["applyWorkItemAction", "@/features/operations/actions", "src/features/operations/actions.ts"],
    ["undoWorkOperation", "@/features/task-commands/actions", "src/features/task-commands/actions.ts"],
    ["applyTaskDetailCommand", "@/features/task-commands/detail-actions", "src/features/task-commands/detail-actions.ts"],
    ["suppressNotificationSubject", "./actions", "src/features/notifications/actions.ts"],
  ] as const;

  it("imports exactly these five, from exactly these modules", () => {
    const bundle = code(HANDLERS);
    for (const [name, module] of DESTINATIONS) {
      expect(bundle, `${name} is not imported from ${module}`).toContain(`import { ${name} } from "${module}"`);
    }
  });

  it("names no sixth destination", () => {
    /*
     * Derived from the bundle's own import list rather than counted by eye: a
     * number typed beside a list is a second place the truth has to be
     * maintained, and this repository has already had one lag behind its list.
     */
    const imported = [...code(HANDLERS).matchAll(/^import \{ (\w+) \} from /gm)].map((match) => match[1]);
    expect(imported.slice().sort()).toEqual(DESTINATIONS.map(([name]) => name).slice().sort());
  });

  it("keeps every destination a real export of the module it names", () => {
    /*
     * The control that makes the previous two more than a string match: an
     * import naming a function that does not exist would still satisfy them.
     */
    for (const [name, , file] of DESTINATIONS) {
      expect(read(file), `${file} does not export ${name}`)
        .toMatch(new RegExp(`export async function ${name}\\b`));
    }
  });

  it("adds no Server Action of its own", () => {
    /*
     * The stop condition, stated as an assertion. The bundle is a list of
     * references; the moment it grows a `"use server"` directive it has become a
     * writer, which is the thing `2S-TRUST-010` halts the phase over.
     */
    for (const file of [HANDLERS, MOUNT, ATTENTION_ROW]) {
      expect(read(file), `${file} declares a Server Action`).not.toContain('"use server"');
    }
  });
});
