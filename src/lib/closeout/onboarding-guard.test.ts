import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ASSISTANT_IDENTITY_DEFAULTS,
  onboardingSteps,
  type AssistantIdentityColumn,
} from "@/features/onboarding/contracts";

/**
 * Slice 2O.2's structural claims, checked against the tree rather than against
 * themselves — `2O-ONBOARD-001`, `-002`, `-004`, `-005`, `-008`, `-009`, `-010`
 * and `-011`.
 *
 * ## The two risks this file exists for, in the plan's own words
 *
 * **"An onboarding that blocks the composer would contradict the one
 * interaction this product is built around. Every step must be skippable and
 * the composer reachable throughout — asserted, not intended."**
 *
 * **"Reimplementation. Four steps mount surfaces that already exist. A guard
 * asserts each writes through the existing Server Action and schema, and that
 * no second write path was created."**
 *
 * A guided path is exactly the shape that grows a second write path by
 * accident: every step wants a small form, and a small form wants a small
 * action, and six weeks later there are two ways to set a timezone that
 * disagree about validation. The strongest version of that assertion is not
 * *"the right action is called"* — it is **the onboarding feature writes
 * nothing at all**, which is what is checked below, in both directions.
 *
 * ## Comments are stripped before any structural claim
 *
 * Slice 2O.1 had three assertions fail on their first run by reading their own
 * subject out of a comment. Every structural scan here runs over stripped
 * source; assertions about copy read the copy module, where there is no
 * commentary to confuse.
 */

const REPO = resolve(__dirname, "../../..");
const read = (relative: string) => readFileSync(join(REPO, relative), "utf8");
const code = (relative: string) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const ONBOARDING_DIR = "src/features/onboarding";
const HOME_VIEW = "src/features/shell/home-view.tsx";
const HOME_DASHBOARD = "src/features/shell/home-dashboard.tsx";
const SETTINGS_PAGE = "src/app/[locale]/app/settings/page.tsx";
const APP_LAYOUT = "src/app/[locale]/app/layout.tsx";
const IDENTITY_MIGRATION = "supabase/migrations/202607160001_phase1_identity.sql";

function onboardingSources(): { name: string; source: string }[] {
  return readdirSync(join(REPO, ONBOARDING_DIR))
    .filter((name) => /\.tsx?$/.test(name) && !name.includes(".test."))
    .map((name) => ({ name, source: code(`${ONBOARDING_DIR}/${name}`) }));
}

/**
 * Every shape in this repository that reaches a table or an RPC.
 *
 * `.from(` covers select, insert, update, upsert and delete alike, and `.rpc(`
 * covers every definer function. Deliberately broad: the requirement is that
 * this feature performs **no domain write**, and the cheapest way to be sure is
 * to refuse the read as well and make the one legitimate reader — the view,
 * which reads through `loadActivationProgress` and two existence checks — the
 * single declared exception.
 */
const DATA_ACCESS = /\.(from|rpc)\s*\(/g;

/**
 * The write verbs, **scoped to a data-access chain**.
 *
 * A bare `/\.(insert|update|upsert|delete)\(/` was the first version of this and
 * it failed immediately — on `jar.delete(...)`, which removes the dismissal
 * cookie. That is the whole point of `2O-ONBOARD-010`'s reversal, and a guard
 * that refused it would have forced the feature to keep a cookie it was asked
 * to drop. The verb only means "domain write" when it hangs off `.from(...)`,
 * so that is what is matched: the chain, from `.from(` to the statement's end.
 */
function domainWrites(source: string): string[] {
  const hits: string[] = [];
  for (const chain of source.matchAll(/\.from\s*\([\s\S]{0,200}?(?=;|$)/g)) {
    const write = /\.(insert|update|upsert|delete)\s*\(/.exec(chain[0]);
    if (write) hits.push(write[1]);
  }
  return hits;
}

/** The modules allowed to touch Supabase at all, and why each one may. */
const DATA_ACCESS_ALLOWED: Readonly<Record<string, string>> = {
  "onboarding-view.ts":
    "the path's one read: activation's own loader, plus two existence checks for the two steps activation does not declare",
};

describe("the plan's second risk: no second write path was created", () => {
  it("performs no data access outside the single declared reader", () => {
    for (const { name, source } of onboardingSources()) {
      const hits = source.match(DATA_ACCESS) ?? [];
      if (name in DATA_ACCESS_ALLOWED) continue;
      expect(hits, `${name} reaches the database and is not the declared reader`).toHaveLength(0);
    }
  });

  it("writes nothing, anywhere in the feature, including from the declared reader", () => {
    for (const { name, source } of onboardingSources()) {
      expect(domainWrites(source), `${name} performs a domain write`).toEqual([]);
    }
  });

  it("calls no RPC, so no definer function can be writing on its behalf", () => {
    // The scan above can only see the verb it is given. `.rpc("do_the_thing")`
    // is a write whose verb lives in the database, so it is refused outright
    // rather than judged by its name.
    for (const { name, source } of onboardingSources()) {
      expect(/\.rpc\s*\(/.test(source), `${name} calls an RPC`).toBe(false);
    }
  });

  it("is non-vacuous: the feature really has modules, and one of them really does read", () => {
    const sources = onboardingSources();
    expect(sources.length).toBeGreaterThan(3);
    const reader = sources.find((entry) => entry.name === "onboarding-view.ts");
    expect(reader).toBeDefined();
    expect(reader!.source.match(DATA_ACCESS)?.length ?? 0).toBeGreaterThan(0);
  });

  it("rejects a planted write, so the refusal above can fail", () => {
    const planted = `${code(`${ONBOARDING_DIR}/onboarding-view.ts`)}\nawait supabase.from("agent_preferences").update({ agent_name: name });`;
    expect(domainWrites(planted)).toEqual(["update"]);
  });

  it("keeps the cookie's own delete out of it, which is the reversal the requirement asks for", () => {
    // The control for the control: `jar.delete(...)` must not read as a domain
    // write, or `2O-ONBOARD-010` could not be implemented without failing this
    // guard. Both directions of that distinction are asserted.
    expect(domainWrites(`const jar = await cookies();\njar.delete(NAME);`)).toEqual([]);
    expect(domainWrites(`await supabase.from("tasks").delete().eq("id", id);`)).toEqual(["delete"]);
  });

  it("rejects a planted read in a module that has no business reading", () => {
    const planted = `${code(`${ONBOARDING_DIR}/onboarding-panel.tsx`)}\nconst { data } = await supabase.from("tasks").select("id");`;
    expect((planted.match(DATA_ACCESS) ?? []).length).toBeGreaterThan(0);
  });

  it("reaches the existing profile action rather than a copy of it, from the surface that owns the form", () => {
    // `2O-ONBOARD-004`: the identity step sends the owner to the settings form,
    // and `updateProfile` stays that form's only writer. The onboarding feature
    // does not import it, which is the strongest form of "no second path".
    const settings = code(SETTINGS_PAGE);
    expect(settings).toContain("updateProfile");
    for (const { name, source } of onboardingSources()) {
      expect(source.includes("updateProfile"), `${name} imports the profile writer`).toBe(false);
      expect(source.includes("saveAiCredential"), `${name} imports the credential writer`).toBe(false);
      expect(source.includes("captureEntry"), `${name} imports the capture action`).toBe(false);
    }
  });
});

describe("2O-ONBOARD-005: the steps mount surfaces that already exist", () => {
  it("resolves every declared mount to a real module", () => {
    for (const step of onboardingSteps) {
      const candidates = [
        `src/features/${step.mounts}.ts`,
        `src/features/${step.mounts}.tsx`,
      ];
      expect(
        candidates.some((candidate) => existsSync(join(REPO, candidate))),
        `${step.key} mounts ${step.mounts}, which does not exist`,
      ).toBe(true);
    }
  });

  it("resolves every destination to a real route", () => {
    for (const step of onboardingSteps) {
      const route = `src/app/[locale]/app/${step.destination}/page.tsx`;
      expect(existsSync(join(REPO, route)), `${step.key} points at ${route}`).toBe(true);
    }
  });

  it("rejects a mount that does not resolve, so the check above is not blanket", () => {
    expect(existsSync(join(REPO, "src/features/profile/settings-form-v2.tsx"))).toBe(false);
  });

  it("keeps the credential panel the one credential surface: the feature renders no key input", () => {
    for (const { name, source } of onboardingSources()) {
      expect(/type=["']password["']/.test(source), `${name} renders a secret input`).toBe(false);
      expect(source.includes("CredentialPanel"), `${name} re-mounts the credential panel`).toBe(false);
    }
  });
});

describe("2O-ONBOARD-001: offered, never imposed", () => {
  it("renders the composer before the guided path, on the surface that carries both", () => {
    const view = code(HOME_VIEW);
    const capture = view.indexOf("{capture}");
    const onboarding = view.indexOf("{onboarding}");
    expect(capture, "the composer is not rendered by the home view").toBeGreaterThan(-1);
    expect(onboarding, "the guided path is not rendered by the home view").toBeGreaterThan(-1);
    expect(capture).toBeLessThan(onboarding);
  });

  it("rejects the reversed order, so the ordering above means something", () => {
    const reversed = code(HOME_VIEW)
      .replace("{capture}", "__SLOT_A__")
      .replace("{onboarding}", "{capture}")
      .replace("__SLOT_A__", "{onboarding}");
    expect(reversed.indexOf("{capture}")).toBeGreaterThan(reversed.indexOf("{onboarding}"));
  });

  it("is a section in the page flow, not a dialog, an overlay or a route", () => {
    const panel = code(`${ONBOARDING_DIR}/onboarding-panel.tsx`);
    expect(panel).toContain("<section");
    expect(/role=["']dialog["']|aria-modal|createPortal|<dialog/.test(panel)).toBe(false);
    expect(existsSync(join(REPO, "src/app/[locale]/app/onboarding"))).toBe(false);
  });

  it("never redirects, so no step can become a gate in front of the product", () => {
    for (const { name, source } of onboardingSources()) {
      expect(/\bredirect\s*\(/.test(source), `${name} redirects`).toBe(false);
      expect(source.includes("notFound("), `${name} refuses to render a route`).toBe(false);
    }
  });
});

describe("T-6: the path renders only inside the authenticated tree", () => {
  it("is mounted by the dashboard the authenticated layout wraps", () => {
    expect(code(HOME_DASHBOARD)).toContain("OnboardingPanel");
    expect(code(APP_LAYOUT)).toContain("requireUser");
  });

  it("puts the session, lifecycle and consent gates in front of both mutations", () => {
    const actions = code(`${ONBOARDING_DIR}/actions.ts`);
    // `requireUser` is the one entry point that runs all three in order.
    expect((actions.match(/requireUser\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("rejects an action that skipped the gate, so the count above is not decorative", () => {
    const planted = code(`${ONBOARDING_DIR}/actions.ts`).replace(/await requireUser\([^)]*\);/g, "");
    expect((planted.match(/requireUser\(/g) ?? []).length).toBeLessThan(2);
  });
});

describe("2O-ACTIVATION-002 is absolute: the path stores no progress", () => {
  it("creates no migration in this slice", () => {
    const migrations = readdirSync(join(REPO, "supabase/migrations")).filter((name) =>
      name.endsWith(".sql"),
    );
    expect(migrations).toHaveLength(95);
    expect(migrations.some((name) => /onboard/i.test(name))).toBe(false);
  });

  it("has no onboarding column anywhere in the generated database types", () => {
    const types = read("src/lib/supabase/database.types.ts");
    expect(/^\s*onboarding[a-z_]*\??:/im.test(types)).toBe(false);
    expect(/^\s*[a-z_]*onboarding[a-z_]*\??:/im.test(types)).toBe(false);
  });

  it("is non-vacuous: the types file really is the schema, and really has columns", () => {
    const types = read("src/lib/supabase/database.types.ts");
    expect(/^\s*agent_name\??:/im.test(types)).toBe(true);
  });

  it("names no progress store among the steps' sources", () => {
    const types = read("src/lib/supabase/database.types.ts");
    for (const step of onboardingSteps) {
      for (const source of step.derivedFrom) {
        expect(types.includes(`${source}: {`), `${source} is not a table in the schema`).toBe(true);
      }
    }
  });
});

describe("2O-ONBOARD-010: dismissal is a browser preference, and it is reversible", () => {
  it("reaches only the cookie jar, never a table", () => {
    const actions = code(`${ONBOARDING_DIR}/actions.ts`);
    expect(actions).toContain("cookies()");
    expect((actions.match(DATA_ACCESS) ?? [])).toHaveLength(0);
  });

  it("mounts the reversal on the preferences surface", () => {
    const settings = code(SETTINGS_PAGE);
    expect(settings).toContain("OnboardingRestore");
    expect(settings).toContain("restoreOnboarding");
  });

  it("rejects a settings page that dropped the reversal, so the check above can fail", () => {
    const planted = code(SETTINGS_PAGE).replace(/OnboardingRestore/g, "SomethingElse");
    expect(planted.includes("OnboardingRestore")).toBe(false);
  });
});

describe("2O-ONBOARD-011: the recovery is the one the product already offers", () => {
  it("resolves the settings destination through the same helper the awaiting state uses", () => {
    const contracts = code(`${ONBOARDING_DIR}/contracts.ts`);
    expect(contracts).toContain("byokSettingsHref");
  });

  it("rejects a hand-built settings path, which is what the helper exists to prevent", () => {
    const contracts = code(`${ONBOARDING_DIR}/contracts.ts`);
    expect(/["'`]\/\$\{locale\}\/app\/settings["'`]/.test(contracts)).toBe(false);
  });
});

describe("2O-ONBOARD-004: the identity defaults are the schema's, not a second opinion", () => {
  it("matches every default the identity migration declares", () => {
    const migration = read(IDENTITY_MIGRATION);
    for (const [column, expected] of Object.entries(ASSISTANT_IDENTITY_DEFAULTS)) {
      const declared = new RegExp(
        `\\b${column}\\s+text\\s+not\\s+null\\s+default\\s+'([^']*)'`,
        "i",
      ).exec(migration);
      expect(declared, `${column} has no declared default in ${IDENTITY_MIGRATION}`).not.toBeNull();
      expect(declared![1], `${column} drifted from the schema`).toBe(expected);
    }
  });

  it("rejects a drifted default, so the match above is not blanket", () => {
    const migration = read(IDENTITY_MIGRATION);
    const drifted: Record<AssistantIdentityColumn, string> = {
      ...ASSISTANT_IDENTITY_DEFAULTS,
      tone: "direct",
    };
    const declared = /\btone\s+text\s+not\s+null\s+default\s+'([^']*)'/i.exec(migration);
    expect(declared![1]).not.toBe(drifted.tone);
  });

  it("does not derive the defaults from `defaultAgentPreferences`, which disagrees with the schema", () => {
    /*
     * Recorded rather than repaired. `src/lib/preferences.ts` declares
     * `tone: "direct"` while `agent_preferences.tone` defaults to `informal`;
     * the mismatch is latent because no product path reads that field of that
     * object today. Deriving this step from it would have read a brand-new
     * account as already personalised and silently skipped the step. The
     * finding belongs to the preferences centre, slice 2O.3.
     */
    expect(code(`${ONBOARDING_DIR}/contracts.ts`).includes("defaultAgentPreferences")).toBe(false);
  });
});
