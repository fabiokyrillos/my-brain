import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ENTRY_CLAIM_ORDER, getEntryCopy, type EntryClaimKey } from "@/features/entry/copy";

/**
 * `2O-ENTRY-002`, `-003`, `-006` and `-008` — the entry path, checked against
 * the tree rather than against itself.
 *
 * ## Why the claims are guarded at all
 *
 * The entry page is the **one surface in this product a stranger reads before
 * they can verify anything**. Every other claim the product makes is made to
 * someone who already has an account and can go and look. So `2O-ENTRY-002`
 * fixes the number of claims at four and requires each to be one a guard can
 * check against repository truth — and this is that guard. A claim that stops
 * being true fails the build instead of quietly misleading somebody.
 */

const REPO = resolve(__dirname, "../../..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");

/**
 * The same file with comments removed.
 *
 * **Three assertions in this file failed on their first run because of this**,
 * and every one of them was the guard reading its own subject out of a comment.
 * `entry-page.tsx` explains *"it does not link to `/auth/register`"* and
 * `src/app/page.tsx` records what it replaced — `redirect("/pt-BR/app")` — so a
 * scan for those strings found them in the prose that exists to say they are
 * gone.
 *
 * This repository has met the mirror image of that before: a check that passed
 * because it contained its own subject. The resolution is the same either way —
 * **test the code, and strip the commentary first** — and never the other one,
 * which is to delete the comment so the regex is happy.
 *
 * Used only for **structural** claims about code. Assertions about copy read the
 * copy module directly, where there is no commentary to confuse.
 */
const code = (relative: string) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const ENTRY_ROUTE = "src/app/[locale]/page.tsx";
const ROOT_ROUTE = "src/app/page.tsx";
const REGISTER_ROUTE = "src/app/[locale]/auth/register/page.tsx";

describe("2O-ENTRY-002: each of the four claims is true of this repository", () => {
  /**
   * The repository fact behind each claim, as an assertion over the tree.
   *
   * Keyed by `EntryClaimKey`, so a claim added to the copy module without
   * evidence here **fails to compile** — a `Record` over the union cannot be
   * partial. That is the property that keeps this guard from going stale in the
   * one direction that matters: silently not covering a new claim.
   */
  const evidence: Record<EntryClaimKey, () => void> = {
    capture: () => {
      // "You write in free text; the product separates tasks, people, projects
      // and dates, and asks when it is unsure."
      const schema = read("src/lib/ai/extraction-schema.ts");
      for (const extracted of ["task", "entit", "date", "question"]) {
        expect(schema.toLowerCase(), `the extraction schema no longer covers ${extracted}`)
          .toContain(extracted);
      }
      expect(existsSync(join(REPO, "src/features/capture/actions.ts"))).toBe(true);
    },

    stored_first: () => {
      /*
       * "Your words are stored before any model runs."
       *
       * The strong form of this is not that capture stores first — it is that
       * capture **cannot** call a model at all. It persists through
       * `capture_entry_async` and returns; the worker interprets later, out of
       * band. So the assertion is an absence with a presence beside it.
       */
      const capture = read("src/features/capture/actions.ts");
      expect(capture, "capture no longer persists through the atomic RPC")
        .toContain("capture_entry_async");
      for (const model of ["extractEntry", "AIProvider", "openai", "responses.create"]) {
        expect(capture, `capture reaches a model directly via ${model}`).not.toContain(model);
      }
    },

    own_credential: () => {
      // "The AI uses your own credential, which you supply and can remove.
      // Without it, nothing is sent to a model."
      const actions = read("src/features/byok/actions.ts");
      expect(actions).toContain("saveAiCredential");
      expect(actions, "the credential can no longer be removed").toContain("removeAiCredential");
      // And the absence of one really does gate AI, rather than being cosmetic.
      const gate = read("src/features/byok/credential-view.ts");
      expect(gate).toContain("user_ai_credentials");
    },

    documents: () => {
      // "The privacy policy and the terms of use are below, and can be read
      // before any account exists."
      const versions = read("src/features/legal/versions.ts");
      expect(versions).toContain("legalDocumentPath");
      for (const document of ["terms", "privacy"]) {
        expect(versions, `${document} is no longer a policy document`).toContain(`"${document}"`);
      }
      // Reachable without a session: the legal route lives outside `/app`, which
      // is the only tree the proxy gates.
      expect(existsSync(join(REPO, "src/app/[locale]/legal/[document]/page.tsx"))).toBe(true);
    },
  };

  for (const claim of ENTRY_CLAIM_ORDER) {
    it(`backs the \`${claim}\` claim with something in the tree`, () => {
      evidence[claim]();
    });
  }

  it("covers every declared claim, and the coverage is not vacuous", () => {
    expect(Object.keys(evidence).sort()).toEqual([...ENTRY_CLAIM_ORDER].sort());
    expect(ENTRY_CLAIM_ORDER.length).toBe(4);
  });
});

describe("2O-ENTRY-003: the page makes no availability claim", () => {
  it("never links to the register route", () => {
    const page = code("src/features/entry/entry-page.tsx");
    expect(page, "the entry page invites registration").not.toContain("/auth/register");
    // Non-vacuous: the file really is being read, and the link it does carry is
    // found by the same test.
    expect(page).toContain("/auth/login");
  });

  it("collects nothing", () => {
    // No form and no input means no address can be taken "for when it opens".
    // This is the real control against a waiting list: a list needs somewhere to
    // put an address, and there is nowhere.
    const page = code("src/features/entry/entry-page.tsx");
    for (const collector of ["<form", "<input", "<textarea"]) {
      expect(page, `the entry page renders ${collector}`).not.toContain(collector);
    }
  });

  it("promises no future opening, in either locale", () => {
    /*
     * **Promissory language only, and the waiting-list words are deliberately
     * not in this list.**
     *
     * The first version forbade them, and the pt-BR notice failed it — because
     * that notice says *"não existe lista de espera"*. A regex cannot tell a
     * denial from an invitation, and the fix is not to reword an honest sentence
     * until a pattern is satisfied. The invitation is refused **structurally**
     * by the assertion above: with no form and no input there is nowhere to put
     * an address, so the page cannot operate a list whatever it says.
     *
     * What remains here is the thing structure cannot catch: a promise about
     * *when*.
     */
    for (const locale of ["pt-BR", "en"] as const) {
      const copy = getEntryCopy(locale);
      const everything = [copy.tagline, copy.closedNotice, ...Object.values(copy.claims)].join(" ");
      expect(everything, `${locale} copy promises a future opening`)
        .not.toMatch(/\b(em breve|soon|shortly|early access|acesso antecipado|coming)\b/i);
    }
    // Non-vacuous: the pattern really matches the shape it forbids.
    expect("Opening soon").toMatch(/\bsoon\b/i);
    expect("Abrimos em breve").toMatch(/\bem breve\b/i);
  });
});

describe("2O-ENTRY-006: the closed door does not vary with input", () => {
  const surfaces = [ENTRY_ROUTE, REGISTER_ROUTE];

  it("reads the same predicate the Server Action enforces", () => {
    for (const surface of surfaces) {
      expect(read(surface), `${surface} does not read the signup gate`)
        .toMatch(/isSignupOpenIn\(process\.env\)/);
    }
    // The action really is the thing being mirrored, and it still refuses first.
    expect(read("src/features/auth/actions.ts")).toMatch(/isSignupOpenIn\(process\.env\)/);
  });

  it("derives the statement from no request input at all", () => {
    /*
     * The property that keeps a closed door from becoming a probe surface. If
     * the notice varied with an e-mail, a query parameter or a header, its
     * presence would answer a question about that input — which is exactly what
     * `SH-SIGNUP-001` exists to prevent, one layer down.
     *
     * Checked structurally: whatever else these files read, the value passed as
     * the gate is the environment call and nothing else.
     */
    for (const surface of surfaces) {
      const source = code(surface);
      // Two spellings, because one route computes it into a `const` and the
      // other passes it straight as a JSX prop. Both are collected and both must
      // resolve to the environment call alone.
      const bound = [...source.matchAll(/\bsignupOpen\s*=\s*([^;\n]+)/g)]
        // One pattern, two spellings: a `const` binding in the register route
        // and a JSX prop in the entry route. Stripping the brace wrapper and any
        // trailing element syntax normalises them to the expression itself,
        // which is the thing being asserted about.
        .map((match) => match[1].trim().replace(/^\{/, "").replace(/\}\s*\/?>?\s*$/, "").trim());

      expect(bound.length, `${surface} does not compute signupOpen`).toBeGreaterThan(0);
      for (const value of bound) {
        expect(value, `${surface} makes the gate depend on request input`)
          .toBe("isSignupOpenIn(process.env)");
      }
    }
    // Non-vacuous, and in the direction that matters: a gate derived from a
    // request value really is a different string, so it really would fail.
    const hostile = "const signupOpen = isSignupOpenIn(process.env) && email.endsWith('@x');";
    expect([...hostile.matchAll(/\bsignupOpen\s*=\s*([^;\n]+)/g)][0][1].trim())
      .not.toBe("isSignupOpenIn(process.env)");
  });
});

describe("2O-ENTRY-001 and -004: the front door negotiates rather than assuming", () => {
  it("no longer redirects everyone to the Portuguese app", () => {
    const root = code(ROOT_ROUTE);
    expect(root, "the unconditional redirect is back").not.toMatch(/redirect\(["']\/pt-BR\/app["']\)/);
    expect(root).toContain("entryDestination");
    expect(root, "the header is not read").toContain("accept-language");
    // Non-vacuous: the pattern really matches the two lines this file used to be.
    expect('redirect("/pt-BR/app");').toMatch(/redirect\(["']\/pt-BR\/app["']\)/);
  });

  it("keeps the decision in a pure function rather than in the route", () => {
    // The split `signup-policy.ts` uses: the decision is pure and tested
    // directly, and the route is the thin environment read.
    expect(existsSync(join(REPO, "src/features/entry/destination.ts"))).toBe(true);
    expect(existsSync(join(REPO, "src/features/entry/destination.test.ts"))).toBe(true);
  });
});

describe("2O-ENTRY-008: no surface in the entry path is a dead end", () => {
  /**
   * Each entry-path route, with the component that carries its outbound paths
   * where the route itself delegates.
   *
   * `consent` and `account-state` render a feature surface and hold no link of
   * their own, so a scan of the route file alone would call both dead ends and
   * be wrong. Following the delegation is what makes the audit true rather than
   * merely strict.
   */
  const ENTRY_PATH: readonly { readonly route: string; readonly files: readonly string[] }[] = [
    { route: "login", files: ["src/app/[locale]/auth/login/page.tsx"] },
    { route: "register", files: [REGISTER_ROUTE] },
    { route: "recover", files: ["src/app/[locale]/auth/recover/page.tsx"] },
    { route: "reset", files: ["src/app/[locale]/auth/reset/page.tsx"] },
    { route: "resend", files: ["src/app/[locale]/auth/resend/page.tsx"] },
    {
      route: "consent",
      files: ["src/app/[locale]/consent/page.tsx", "src/features/legal/consent-surface.tsx"],
    },
    {
      route: "account-state",
      files: [
        "src/app/[locale]/account-state/page.tsx",
        "src/features/shell/account-state-surface.tsx",
      ],
    },
    { route: "entry", files: [ENTRY_ROUTE, "src/features/entry/entry-page.tsx"] },
  ];

  /** A way onward: a link somewhere else, or a form that does something. */
  function outboundPaths(files: readonly string[]): string[] {
    const source = files.map(read).join("\n");
    const links = [...source.matchAll(/href=\{?[`"']([^`"'}]+)/g)].map((match) => `link:${match[1]}`);
    const forms = [...source.matchAll(/<form\s+action=/g)].map((_match, index) => `form:${index}`);
    return [...new Set([...links, ...forms])];
  }

  for (const { route, files } of ENTRY_PATH) {
    it(`${route} offers a way onward`, () => {
      for (const file of files) {
        expect(existsSync(join(REPO, file)), `${file} is missing`).toBe(true);
      }
      expect(outboundPaths(files), `${route} is a dead end`).not.toEqual([]);
    });
  }

  it("audits every route the requirement names, and no fewer", () => {
    expect(ENTRY_PATH.map((entry) => entry.route).sort()).toEqual([
      "account-state", "consent", "entry", "login", "recover", "register", "resend", "reset",
    ]);
  });

  it("rejects a page with neither a link nor a form", () => {
    // The planted divergence. Without it, an extractor that silently stopped
    // matching would report every route as fine.
    const deadEnd = "export default function Page() { return <p>Nothing here.</p>; }";
    const links = [...deadEnd.matchAll(/href=\{?[`"']([^`"'}]+)/g)];
    const forms = [...deadEnd.matchAll(/<form\s+action=/g)];
    expect([...links, ...forms]).toEqual([]);
  });

  it("finds a real link and a real form, so the extractor is not blind", () => {
    const live = '<Link href={`/${locale}/auth/login`}>x</Link><form action={signOut} />';
    expect([...live.matchAll(/href=\{?[`"']([^`"'}]+)/g)]).toHaveLength(1);
    expect([...live.matchAll(/<form\s+action=/g)]).toHaveLength(1);
  });
});
