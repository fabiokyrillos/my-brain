/**
 * The environment and secret contract — `2H-DEPLOY-002`.
 *
 * ## Why this is a module and not a paragraph in the runbook
 *
 * A runbook listing "these must be set, and these must never be public" is a
 * claim nothing checks. The failure it is meant to prevent — a service-role key
 * or the BYOK master key reaching the browser bundle through a `NEXT_PUBLIC_*`
 * name — is a one-character mistake with no error message: Next.js inlines any
 * `NEXT_PUBLIC_*` variable at build time and the build stays green.
 *
 * So the contract is data, and `env-contract.test.ts` checks it against the
 * repository in **both directions**:
 *
 *   1. every variable declared here that is not `public` must never appear
 *      anywhere in the repository with a `NEXT_PUBLIC_` prefix;
 *   2. every `NEXT_PUBLIC_*` name the code actually reads must be declared
 *      here as `public`;
 *   3. every `Deno.env.get(...)` in a **deployed** Edge Function entrypoint
 *      must be declared here with an Edge class;
 *   4. every variable `.env.example` names must be declared here, and every
 *      variable declared here as a local-development concern must appear in
 *      `.env.example` — so a new required variable cannot ship without the
 *      file a new contributor copies.
 *
 * ## The classes, and what "surface" means
 *
 * Each variable is placed on exactly one surface. A variable that is genuinely
 * needed in two places (`SUPABASE_SERVICE_ROLE_KEY` is the obvious one) is
 * still one declaration with several consumers, because the question the
 * contract answers is "where may this value legally exist?" and the answer must
 * be single-valued.
 *
 * ## BYOK's constraints are inherited verbatim
 *
 * `BYOK_MASTER_KEY` and the two peppers are not merely server-only. The
 * ciphertext they protect is per-user OpenAI credentials, a rotation is a
 * documented operator procedure (`npm run byok:rotate-master-key`), and a
 * runtime mismatch between the value the application holds and the value the
 * envelopes were sealed with is a silent product outage — which is why
 * `npm run byok:verify-runtime` exists and why the runbook orders it before
 * anything else. Nothing here relaxes that; this module records it so a deploy
 * step cannot forget it.
 */

/** Where a value may legally exist. */
export type EnvSurface =
  /** Inlined into the browser bundle at build time. Never a secret. */
  | "public"
  /** The Next.js server runtime only (Server Actions, route handlers). */
  | "server"
  /** A secret set on a deployed Supabase Edge Function. */
  | "edge-secret"
  /** Non-secret configuration read by an Edge Function. */
  | "edge-config"
  /** An operator workstation or CI only. Never present in a deployed runtime. */
  | "operator"
  /** Held by the hosted provider's own configuration, not by our runtimes. */
  | "hosted-provider";

export type EnvVariable = {
  readonly name: string;
  readonly surface: EnvSurface;
  /** True when a deploy that omits it is broken rather than degraded. */
  readonly required: boolean;
  /**
   * True when the value itself is a credential.
   *
   * Distinct from the surface, and the distinction is load-bearing.
   * `SUPABASE_URL` is not `public`, yet `NEXT_PUBLIC_SUPABASE_URL` is a
   * legitimate, separately declared twin — the same project URL under the name
   * the browser build needs. `SUPABASE_SERVICE_ROLE_KEY` has no such twin and
   * never may, declared or otherwise. A rule written only on `surface` cannot
   * tell those two apart, and would either allow the second or forbid the
   * first.
   */
  readonly secret: boolean;
  /** Which runtimes read it, named so the runbook can be checked against it. */
  readonly consumers: readonly string[];
  readonly note: string;
};

/**
 * True when a name on this surface must never carry a `NEXT_PUBLIC_` prefix
 * unless that prefixed name is itself declared `public` and therefore reviewed.
 *
 * Everything except `public`. `edge-config` and `hosted-provider` are not
 * secrets, but a non-public value that quietly gained a public name would still
 * be a contract violation — the prefix is a statement about the browser bundle,
 * not about sensitivity.
 */
export function mustNeverBePublic(variable: EnvVariable): boolean {
  return variable.surface !== "public";
}

/**
 * True when no `NEXT_PUBLIC_` twin may exist for this variable **at all**.
 *
 * Not even a declared one. This is the check that stops the failure with no
 * error message: a credential renamed into the browser bundle at build time.
 */
export function forbidsPublicTwin(variable: EnvVariable): boolean {
  return variable.secret;
}

export const ENV_CONTRACT: readonly EnvVariable[] = [
  // ---------------------------------------------------------------- public
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    surface: "public",
    required: true,
    secret: false,
    consumers: ["application (browser + server)"],
    note: "The project URL. Public by construction — every client request carries it.",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    surface: "public",
    required: true,
    secret: false,
    consumers: ["application (browser + server)"],
    note:
      "The anon/publishable key. Public by design: it grants nothing on its own because RLS is the trust boundary. " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY is accepted as the legacy name; one of the two must be present (src/lib/env.ts).",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    surface: "public",
    required: false,
    secret: false,
    consumers: ["application (browser + server)"],
    note: "Legacy alias for the publishable key. Either name satisfies the schema; neither is a secret.",
  },
  {
    name: "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
    surface: "public",
    required: true,
    secret: false,
    consumers: ["application (browser)"],
    note:
      "The Turnstile SITE key, which is meant to be in the page. Its SECRET counterpart is not an application " +
      "variable at all — it lives in hosted Auth (see TURNSTILE_SECRET_KEY below). Absence disables the widget, " +
      "which SH.5 proved is a fail-closed path rather than an open one.",
  },

  // ---------------------------------------------------------------- server
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    surface: "server",
    required: true,
    secret: true,
    consumers: ["application (server)", "process-jobs", "delete-account", "operator scripts"],
    note:
      "Bypasses RLS entirely. NEVER NEXT_PUBLIC. Present on the server runtime, on both Edge Functions " +
      "(where the platform injects it) and on operator workstations; never in a browser bundle.",
  },
  // A PROJECT-WIDE PROVIDER KEY IS DELIBERATELY ABSENT, AND ITS NAME CANNOT BE
  // WRITTEN HERE.
  //
  // BYOK removed the last Node read (BYOK.3), the last Deno read (BYOK.4) and
  // the deployed Edge Function secret at the cutover. Every AI call resolves the
  // acting user's own stored credential, and a call site that forgot one fails
  // at `tsc` rather than falling back. `src/lib/byok/project-key-guard.test.ts`
  // fails the build if the name reappears in `src`, `supabase/functions`,
  // `scripts`, `e2e` or `.github` outside its two-file allowlist — this module
  // included, which is why the absence is recorded as prose rather than as a
  // declaration with `required: false`.
  //
  // The reason the guard is that strict is worth repeating: the failure mode was
  // never somebody deciding to add a fallback. It was somebody needing a key at
  // 3am, finding the name in a contract, and wiring it into "one path that just
  // needs to work". There is no name here to find.
  {
    name: "OPENAI_EXTRACTION_MODEL",
    surface: "server",
    required: false,
    secret: false,
    consumers: ["application (server)"],
    note: "Model routing override. Not a secret, but not public either — it is a server-side routing decision.",
  },
  {
    name: "OPENAI_EMBEDDING_MODEL",
    surface: "server",
    required: false,
    secret: false,
    consumers: ["application (server)"],
    note: "Model routing override.",
  },
  {
    name: "OPENAI_FILE_MODEL",
    surface: "server",
    required: false,
    secret: false,
    consumers: ["application (server)", "process-jobs"],
    note: "Model routing override, read by the worker too.",
  },
  {
    name: "BYOK_MASTER_KEY",
    surface: "server",
    required: true,
    secret: true,
    consumers: ["application (server)", "process-jobs", "delete-account"],
    note:
      "Seals every per-user credential envelope. A mismatch between this value and the one the envelopes were " +
      "sealed with is a SILENT outage: decryption fails per user, not at boot. Run `npm run byok:verify-runtime` " +
      "BEFORE any deploy that touches it, and never rotate it without `npm run byok:rotate-master-key`.",
  },
  {
    name: "BYOK_MASTER_KEY_VERSION",
    surface: "server",
    required: true,
    secret: false,
    consumers: ["application (server)", "process-jobs", "delete-account"],
    note: "Which master key sealed a given envelope. Rotation reads it; a wrong value selects the wrong key.",
  },
  {
    name: "BYOK_PREVIOUS_MASTER_KEY",
    surface: "server",
    required: false,
    secret: true,
    consumers: ["application (server)", "process-jobs", "delete-account"],
    note: "Present only during a rotation window, so envelopes sealed with the old key still open.",
  },
  {
    name: "BYOK_PREVIOUS_MASTER_KEY_EXPIRES_AT",
    surface: "server",
    required: false,
    secret: false,
    consumers: ["application (server)"],
    note: "Bounds the rotation window. Past it, the previous key stops being accepted.",
  },
  {
    name: "BYOK_FINGERPRINT_PEPPER",
    surface: "server",
    required: true,
    secret: true,
    consumers: ["application (server)", "process-jobs", "delete-account"],
    note: "Peppers credential fingerprints. Changing it orphans every stored fingerprint.",
  },
  {
    name: "BYOK_RATE_LIMIT_PEPPER",
    surface: "server",
    required: true,
    secret: true,
    consumers: ["application (server)"],
    note: "Peppers the validation-attempt identifiers. Changing it resets those counters.",
  },
  {
    name: "BYOK_VALIDATION_OPENAI_API_KEY",
    surface: "operator",
    required: false,
    secret: true,
    consumers: ["remote BYOK validation smoke"],
    note:
      "A real provider key used only by the manual live-validation smoke. Not provisioned today, which is why " +
      "Phase 2G's two BYOK partials remain partial.",
  },
  {
    name: "SIGNUP_ENABLED",
    surface: "server",
    required: false,
    secret: false,
    consumers: ["application (server)"],
    note:
      "The application-layer half of the closed-signup posture. Absent or not 'true' means CLOSED — the gate " +
      "fails closed. Hosted Auth's disable_signup is the other half, and both must agree.",
  },
  {
    name: "APP_ORIGIN",
    surface: "server",
    required: true,
    secret: false,
    consumers: ["application (server)"],
    note:
      "The absolute origin auth emails point at. Required in production precisely so a redirect never derives " +
      "from a request-supplied host. Must be https except for localhost.",
  },

  // ----------------------------------------------------------- edge runtime
  {
    name: "SUPABASE_URL",
    surface: "edge-config",
    required: true,
    secret: false,
    consumers: ["process-jobs", "delete-account", "heartbeat (undeployed)"],
    note: "Injected by the platform into every Edge Function. The same value as the public URL, under the Edge name.",
  },
  {
    name: "WORKER_DISPATCH_SECRET",
    surface: "edge-secret",
    required: true,
    secret: true,
    consumers: ["process-jobs", "application (server, to nudge the worker)"],
    note:
      "Authenticates the application's nudge to the drain. Absent, the unattended pg_cron/pg_net tick is the " +
      "only path and capture latency degrades silently — so its absence is a finding, not a warning.",
  },
  {
    name: "HEARTBEAT_SECRET",
    surface: "edge-secret",
    required: false,
    secret: true,
    consumers: ["heartbeat (undeployed by design)"],
    note:
      "SH-EXPOSURE-005: the heartbeat HTTP wrapper is deliberately NOT deployed, because pg_cron calls " +
      "run_all_heartbeats() inside the database and the wrapper was an internet-reachable service-role endpoint " +
      "with no caller. The variable stays declared so its absence stays a decision.",
  },
  {
    name: "DELETION_REAP_SECRET",
    surface: "edge-secret",
    required: false,
    secret: true,
    consumers: ["delete-account (reap mode)"],
    note:
      "Authenticates the deletion reaper's re-invocation. NOT SET TODAY: the reaper is unarmed, 0/2 Vault " +
      "secrets, no cron job. Arming it is an owner action and is not authorized by this phase.",
  },

  // -------------------------------------------------------------- operator
  {
    name: "SUPABASE_ACCESS_TOKEN",
    surface: "operator",
    required: false,
    secret: true,
    consumers: ["operator scripts", "supabase CLI"],
    note:
      "A personal Management API token. Operator workstation only — it can read and write project configuration, " +
      "so it must never reach a deployed runtime of any kind.",
  },
  {
    name: "FUNNEL_OWNER_EMAIL",
    surface: "operator",
    required: false,
    secret: false,
    consumers: ["online e2e journeys"],
    note: "Credentials for the authenticated online journeys. Manual runs only; never part of CI.",
  },
  {
    name: "FUNNEL_OWNER_PASSWORD",
    surface: "operator",
    required: false,
    secret: true,
    consumers: ["online e2e journeys"],
    note: "See FUNNEL_OWNER_EMAIL. Hosted CAPTCHA blocks password sign-in, so the journeys use an email OTP link.",
  },
  {
    name: "PROBE_ORIGIN",
    surface: "operator",
    required: false,
    secret: false,
    consumers: ["hosted probes"],
    note: "Which deployed origin a hosted probe targets. Absence means the probe refuses rather than guesses.",
  },

  // ------------------------------------------------------- hosted provider
  {
    name: "TURNSTILE_SECRET_KEY",
    surface: "hosted-provider",
    required: true,
    secret: true,
    consumers: ["hosted Auth (GoTrue)"],
    note:
      "NOT an application variable. It is set in hosted Auth's CAPTCHA configuration and verified there. " +
      "It appears in this contract so that a future attempt to read it from the application is visibly wrong, " +
      "and because a deploy checklist that omitted it would leave CAPTCHA enforcement unverified.",
  },
];

/** The Edge Function entrypoints this contract's rule 3 checks. */
export const DEPLOYED_EDGE_FUNCTIONS = Object.freeze(["process-jobs", "delete-account"]);

/** Lookup by name, so callers never re-scan the array by hand. */
export function envVariable(name: string): EnvVariable | undefined {
  return ENV_CONTRACT.find((variable) => variable.name === name);
}
