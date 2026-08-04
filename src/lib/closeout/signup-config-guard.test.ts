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
 * ## Why this is table-aware, and what CI taught it
 *
 * The first cut asserted that *every* `enable_signup` in the file was false, on
 * the reading that a key by that name must be a signup switch wherever it
 * appears. CI disproved it: with `[auth.email].enable_signup = false` the local
 * stack refused sign-**in** with `email_provider_disabled` — "Email logins are
 * disabled". That key gates the email provider itself, not merely registration
 * through it.
 *
 * So the guard pins the **global** `[auth].enable_signup`, which is the control
 * that actually closes signup and closes it for every provider. This also
 * matches the hosted project's own readback: `external.email` true while
 * `disable_signup` is true. A guard that had kept insisting on the naive rule
 * would have been a guard demanding a broken product.
 */

const CONFIG = readFileSync(join(process.cwd(), "supabase/config.toml"), "utf8");

/**
 * Non-comment lines, tagged with the TOML table they sit in.
 *
 * Table awareness is the whole point — `[auth].enable_signup` and
 * `[auth.email].enable_signup` are different settings with the same name.
 */
const lines = (() => {
  const out: { table: string; text: string }[] = [];
  let table = "";
  for (const raw of CONFIG.split(/\r?\n/)) {
    const text = raw.trim();
    if (text.startsWith("#")) continue;
    const header = /^\[([^\]]+)\]$/.exec(text);
    if (header) {
      table = header[1];
      continue;
    }
    if (text !== "") out.push({ table, text });
  }
  return out;
})();

const setting = (table: string, key: string) =>
  lines.find((line) => line.table === table && new RegExp(`^${key}\\s*=`).test(line.text))?.text;

describe("config.toml cannot open public signup (SH-SIGNUP-003)", () => {
  it("closes signup globally, in the [auth] table", () => {
    // The one that matters. `DISABLE_SIGNUP` is global in GoTrue, so this shuts
    // registration for every provider regardless of which are enabled.
    expect(setting("auth", "enable_signup")).toMatch(/^enable_signup\s*=\s*false$/);
  });

  it("declares it rather than relying on the provider's default", () => {
    expect(setting("auth", "enable_signup")).toBeDefined();
  });

  it("keeps the email provider itself enabled", () => {
    // Not a relaxation: with this false the local stack refuses sign-IN. The
    // global gate above is what closes signup. This mirrors the hosted
    // readback, where external.email is true and disable_signup is true.
    expect(setting("auth.email", "enable_signup")).toMatch(/^enable_signup\s*=\s*true$/);
  });

  it("keeps anonymous sign-ins off", () => {
    // A second door into account creation, and one the application signup gate
    // would not see, because an anonymous sign-in is not a signup.
    expect(setting("auth", "enable_anonymous_sign_ins")).toMatch(/=\s*false$/);
  });

  it("keeps manual account linking off", () => {
    expect(setting("auth", "enable_manual_linking")).toMatch(/=\s*false$/);
  });

  it("explains why, so the next person does not helpfully flip it back", () => {
    expect(CONFIG).toContain("SH-SIGNUP-003");
    expect(CONFIG).toContain("config push");
    // The email-key finding is load-bearing prose: without it, the next reader
    // sees an inconsistency and "fixes" it back into a broken sign-in.
    expect(CONFIG).toContain("email_provider_disabled");
  });
});
