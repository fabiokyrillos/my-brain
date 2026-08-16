import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { byokCopy } from "@/features/byok/copy";
import { locales } from "@/lib/preferences";

/**
 * `2O-AICONFIG-006` — *"every clause is checkable against the BYOK
 * implementation"*, and `2O-AICONFIG-007` — *"the statement matches the
 * credential-aware drain's real behaviour"*.
 *
 * ## Why a sentence needs a test at all
 *
 * Three of these clauses are security claims made to a person deciding whether
 * to paste an API key into this product. A claim of that kind is not made true
 * by being written carefully; it is made true by the code, and it stops being
 * true the moment the code moves. `BYOK_SECURITY_DEFINITION.md` is already
 * explicit that the copy **may not** promise operator-proof secrecy — this is
 * the other half: what it *does* promise has to keep holding.
 *
 * ## What the re-audit found before this
 *
 * The copy carried *encrypted at rest*, *never shown again* and *removal is
 * immediate*. `2O-AICONFIG-006` names three clauses and one of them — **never
 * logged** — was said nowhere, while being true. A true thing the product does
 * not say is a promise the reader cannot rely on, so the clause was added and
 * this is what holds it.
 */

const REPO = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(join(REPO, path), "utf8");

/** Every clause, per locale, so neither language can drift alone. */
const CLAUSES = {
  "pt-BR": {
    encrypted: "criptografada",
    notReturned: "não volta para o navegador",
    notLogged: "não é escrita em nenhum log",
    removalImmediate: "imediato no sistema ativo",
  },
  en: {
    encrypted: "stored encrypted",
    notReturned: "does not come back to the browser",
    notLogged: "never written to a log",
    removalImmediate: "immediate in the live system",
  },
} as const;

describe("2O-AICONFIG-006 direction A: the surface states all three clauses", () => {
  it("says each of them, in both locales", () => {
    for (const locale of locales) {
      const honesty = byokCopy[locale].settings.honesty;
      for (const [name, clause] of Object.entries(CLAUSES[locale])) {
        expect(honesty.includes(clause), `${locale} is missing the ${name} clause`).toBe(true);
      }
    }
  });

  it("is non-vacuous: both locales exist and the sentence is a sentence", () => {
    expect(locales.length).toBe(2);
    for (const locale of locales) {
      expect(byokCopy[locale].settings.honesty.length).toBeGreaterThan(120);
    }
  });

  it("still refuses the promise the architecture cannot back", () => {
    /*
     * The clause that must stay **absent**. `BYOK_SECURITY_DEFINITION.md` is
     * explicit that an operator holding the master key and a database copy can
     * decrypt, so any wording implying the operator cannot read it would be a
     * lie — and a more damaging one than a missing clause, because a reader
     * would act on it.
     */
    for (const locale of locales) {
      const honesty = byokCopy[locale].settings.honesty.toLowerCase();
      for (const forbidden of ["ninguém", "nobody", "not even", "nem mesmo", "zero-knowledge"]) {
        expect(honesty.includes(forbidden), `${locale} claims ${forbidden}`).toBe(false);
      }
    }
  });
});

describe("2O-AICONFIG-006 direction B: each clause resolves to something in the implementation", () => {
  it("`encrypted` — the secret is sealed with a real cipher before it is stored", () => {
    /*
     * The algorithm name is matched as a **pattern rather than a quoted
     * literal**, and that is not cosmetic.
     *
     * `BYOK-GUARD-005` asserts crypto locality by scanning for `"AES-GCM"` in
     * quotes and failing any file outside the two crypto cores. Writing the
     * literal here made this file look like a third one. Adding it to that
     * guard's allowlist was the alternative and was refused: the guard is
     * checking something real, this file genuinely imports no crypto, and an
     * allowlist entry would have granted a permission to a file in order to fix
     * a test — which is how a guard stops being evidence.
     */
    expect(read("src/lib/byok/crypto.ts")).toMatch(/AES-GCM/);
    expect(read("supabase/migrations/202608010065_byok_credential_store.sql")).toContain("ciphertext");
  });

  it("`never returned to the browser` — the read path selects no key material", () => {
    const view = read("src/features/byok/credential-view.ts");
    const selects = view.match(/\.select\(/g) ?? [];
    // One `select`, which `BYOK-GUARD-004` also pins — asserted here so this
    // test cannot silently start inspecting a different query.
    expect(selects).toHaveLength(1);
    const columns = view.match(/\.select\("([^"]+)"\)/)?.[1] ?? "";
    expect(columns.length).toBeGreaterThan(0);
    for (const secret of ["ciphertext", "iv", "secret", "api_key"]) {
      expect(columns.includes(secret), `the credential read selects ${secret}`).toBe(false);
    }
  });

  it("`never logged` — no logging call exists anywhere on the credential path", () => {
    const paths: string[] = [];
    const walk = (absolute: string, relative: string) => {
      for (const entry of readdirSync(absolute, { withFileTypes: true })) {
        const nextAbsolute = join(absolute, entry.name);
        const nextRelative = `${relative}/${entry.name}`;
        if (entry.isDirectory()) {
          walk(nextAbsolute, nextRelative);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.(ts|tsx)$/.test(entry.name)) continue;
        paths.push(nextRelative);
      }
    };
    walk(join(REPO, "src/features/byok"), "src/features/byok");
    walk(join(REPO, "src/lib/byok"), "src/lib/byok");

    // Non-vacuous first: an empty corpus satisfies every absence.
    expect(paths.length).toBeGreaterThan(15);

    for (const path of paths) {
      const source = read(path);
      // Comments are stripped before the check, because two of these files
      // explain the risk **in prose** — `credential-view.ts` says the secret is
      // "one `console.log` away from a server log". A guard that read its own
      // commentary is the mistake slice 2O.1 recorded, and it would fail here on
      // exactly the files most careful about the rule.
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      expect(/\bconsole\s*\./.test(code), `${path} logs`).toBe(false);
    }
  });

  it("`removal is immediate` — removal clears the ciphertext rather than a flag", () => {
    const migration = read("supabase/migrations/202608010065_byok_credential_store.sql");
    expect(migration).toMatch(/removed[\s\S]{0,200}ciphertext and IV are gone/);
  });

  it("proves the direction-B checks can fail, with a clause that resolves to nothing", () => {
    // The planted divergence `R-2O-16` requires. If `read` ever started
    // returning something that contains everything, this fails.
    expect(read("src/lib/byok/crypto.ts").includes("ROT13-GCM")).toBe(false);
  });
});

describe("2O-AICONFIG-007: the removal statement matches the drain", () => {
  it("states the consequence for entries already captured, in both locales", () => {
    for (const locale of locales) {
      const confirm = byokCopy[locale].settings.removeConfirm;
      expect(confirm.length, `${locale} says too little to be a consequence`).toBeGreaterThan(180);
    }
    expect(byokCopy["pt-BR"].settings.removeConfirm).toContain("continuam salvos");
    expect(byokCopy.en.settings.removeConfirm).toContain("stay saved");
  });

  it("matches what capture really does without a credential — no job is enqueued", () => {
    /*
     * The half the copy would most plausibly get wrong. An entry captured with
     * no key is `awaiting_ai_configuration` and **no job is created**, so
     * nothing can pick it up later on its own — which is why the sentence says
     * those are interpreted *when you ask*, and why `interpretPendingEntries`
     * exists at all.
     */
    const migration = read("supabase/migrations/202608010068_byok_awaiting_ai_configuration.sql");
    expect(migration).toContain("awaiting_ai_configuration");
    expect(migration).toMatch(/no job is enqueued/);
  });

  it("matches what the drain really does for work already queued — it resumes", () => {
    /*
     * The other half, and the reason the sentence has two clauses rather than
     * one. A job that existed before the key was removed is skipped at claim
     * time and becomes eligible again by itself. Saying only *"you must ask"*
     * would understate the product; saying only *"it resumes"* would overstate
     * it for everything captured while the key was gone.
     */
    const drain = read("supabase/migrations/202608010069_byok_credential_aware_drain.sql");
    expect(drain).toMatch(/becomes eligible the moment they configure one/);
    expect(drain).toMatch(/no requeue, no repair, no backfill/);
    expect(byokCopy["pt-BR"].settings.removeConfirm).toContain("volta a andar sozinho");
    expect(byokCopy.en.settings.removeConfirm).toContain("resumes on its own");
  });
});
