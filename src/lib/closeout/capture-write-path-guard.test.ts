/**
 * `2J-CAPTURE-004` — the no-second-write-path guard, and gate G-2J.3.
 *
 * ## The property
 *
 * An entry is created in exactly one place. `captureEntry` calls the
 * `capture_entry_async` RPC; nothing else may. Unified capture is the feature
 * most likely to break this, because "one capture surface" reads as an
 * invitation to write one unifying record — and the second writer would look
 * entirely reasonable in review, since it would be doing the same thing the
 * first one does.
 *
 * `T-2I-02` is inherited from Phase 2I unchanged. This is its Phase 2J form.
 *
 * ## Why the fixture matters more than the scan
 *
 * The gate requires this guard to **fail against a planted second path before
 * the unified surface is written**. A guard authored after the code is a guard
 * shaped to pass: it will happily assert whatever the code already does. So the
 * detector is exercised against synthetic violations that were written first,
 * and the repository scan is the *second* assertion, not the only one.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = join(__dirname, "..", "..", "..");
const SRC = join(REPO, "src");

/**
 * The two entry-write RPCs, and why they get different rules.
 *
 * A first draft demanded one caller for both, and the guard immediately found
 * `src/features/byok/actions.ts` calling `enqueue_entry_reprocessing`. That is
 * not a violation -- it is `BYOK-CAPTURE-004`/`006`, the bounded "interpret my
 * pending entries" action a user runs after configuring a credential. **The
 * allowlist was wrong, not the code.**
 *
 * The distinction is real and worth keeping:
 *
 *   - `capture_entry_async` **creates** an entry. This is `T-2I-02` proper, and
 *     the property is exactly one caller. A second one is a second write path.
 *   - `enqueue_entry_reprocessing` re-runs interpretation on an entry that
 *     **already exists**. It creates no entry, so a second caller is not a
 *     second write path -- but it still may not arrive unnoticed, so the callers
 *     are named rather than counted.
 *
 * Collapsing the two into one rule would have meant either exempting a
 * legitimate caller by path (hiding the difference) or forbidding a shipped
 * feature (wrong).
 */
const CREATES_AN_ENTRY = "capture_entry_async";
const CREATOR = join("src", "features", "capture", "actions.ts");

const REPROCESS_RPC = "enqueue_entry_reprocessing";
const REPROCESS_CALLERS = [
  // The entry detail's "reinterpret" action, and slice 2J.2's in-place retry,
  // which reuses it rather than adding its own.
  join("src", "features", "interpretations", "actions.ts"),
  // `BYOK-CAPTURE-004`/`006` -- draining entries stored while no credential was
  // configured. Bounded and explicit; it interprets, it does not capture.
  join("src", "features", "byok", "actions.ts"),
];

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

/** A `.rpc("<name>"…)` call, in code rather than in a comment. */
function rpcCallers(rpc: string): string[] {
  const pattern = new RegExp(String.raw`\.rpc\(\s*["'\`]${rpc}["'\`]`);
  return walk(SRC)
    .filter((path) => !path.endsWith(".test.ts") && !path.endsWith(".test.tsx"))
    .filter((path) => {
      const code = readFileSync(path, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      return pattern.test(code);
    })
    .map((path) => relative(REPO, path));
}

describe("2J-CAPTURE-004: exactly one path creates an entry", () => {
  it("only captureEntry calls the RPC that creates an entry", () => {
    expect(rpcCallers(CREATES_AN_ENTRY)).toEqual([CREATOR]);
  });

  it("names every caller that re-enqueues interpretation on an existing entry", () => {
    expect(rpcCallers(REPROCESS_RPC).sort()).toEqual([...REPROCESS_CALLERS].sort());
  });

  it("is not vacuous: it detects a planted second caller", () => {
    // G-2J.3. Written and proved before the unified surface existed. Each shape
    // below is a real way a second write path could arrive -- a new action, a
    // helper, a route handler -- and the detector must see all of them.
    const pattern = new RegExp(String.raw`\.rpc\(\s*["'\`]capture_entry_async["'\`]`);
    for (const planted of [
      'const { data } = await supabase.rpc("capture_entry_async", { p_original_content: text });',
      "await client.rpc('capture_entry_async', payload);",
      'await supabase.rpc(  "capture_entry_async"  , args);',
    ]) {
      expect(pattern.test(planted), planted).toBe(true);
    }
  });

  it("does not fire on prose that merely names the RPC", () => {
    // The guard reads code, not commentary. Three Phase 2I guards failed on
    // correct product code for exactly this reason.
    const pattern = new RegExp(String.raw`\.rpc\(\s*["'\`]capture_entry_async["'\`]`);
    expect(pattern.test("// capture_entry_async is the only entry writer")).toBe(false);
    expect(pattern.test("* persists via capture_entry_async, atomically")).toBe(false);
  });

  it("scans a non-trivial number of files, so a broken walk cannot report clean", () => {
    expect(walk(SRC).length).toBeGreaterThan(200);
  });
});

describe("2J-CAPTURE-002/003 and 2P-CAPTURE-003: the unified surface dispatches, it does not unify", () => {
  /*
    Retargeted by slice 2P.3. The property is the same one Phase 2J wrote it
    for -- the surface that offers every modality must not become the thing
    that writes them -- and the surface simply moved: `unified-capture.tsx`
    dispatched between three panels, `composer.tsx` puts all three in one row
    over two forms. The file name changed; not one assertion below was weakened
    to make it pass.
  */
  const surface = readFileSync(join(SRC, "features", "capture", "composer.tsx"), "utf8");
  /**
   * Comments stripped before every match below.
   *
   * The first run of this block failed on the component's own doc block, which
   * explains that it declares no `"use server"` -- the guard reading the prose
   * that describes the property as a violation of it. Same defect, same fix,
   * third time in this phase: match code, never commentary.
   */
  const code = surface.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("declares no Server Action of its own", () => {
    // A `"use server"` here would be a write path wearing a component's name.
    expect(code).not.toMatch(/["']use server["']/);
  });

  it("touches no Supabase client and no RPC", () => {
    expect(code).not.toMatch(/createClient|supabase|\.rpc\(/);
  });

  it("receives both existing actions as props rather than importing them", () => {
    // Importing `captureEntry` into a client component would pull `server-only`
    // into the browser bundle AND make the surface the owner of the write. It
    // is neither: the page owns both, and passes them down.
    expect(code).not.toMatch(/from "@\/features\/capture\/actions"/);
    expect(code).not.toMatch(/from "@\/features\/agent\/actions"/);
    expect(code).toMatch(/action: CaptureAction/);
    expect(code).toMatch(/attachmentAction: AgentFormAction/);
  });

  it("keeps the two write paths on two form owners, not one action that branches", () => {
    /*
      `2P-CAPTURE-003` and `T-1`, structurally. The rendered proof is
      `composer.test.tsx` asserting `fileInput.form !== textarea.form`; this is
      the same property read off the source, because the way it would be lost is
      a refactor that "simplifies" the sibling form away and moves the file input
      into the entry form -- at which point one action starts receiving files.
    */
    expect(code.match(/<form/g) ?? []).toHaveLength(2);
    // The file input and the upload submit both point back at the sibling form.
    expect(code.match(/form=\{attachmentFormId\}/g) ?? []).toHaveLength(2);
  });
});
