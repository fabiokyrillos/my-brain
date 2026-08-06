import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAPTCHA_TOKEN_FIELD,
  isCaptchaError,
  readCaptchaToken,
  TURNSTILE_SCRIPT_ORIGIN,
  turnstileSiteKey,
} from "./captcha";
import { authErrorMessage } from "./flow";
import { locales } from "@/lib/preferences";

/**
 * SH-CAPTCHA-003/004/005 and SH-SIGNUP-011/012 — what the application can claim
 * about CAPTCHA, and the boundaries it must not cross.
 *
 * The source-scanning assertions here are the same instrument
 * `direct-write-guard.test.ts` and `guards.test.ts` use: some properties are
 * about *where code is not*, and there is no runtime moment at which to observe
 * an absence.
 */

const REPO = process.cwd();
const read = (path: string) => readFileSync(join(REPO, path), "utf8");
const ACTIONS = read("src/features/auth/actions.ts");

describe("SH-CAPTCHA-003: the token is collected and forwarded", () => {
  it("reads a token from the field the widget writes", () => {
    expect(readCaptchaToken("0.abc-token")).toBe("0.abc-token");
    expect(CAPTCHA_TOKEN_FIELD).toBe("captchaToken");
  });

  it("turns an absent or empty token into undefined, not an empty string", () => {
    // The distinction is load-bearing: the Supabase client omits an undefined
    // option, but forwards "" as a PRESENT, INVALID token -- turning "the widget
    // did not run" into "the challenge failed", which are different facts with
    // different messages.
    expect(readCaptchaToken(null)).toBeUndefined();
    expect(readCaptchaToken("")).toBeUndefined();
    expect(readCaptchaToken("   ")).toBeUndefined();
  });

  it("refuses an unbounded field", () => {
    // A form field forwarded verbatim to a provider is a smuggling surface if
    // it has no ceiling. Real Turnstile tokens are ~2 KB.
    expect(readCaptchaToken("x".repeat(4096))).toBeUndefined();
    expect(readCaptchaToken("x".repeat(100))).toBe("x".repeat(100));
  });

  it("treats a missing site key as a configured state, not an error", () => {
    // Local dev and CI run without one on purpose (SH-CAPTCHA-005).
    expect(turnstileSiteKey({})).toBeNull();
    expect(turnstileSiteKey({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: "  " })).toBeNull();
    expect(turnstileSiteKey({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: "0x4AAA" })).toBe("0x4AAA");
  });

  it("recognises a CAPTCHA failure by code AND by message", () => {
    // Matching only the modern code would surface an older GoTrue's CAPTCHA
    // refusal as `invalid-credentials`, sending someone to reset a password
    // that was never wrong.
    expect(isCaptchaError({ code: "captcha_protection_failed" })).toBe(true);
    expect(isCaptchaError({ message: "captcha verification process failed" })).toBe(true);
    expect(isCaptchaError({ code: "invalid_credentials", message: "Invalid login" })).toBe(false);
  });

  it("forwards the token from every action that has a form carrying the widget", () => {
    for (const action of ["signIn", "signUp", "recoverPassword", "resendConfirmation"]) {
      const body = ACTIONS.slice(ACTIONS.indexOf(`export async function ${action}`));
      const scoped = body.slice(0, body.indexOf("\nexport async function", 1) + 1 || undefined);
      expect(scoped, `${action} must read the captcha token`).toContain("readCaptchaToken");
      expect(scoped, `${action} must forward it`).toContain("captchaToken");
    }
  });
});

/**
 * The requirement the four-surface list above could not express, and the defect
 * that proves why it needed to.
 *
 * Hosted GoTrue applies CAPTCHA enforcement to **password grants**, not to "the
 * login page". `requestAccountDeletion` performs one — it re-authenticates
 * before an irreversible deletion — and it forwarded no token, because it was
 * written before the control existed and the guard above only ever looked at
 * `features/auth/actions.ts`. From the day Turnstile was enabled that grant
 * answered `400 captcha_failed` for every caller, and account deletion became
 * impossible on the deployment while the surface blamed the user's password.
 *
 * So the property is restated as what it actually is: **every**
 * `signInWithPassword` in the product forwards a token. Stated over the whole
 * source tree, a sixth grant added tomorrow in a file nobody thought to list is
 * caught the day it lands rather than the day someone tries to use it.
 */
describe("every password grant in the product forwards a challenge token", () => {
  function sourceFiles(): string[] {
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
          found.push(path.slice(REPO.length + 1).replace(/\\/g, "/"));
        }
      }
    };
    walk(join(REPO, "src"));
    return found;
  }

  const callers = sourceFiles().filter((file) => read(file).includes("signInWithPassword("));

  it("finds the password grants, so this guard is not vacuously satisfied", () => {
    // Without this, a rename or a deletion would leave the cases below passing
    // over an empty list — a guard that measures nothing while looking green.
    expect(callers.sort()).toEqual([
      "src/features/account/actions.ts",
      "src/features/auth/actions.ts",
    ]);
  });

  it.each(["src/features/account/actions.ts", "src/features/auth/actions.ts"])(
    "%s reads a token and hands it to the grant",
    (file) => {
      const source = read(file);
      expect(source, `${file} must read the token`).toContain("readCaptchaToken");
      // The supported contract: `options.captchaToken` on the grant itself.
      // Reading a token and then forgetting to pass it is a real failure mode,
      // so the assertion is on the forward, not on the read.
      expect(source, `${file} must forward it in options`).toMatch(/options:\s*\{[^}]*captchaToken/);
    },
  );

  it("distinguishes a failed challenge from a wrong password wherever it re-authenticates", () => {
    // Conflating them is what made the deployed defect read as a credential
    // problem: the surface said the password was wrong to people who had typed
    // the right one, sending them to reset something that was never broken.
    for (const file of callers) {
      expect(read(file), `${file} must use isCaptchaError`).toContain("isCaptchaError");
    }
  });

  it("renders the widget on the account-deletion page, on the server", () => {
    // The half no component test can cover: `DeletionSurface` is a client
    // component and takes the widget as a node, so the *page* is what decides
    // whether a challenge exists at all. Rendering it there is also what keeps
    // the site key resolvable — inside a client bundle
    // `turnstileSiteKey(process.env)` reads through a parameter Next cannot
    // inline, and the widget would silently render nothing.
    const page = read("src/app/[locale]/account/delete/page.tsx");
    expect(page, "the deletion page must render the shared widget").toContain("TurnstileWidget");
    expect(page, "and hand it to the surface").toMatch(/captcha=\{<TurnstileWidget/);
    // The *import* is what would pull it into the client bundle — the prose in
    // that file names the component deliberately, to explain why it is absent.
    expect(
      read("src/features/account/deletion-surface.tsx"),
      "the client surface must not import the widget itself",
    ).not.toMatch(/^import .*from "@\/features\/auth\/turnstile"/m);
  });

  it("verifies no token itself, anywhere in the product", () => {
    // Verification needs the Turnstile secret, which lives only in hosted
    // GoTrue. A product that verified a token would need one in its runtime,
    // and a runtime that holds one can leak one.
    for (const file of sourceFiles()) {
      expect(read(file), `${file} must not verify a token itself`).not.toMatch(/siteverify/i);
    }
  });
});

describe("SH-CAPTCHA-004: the widget's origin is the only new external one, and it is not in the product", () => {
  it("appears in the widget module and nowhere else in src", () => {
    // A scan rather than a claim: the requirement is about where this origin is
    // NOT, and an authenticated product route that quietly loaded a third-party
    // script would satisfy no test that only looked at the auth pages.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(entry.name)) {
          const relative = path.slice(REPO.length + 1).replace(/\\/g, "/");
          if (read(relative).includes("challenges.cloudflare.com")) offenders.push(relative);
        }
      }
    };
    walk(join(REPO, "src"));

    expect(offenders.sort()).toEqual([
      "src/features/auth/captcha.test.ts",
      "src/features/auth/captcha.ts",
    ]);
  });

  it("is https and is Cloudflare's", () => {
    expect(TURNSTILE_SCRIPT_ORIGIN).toBe("https://challenges.cloudflare.com");
  });

  it("holds no secret key anywhere in the repository's source", () => {
    // The secret is a hosted GoTrue setting. There is no code here that reads
    // one, which is why none can reach a bundle -- asserted, not assumed.
    const body = read("src/features/auth/captcha.ts") + read("src/features/auth/turnstile.tsx");
    expect(body).not.toMatch(/TURNSTILE_SECRET|CAPTCHA_SECRET|secret_?key/i);
  });
});

describe("SH-COPY-004: four refusals stay four facts", () => {
  const codes = [
    "throttled",
    "auth-unavailable",
    "captcha-failed",
    "invalid-credentials",
    "auth-misconfigured",
  ] as const;

  it("every code has distinct, non-empty copy in every locale", () => {
    for (const locale of locales) {
      const messages = codes.map((code) => authErrorMessage(code, locale));
      for (const message of messages) expect(message.trim()).not.toBe("");
      expect(new Set(messages).size).toBe(codes.length);
    }
  });

  it("the throttled refusal never names the account", () => {
    // SH-SIGNUP-011: if the refusal for an address that exists read differently
    // from one that does not, the refusal itself would answer the question the
    // uniform copy exists to refuse.
    for (const locale of locales) {
      const message = authErrorMessage("throttled", locale);
      expect(message).not.toMatch(/conta|account|e-mail|email/i);
    }
  });

  it("no refusal leaks an internal name to the reader", () => {
    for (const locale of locales) {
      for (const code of codes) {
        expect(authErrorMessage(code, locale)).not.toMatch(/[A-Z_]{6,}/);
      }
    }
  });
});

describe("SH-THROTTLE-003: admission happens before the provider, in every action", () => {
  const providerCalls: Record<string, string> = {
    signIn: "signInWithPassword",
    signUp: "auth.signUp",
    recoverPassword: "resetPasswordForEmail",
    resendConfirmation: "auth.resend",
  };

  for (const [action, providerCall] of Object.entries(providerCalls)) {
    it(`${action} claims a slot before calling ${providerCall}`, () => {
      const start = ACTIONS.indexOf(`export async function ${action}`);
      expect(start, `${action} must exist`).toBeGreaterThan(-1);
      const next = ACTIONS.indexOf("\nexport async function", start + 1);
      const body = ACTIONS.slice(start, next === -1 ? undefined : next);

      const admit = body.indexOf("admitAuthEvent");
      const provider = body.indexOf(providerCall);
      expect(admit, `${action} must consult the throttle`).toBeGreaterThan(-1);
      expect(provider, `${action} must call the provider`).toBeGreaterThan(-1);
      // The ordering IS the requirement: ours is the refusal with uniform copy,
      // and the provider's differs between an address that exists and one that
      // does not.
      expect(admit).toBeLessThan(provider);
    });
  }

  it("the signup gate still refuses before the throttle is consulted", () => {
    // Spending a real slot on a request that was never going to reach a
    // provider would turn a closed door into a way to exhaust an allowance.
    const start = ACTIONS.indexOf("export async function signUp");
    const body = ACTIONS.slice(start, ACTIONS.indexOf("\nexport async function", start + 1));
    expect(body.indexOf("isSignupOpenIn")).toBeLessThan(body.indexOf("admitAuthEvent"));
  });

  it("every claimed slot is finalized on both the success and the failure path", () => {
    for (const action of Object.keys(providerCalls)) {
      const start = ACTIONS.indexOf(`export async function ${action}`);
      const next = ACTIONS.indexOf("\nexport async function", start + 1);
      const body = ACTIONS.slice(start, next === -1 ? undefined : next);
      // Two at minimum: one inside the error branch, one after it. A reservation
      // nobody finalizes stays `unknown` and still counts, so a missing finalize
      // silently tightens the ceiling.
      const finalizes = body.match(/finalizeAuthEvent/g) ?? [];
      expect(finalizes.length, `${action} must finalize on both paths`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("SH-SIGNUP-012: session fixation and the recovery session", () => {
  it("the password update forces a sign-out afterwards", () => {
    // The recovery link mints a real session. Leaving it live after the password
    // changes means a stolen link keeps working past the reset it triggered.
    const start = ACTIONS.indexOf("export async function updatePassword");
    const body = ACTIONS.slice(start);
    expect(body.indexOf("updateUser")).toBeLessThan(body.indexOf("signOut"));
    expect(body).toContain("signOut");
  });

  it("the update refuses unless the provider confirms a user", () => {
    // getUser() re-validates against the provider; reading the cookie would
    // trust a token this process never verified.
    const start = ACTIONS.indexOf("export async function updatePassword");
    const body = ACTIONS.slice(start);
    expect(body.indexOf("getUser")).toBeLessThan(body.indexOf("updateUser"));
    expect(body).toContain("callback-failed");
  });

  it("no action reuses an identifier supplied by the caller as a session key", () => {
    // Fixation is the caller choosing the session identifier. Nothing here may
    // read one from the form and hand it to the provider.
    expect(ACTIONS).not.toMatch(/setSession\(|refresh_token:\s*formData|access_token:\s*formData/);
  });
});
