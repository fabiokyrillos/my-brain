import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SH-SIGNUP-003 — `supabase config push` must not be able to open public signup.
 *
 * ## The footgun this closes
 *
 * `supabase/config.toml` is pushed **wholesale** to the linked project by
 * `supabase config push`. The CLI template ships `enable_signup = true`, and
 * this repository carried that default. So one routine command — run to change
 * a rate limit, a redirect, anything — would have opened public signup on the
 * hosted project as a silent side effect.
 *
 * Opening signup is a post-initiative owner decision gated on one green
 * fail-closed rollout run (SH-ROLLOUT-005). A decision with that much weight
 * must not be reachable as a side effect of unrelated config work, and "we will
 * remember not to push" is not a control.
 *
 * The assertion is over the raw file rather than a parsed TOML value on
 * purpose: it must hold no matter which table a future edit puts the key in.
 */

const CONFIG = readFileSync(join(process.cwd(), "supabase/config.toml"), "utf8");

/** Non-comment lines only — the prose above these keys explains them. */
const settings = CONFIG.split(/\r?\n/).filter((line) => !line.trim().startsWith("#"));

describe("config.toml cannot open public signup (SH-SIGNUP-003)", () => {
  it("declares enable_signup, so the key is present to be false rather than absent", () => {
    // An absent key would inherit the provider's own default, which is the
    // thing this guard exists to stop relying on.
    const declarations = settings.filter((line) => /^\s*enable_signup\s*=/.test(line));
    expect(declarations.length).toBeGreaterThanOrEqual(2);
  });

  it("sets every enable_signup to false", () => {
    for (const line of settings) {
      if (/^\s*enable_signup\s*=/.test(line)) {
        expect(line, `signup must stay closed: ${line.trim()}`).toMatch(/=\s*false\s*$/);
      }
    }
  });

  it("never sets enable_signup = true anywhere, in any table", () => {
    expect(settings.join("\n")).not.toMatch(/enable_signup\s*=\s*true/);
  });

  it("keeps anonymous sign-ins off", () => {
    // A second door into account creation, and one the signup gate would not
    // see because it is not a signup.
    for (const line of settings) {
      if (/^\s*enable_anonymous_sign_ins\s*=/.test(line)) {
        expect(line).toMatch(/=\s*false\s*$/);
      }
    }
  });

  it("keeps manual account linking off", () => {
    for (const line of settings) {
      if (/^\s*enable_manual_linking\s*=/.test(line)) {
        expect(line).toMatch(/=\s*false\s*$/);
      }
    }
  });

  it("explains why, so the next person does not helpfully flip it back", () => {
    expect(CONFIG).toContain("SH-SIGNUP-003");
    expect(CONFIG).toContain("config push");
  });
});
