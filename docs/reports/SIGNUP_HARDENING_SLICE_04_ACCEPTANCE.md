# Signup Hardening — SH.4 acceptance record

Slice: **SH.4 — Terms, Privacy, and versioned consent.** Branch
`codex/sh-slice-4`, from `main` at `3a0f4f7` (the SH.3 merge). **Migrations: 1**
— `202608040074` — exactly the plan §1 allocation; head `202608040073` →
`202608040074`, with `AUTHORIZED_MIGRATION_HEAD` moved in the same change. Five
of the initiative's eight migrations are now spent.

## 1. What exists now that did not

- **`public.policy_acceptances`** — who accepted which document at which
  version, on which surface. Forced RLS with **exactly two policies**, `select`
  own and `insert` own: there is no `UPDATE` policy and no `DELETE` policy at
  all, so the append-only posture is the *absence* of a policy rather than a
  revoke somebody could undo, and a catalog postcondition asserts that.
- **The version, stated in SQL as well as in TypeScript** (ADR-079). This is the
  slice's central decision and the reason it is not obvious:
  `SH-LEGAL-005` requires `authenticated` to hold a direct INSERT, so PostgREST
  is a real door. A client able to insert `version = '9999-12-31'` would
  **pre-accept every future policy it has never been shown**, after which no
  bump would ever re-interpose it — and no Server Action validation closes that,
  because the Server Action is not the only door. So
  `private.current_policy_version` holds the literals, a `BEFORE INSERT` trigger
  refuses anything else, and `version-parity.test.ts` pins the SQL and
  TypeScript literal sets to each other in **both directions**.
- **`record_policy_acceptance(document, surface)` takes no version parameter.**
  A caller that cannot name a version cannot name a wrong one, so the entire
  class of forged- and stale-version bugs is absent from the app boundary rather
  than defended against there. Idempotent: a retry, a double submit or a second
  tab records the same fact once.
- **The two drafts, both locales**, written from repository truth: OpenAI as the
  external processor, the signed URL handed to it, the key decrypted server-side
  per call and never returned, asynchronous processing, the user's own provider
  charges, cost figures as estimates from a price snapshot, what deletion removes
  and what the deletion log keeps, suspension's effect, and the v1 no-scanner
  posture. Both carry the professional-review banner (SH-LEGAL-013).
- **The retention section is generated, not retyped.** `retention.ts` is the
  schedule as data; the policy renders one line per class from it. A policy and
  a schedule written twice drift, and the failure mode is the worst kind — a
  document telling somebody their data is deleted while nothing deletes it.
- **The honesty flag, which is the answer to T-31.** Approving a retention
  schedule is not sweeping anything: the purges are SH.6's, and today only
  BYOK's `credential_validation_attempts` prune actually runs. So each class
  carries `sweepActive`, the document renders a plain warning while any window
  is unenforced, and a test asserts the warning is present **exactly while** one
  is. SH.6 flips the flags and the paragraph disappears by construction rather
  than by somebody remembering to delete it.
- **Public legal routes** at `/[locale]/legal/{terms,privacy}` — outside `app/`
  and outside `auth/`, so the proxy neither requires a session nor redirects an
  authenticated visitor away. A policy nobody can read before signing up is not
  a policy anybody agreed to.
- **The signup consent control** — unchecked by default, and enforced in the
  **schema**: an unticked checkbox submits nothing, so `z.literal("on")` on a
  required field means "the box was ticked", and deleting the input in the
  browser fails the server-side parse with its own error code, told apart from a
  malformed field.
- **One interposition covering both cases.** A brand-new account and an account
  facing a bumped version are the same case — "no acceptance row for the current
  version of document X" — answered by the same redirect from `requireUser`.
  There is no first-session flag to get out of step with a version-bump flag.
  The gate reads the table, never a cookie (SH-LEGAL-011), and fails closed.
- **A real decline path** (SH-LEGAL-010): sign-out and the deletion surface, on
  the same screen as the accept button, in plain words.
- **The deletion surface itself** — see §3.1; SH.2 shipped its action with no UI
  consumer, and SH-LEGAL-010's decline path needs somewhere to point.

## 2. Evidence

- **pgTAP, 21 assertions** (`signup_hardening_policy_acceptances.sql`), with §3
  executing the attack the slice exists for **as the authenticated user through
  the grant SH-LEGAL-005 leaves open**: a future version refused, a superseded
  version refused, an invented document refused — and, non-vacuously, the same
  door used correctly accepted, so the three refusals cannot be passing for a
  table nobody can write to. Plus own-row-only enforcement with a bystander to
  fail on, `UPDATE` and `DELETE` refused, `anon` holding nothing, the RPC's own
  boundary, and the cascade taking acceptances with the account.
  The suite reads the current version through a `pg_temp` DEFINER wrapper rather
  than a literal, because `private.current_policy_version` is executable by no
  role and a hard-coded date would silently rot at the next bump.
- **Unit, 79 cases** across five files: the version parity in both directions;
  the deletion-retention parity against `account_deletion_log`'s **actual column
  list** in both directions, with a guard that the column regex still matches
  something (without it, both directions would pass against an empty set the day
  the table's formatting changes); the retention schedule against the plan's §7
  table; the document content pins as *claims* rather than wording; the
  placeholders present and visibly unfilled; the gate's seven cases including
  both the stale and the future version and the fail-closed read; and the signup
  consent refusal, including a forged `"true"`/`"1"` value.
- **e2e, credential-free** (`foundation.spec.ts`): all four legal routes public,
  one `h1` each, the review banner visible, both locales; and the consent control
  present, unchecked, required, with both document links.
- **The cascade drill gained its arm.** `policy_acceptances` is a new user-owned
  table, so SH.0's drill would have failed by name — which is the designed
  behaviour (T-32) and this slice's job to answer. Its populator reads the
  current version through the same function rather than hard-coding it.

## 3. Adversarial review — findings fixed or recorded

1. **FIXED, and it was a broken requirement rather than a broken line.**
   SH-LEGAL-010 requires the decline path to offer "sign-out and the deletion
   surface". There **was no deletion surface**: SH.2 built, tested and merged
   `requestAccountDeletion` with no UI consumer at all — its own acceptance
   record says so — so the decline path would have pointed at a route that does
   not exist. The surface is built here (`/[locale]/account/delete`) over an
   action that is already merged and already unit-tested: no new server logic, no
   migration. SH.2's consumer-less contract gains its consumer, which is the
   thing `CLAUDE.md` warns to check for rather than assume.
2. **FIXED, found while building sibling surfaces.** SH.1's account-state
   surface renders `<main className="auth-page">`, and `auth-page` **exists in
   no stylesheet** — the card rendered without the centred full-height stage.
   Corrected to `auth-stage`, the class the auth layout actually uses.
3. **FIXED, caught by static review before CI.** The pgTAP suite originally
   called `private.current_policy_version` from inside its `authenticated`
   sections. That function is executable by no role — correctly — so every one
   of those assertions would have failed on a permission error that looked like
   a logic failure. A `pg_temp` DEFINER wrapper reads it instead, without
   weakening the production grant.
4. **FIXED, caught by static review.** The "invented document" assertion expected
   `23514` (the CHECK). PostgreSQL runs `BEFORE` row triggers **ahead of**
   constraint checks, so the trigger names it first with `22023`. The expectation
   was wrong about the engine, not about the behaviour.
5. **FIXED, four guards written earlier caught this slice's new table.**
   `require-user.test.ts`'s double threw on the second table the gate now reads;
   `phase-2f-cleanup.test.ts` demanded `policy_acceptances` be classified as
   scanned or excused rather than silently absent; `egc-invariants` demanded the
   head pin move; `phase-2f-documentation` demanded `SECURITY.md` name the new
   parity. All four are the guards working, and all four are recorded rather than
   quietly satisfied.
6. **RECORDED — the `signup` acceptance surface is declared and unwritten.** The
   closed set has `('signup', 'interposition')` because the PRD declares both,
   but SH-LEGAL-008 requires rows to be written at the **first authenticated
   session** rather than trusted from the pre-session form — so every row today
   carries `interposition`, and the signup checkbox is a gate rather than a
   record. Kept because a closed set that has to grow later is worse than one
   that starts complete, and named here so a reader does not spend time looking
   for the writer.
7. **RECORDED — a version bump is a migration.** ADR-079's consequence, stated
   in the migration, the constant file and the ADR rather than discovered by
   whoever first tries to bump one. It is the right weight for a change that
   re-interposes consent for every account.
8. **RECORDED — the legal facts are owner gates, not blockers.** The operator
   entity, the contact address, the governing law and the forum render as
   **visibly unfilled markers** carrying their own names, and a test asserts each
   appears in the documents and none has been quietly filled with prose. Writing
   a plausible value would have been worse than the gap, because a plausible
   value reads as settled and nobody goes looking for it again.
9. **RECORDED, deployment ordering, fourth slice running:** `202608040074` must
   reach the hosted project before this slice's app code runs against it. The
   failure mode here is the most severe of the four so far — the consent gate
   fails closed, so without the table **every account is interposed and cannot
   reach the product**. Stated rather than discovered.

## 4. CI evidence

- Local gates: lint **0**, typecheck **0**, production build green (the four
  legal pages prerender as static HTML). Full vitest: the three known local-only
  failures unchanged from `main` — two `sql-reachability` assertions and the two
  `.mjs`-importing closeout suites' rolldown parse failure, all green in CI.
- PR-head and exact merge-SHA CI runs: recorded at the PR boundary.

## 5. What SH.4 does not claim

- **No professional legal review.** Both drafts say so in their own text, and
  removing that banner is a named owner action in the rollout gate.
- **No owner values.** The four placeholders are unfilled by design.
- **No deployed execution.** No migration in this initiative has reached the
  hosted project; every claim above is repository-and-CI evidence.
- **The authenticated journeys are not run.** The interposition, the version
  bump and the decline path are unit-proven server-side; their rendered
  end-to-end behaviour on a real account needs SH-GD.3, like every other
  authenticated journey in this initiative.
