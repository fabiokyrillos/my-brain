# Autonomous loop — durable handoff

**Purpose.** This file is the loop's continuity artifact. It records exactly where the
authorized roadmap stands so a fresh context can resume without re-deriving anything.
**Update it at every merge boundary.**

Last updated: **2026-08-02**, at **BYOK's close**. **§16 supersedes §15, which supersedes
§14, which supersedes §13**, and §16 is the only section a resuming context needs to act
on first.
§13 and §14 are retained as the record of the first two stops; every owner action either
listed has since been performed.

**BYOK is DEPLOYED, WORKING, and NOT CLOSED, and it must not be recorded as closed.**
Five migrations applied (parity `202608010069`), `process-jobs` deployed 16/16
byte-identical, the three BYOK secrets in the Edge Function store, `OPENAI_API_KEY` gone
from it.

**The owner cutover failed once and now SUCCEEDS.** The first attempt left the Next.js
runtime and the deployed worker holding *different* `BYOK_MASTER_KEY` values, so the
owner's credential opened nowhere. The architecture handled that perfectly — failed
closed, no project-key fallback, no retry storm, no leak — which is why it remains the
strongest evidence in the initiative. The owner then synchronized the three values and
re-entered the credential through Settings, and it is verified: parity is `IN PARITY`,
the credential opens under both runtimes, and the owner's asynchronous AI runs on it
against the deployed worker. **The earlier failure is superseded, not rewritten** — §14
and the "Deployment state" section of `STATE.md` keep it exactly as it was recorded.

**BYOK is now CLOSED** — see §16. The real-credential half that blocked it (the two-user
isolation matrix, concurrent rotation and the Settings journeys) was executed on
2026-08-02 once the owner provisioned two disposable product credentials, and BYOK.6's
last code deliverable, the bounded two-key rotation window, is built and drilled.
**Signup Hardening is now authorised** (`ADR-068`); Phase 2G remains unauthorised until
Signup Hardening closes.

---

## 1. Position in the roadmap

| # | Initiative | State |
| --- | --- | --- |
| 1 | **Entity Graph Completion** | **CLOSED.** All three slices merged, all three merge-SHA CI runs green |
| 2 | **BYOK** | **BYOK.1–BYOK.4 CLOSED. BYOK.5 and BYOK.6 merged green but NOT closed** — every repository task done, four owner actions outstanding. Both project-key fallbacks are **deleted**. **BYOK itself is not closed.** See §10, §11, §12 |
| 3 | Signup Hardening | not started |
| 4 | Phase 2G — Conversational Creation | not started, unauthorized until 1–3 close |
| 5 | Phase 2H — Deploy and Operate | not started |
| 6 | Open self-service signup | blocked on all of the above |

---

## 2. Repository truth

- **Branches, all preserved:** `codex/docs-and-gates`, `codex/egc-slice-1`,
  `codex/egc-slice-2`, `codex/egc-slice-3`, `codex/byok-precode`, `codex/byok-slice-1`,
  `codex/byok-slice-2`, `codex/byok-handoff`, `codex/byok-gate-amendment-2`,
  `codex/byok-slice-3`, `codex/byok-slice-3-handoff`, `codex/byok-slice-4`,
  `codex/byok-slice-5`, `codex/byok-slice-6`, `codex/byok-slice-6-handoff`.
- **Migration chain head: `202608010069`.** Entity Graph Completion added **zero**
  migrations across all three slices; BYOK.1, BYOK.2 and BYOK.3 added one each and BYOK.4
  two, each slice moving the head by exactly its budgeted allocation. The budget is
  **five** since `ADR-070`, and all five are now spent.
- **None of the five BYOK migrations has been applied to a shared environment.** All five
  are validated on every CI run by `supabase db reset` from empty, plus 57, 31, 58 and 47
  pgTAP assertions. The last verified local/remote parity is the version Slice G5 closed
  on. **This is the single shared reason for every deferred acceptance item in both §9 and
  §10.**
- **Hosted signup: DISABLED and verified** (gate G-0.5).
  Evidence: `docs/reports/G05_HOSTED_SIGNUP_CLOSURE_EVIDENCE.md`.

### Merged this loop

| Slice | PR | Merge SHA | Merge-SHA CI run | Result |
| --- | --- | --- | --- | --- |
| EGC.1 | #53 | `840da99` | `30672108083` | green, all three jobs |
| EGC.2 | #54 | `8305424` | `30677225551` | green, all three jobs |
| EGC.3 | #55 | `961feeb` | `30679796049` | green, all three jobs |
| BYOK pre-code | #56 | `6ae230e` | `30683099857` | green, all three jobs |
| BYOK.1 | #57 | `bf99c37` | `30684596621` | green, all three jobs |
| BYOK.2 | #58 | `0c5f4f9` | `30686033145` | green, all three jobs |
| BYOK handoff | #59 | `0b62a5b` | `30686913834` | green, all three jobs |
| BYOK gate amendment | #60 | `e43df60` | (run on main) | green, all three jobs |
| **BYOK.3** | #61 | `2c70784` | `30711977571` | green, all three jobs |
| BYOK.3 handoff | #62 | `423625d` | `30715442719` | green, all three jobs |
| **BYOK.4** | #63 | `81b1110` | `30720640705` | green, all three jobs |
| **BYOK.5** | #64 | `41240ab` | `30723026363` | green, all three jobs |
| **BYOK.6 (partial)** | #65 | `4a5b187` | `30725104149` | green, all three jobs |

---

## 3. Test and gate state

- **Lint 0, typecheck 0, build exit 0.**
- **Vitest: 3475 passed, 2 failed** (the CRLF pair below).
- **Locale ternaries: 262** (ceiling 266, now permanently guarded).
- **Serialized authenticated journeys:** EGC set 16/16, route audit 18/18, desktop +
  Pixel 7, both locales.
- **Residue: 0.** `npm run verify:egc:cleanup` — 2 accounts scanned, both real, 0
  `likely-fixture`.

### The two failing tests are NOT a regression

`src/features/task-commands/sql-reachability.test.ts` loses 2 of its 46 assertions on a
**Windows checkout**, and loses the identical two on `main`, whose CI is green. Cause:
`core.autocrlf = true` with no `.gitattributes`, against two assertions anchored on a bare
`\n` immediately after non-whitespace. Linux CI reads LF and passes.

**Do not treat this as a regression and do not fix it inside a feature branch.** It is
recorded as repository maintenance in `PRODUCT_UX_CLOSEOUT.md` §8.

---

## 4. BYOK — gate status: all five satisfied

Governing artifacts exist and are approved: `docs/BYOK_PRD.md`,
`docs/BYOK_IMPLEMENTATION_PLAN.md`, `docs/reports/BYOK_SECURITY_DEFINITION.md`.

The plan declared **five pre-code gates** under one absolute rule. **On 2026-08-01 the
owner amended that rule to a dependency-specific one** — `ADR-069`, recorded as append-only
**Amendment A-1** in the plan's §0, which reproduces the original text unchanged. Current
status:

| Gate | Status |
| --- | --- |
| **G-0.1** — provider call-site census, re-measured against `main` | **DONE.** `docs/reports/BYOK_G01_PROVIDER_CENSUS.md`, measured at `961feeb` |
| **G-0.2** — crypto interop proof, Node ↔ Deno, identical AAD | **DONE and executed.** Node 22.18.0 ↔ Deno 2.9.4, both directions, 7/7. `npm run byok:interop`; evidence in `docs/reports/BYOK_G02_CRYPTO_INTEROP_EVIDENCE.md` |
| **G-0.3** — procedure | **DONE.** `docs/reports/BYOK_G03_MASTER_KEY_PROCEDURE.md` |
| **G-0.3** — `local` / `test` provisioning | **DONE and verified.** Now **three** secrets per environment, not two: `ADR-070` added `BYOK_RATE_LIMIT_PEPPER`. 6/6 present, valid base64, 32 bytes; **15/15 pairs distinct**; 1007 tracked files scanned, **0 matches**. Evidence: `BYOK_G03_MASTER_KEY_PROCEDURE.md` §7 and §8 |
| **G-0.3** — `preview` / `production` provisioning | **DEFERRED to point of use** (Amendment A-1.2), for all three secrets. Gates *deployment*. **Owner action** when it arrives |
| **G-0.4** — dedicated low-limit OpenAI validation key | **SATISFIED and its lane EXECUTED** (`ADR-070`). Dedicated project and key, USD 2 budget **alert** (soft, not a cap), restricted models, lowest practical limits, acceptance-lane-only. `npm run test:byok:validation` — 4 passed, three real round trips. Evidence: `BYOK_SLICE_03_ACCEPTANCE.md` §2 |
| **G-0.5** — hosted signup closed | **Satisfied and verified** |

### What is closed now

**BYOK.1, BYOK.2 and BYOK.3 are CLOSED** — all merged, all with green merge-SHA CI on all
three jobs.

**Every question this file previously listed as blocking is answered and executed:**

1. **G-0.4** — satisfied, and its live lane **ran**. `npm run test:byok:validation`, 4
   passed, three real round trips. The lane did **not** ship marked passed while
   unexercised, which is what `ADR-069` forbids.
2. **The reachability gap** — closed. The owner placed the value in `.env.local`; verified
   present and non-empty, 1024 tracked files scanned, **0 matches**, nothing about it
   recorded beyond that boolean.
3. **The per-IP throttle conflict** — resolved by `ADR-070` and shipped in `202608010067`:
   an `ip_hash` column, a third independent secret, budget four to five.

### What BYOK.3 changed that everything downstream now depends on

**The project key no longer serves any Node user path.** `options?.apiKey ??
process.env.OPENAI_API_KEY` is deleted, the credential is a required property of a required
argument, and all five Node provider sites resolve per user. Settings shipped in the same
slice, because a fallback removed without it would leave the product AI-less.

**The worker is the remaining exception, and it is dated.**
`supabase/functions/process-jobs/index.ts` still reads `OPENAI_API_KEY`, and
`project-key-guard.test.ts` asserts that read is **present** — so when BYOK.4 deletes it,
that test fails and forces the allowlist to shrink in the same commit. An allowlist that
outlives its exception is how they grow.

### One concern investigated and dismissed

BYOK.1 task 1.2 says "regenerate `src/lib/supabase/database.types.ts`", and Docker is
unavailable here — so it looked like a third blocker. **It is not.**
`database-types-parity.test.ts` records that `supabase gen types typescript` refuses to
run without an access token even against a local `--db-url`, that planting a
credential-shaped string in the workflow was tried and correctly rejected by push
protection, and that the repository's answer is a **content comparison between the
migration and the types file**. So the types file is maintained by hand alongside the
migration, with parity proven by test — no Docker, no token, no live database.

### The gate question, asked and answered

The plan's §0 said: *"No slice may start until every artifact below is in the
repository."* On 2026-07-31 the loop reached the reading that G-0.4 gates BYOK.3's
validation lane specifically — and **refused to act on it**, because softening a governing
document's invariant inside a branch is not an implementer's act. It stopped and asked.

**The owner decided on 2026-08-01, and the decision is recorded rather than assumed**:
`ADR-069` and Amendment A-1. The owner's ruling confirms the reading and **strengthens one
half of it** — G-0.4 gates not only the lane but BYOK.3's acceptance and merge, so the lane
cannot ship unexercised behind a "built but disabled" framing.

The three questions this file previously carried are now closed:

| Question | Answer |
| --- | --- |
| Provision preview and production secrets? | **Deferred to point of use** (`BYOK-GATE-DEC-3` / A-1.2). Preview before the first BYOK preview deployment; production before BYOK.5. Both runtimes per environment; all values distinct |
| The validation key and its spend limit? | **`BYOK-GATE-DEC-4`.** Dedicated project and key, restricted permissions, USD 2 monthly budget **alert** — documented as a soft alert, **not** a hard cap — lowest practical rate limits, opt-in lane only, `maxRetries: 0`, short timeout, hard daily attempt ceiling, revoked after acceptance. **Not yet created** |
| May BYOK.1 and BYOK.2 start ahead of G-0.4? | **Yes, explicitly** (`BYOK-GATE-DEC-1` / A-1) |

**Do not fabricate a key, do not commit one, and do not weaken a gate to proceed.**

---

## 5. Standing rules this loop has been following

- Every slice: own branch, thematic commits, PR, PR-head CI, merge, **exact merge-SHA
  CI**, preserved branch, acceptance report.
- Every slice ends with an **adversarial review** whose findings are all fixed or
  explicitly recorded — never argued down.
- Docker is **unavailable** on this machine, so pgTAP files cannot be run locally. They
  are the highest-risk artifact in every slice: four of the twenty-seven EGC review
  findings were pgTAP BLOCKERs that would have made CI red on the first attempt.
  **Scrutinise pgTAP statically and hard before pushing.**
- Reports state what failed. The two CRLF failures are reported as failures every time
  rather than folded into a "green" claim.
- Factual corrections to a PRD are **recorded**, not folded in. Entity Graph Completion
  produced six; they are listed in `docs/reports/EGC_REPORT.md` §5.

---

## 6. Where to read next

| Question | File |
| --- | --- |
| What is the current phase and what is authorized? | `docs/STATE.md` |
| What did Entity Graph Completion deliver and cost? | `docs/reports/EGC_REPORT.md` |
| Which requirement is evidenced by what? | `docs/reports/EGC_TRACEABILITY_MATRIX.md` |
| What is BYOK supposed to be? | `docs/BYOK_PRD.md`, `docs/BYOK_IMPLEMENTATION_PLAN.md` |
| What can BYOK never claim? | `docs/reports/BYOK_SECURITY_DEFINITION.md` |
| What is still outstanding? | `docs/TODO.md` |

---

## 7. The smallest owner action that unblocks BYOK.3 (G-0.4)

**Nothing is pasted into chat, into a file, or into a commit.** The key goes straight from
the OpenAI dashboard into the CI/test secret store under the name below.

**Secret variable name: `BYOK_VALIDATION_OPENAI_API_KEY`.** Deliberately not
`OPENAI_API_KEY` — the validation lane must be incapable of being satisfied by the project
key, and a distinct name is what makes BYOK-GUARD-001's allowlist able to say so.

1. **platform.openai.com → Organization → Projects → Create project.** Name it something
   unmistakable, e.g. `my-brain-byok-validation`. **A dedicated project, not the owner's
   normal one** — the whole point is that its budget, limits and blast radius are separate.
2. **Inside that project → Limits → Rate limits.** Set the **lowest practical** per-model
   limits. The lane makes one call per validation attempt; it needs almost nothing.
3. **Inside that project → Limits → Budgets → set a monthly budget of USD 2 with an alert.**
   **Record, and expect, that this is a soft alert and not a hard spending cap.** The hard
   ceiling is the application-side daily validation-attempt limit BYOK.3 implements; the
   OpenAI budget is the second line, not the first.
4. **API keys → Create secret key**, scoped to that project, with permissions **restricted
   to only the endpoints and models validation calls** — no fine-tuning, no assistants, no
   batch, no admin.
5. **Store it as `BYOK_VALIDATION_OPENAI_API_KEY`** in the GitHub Actions secret store for
   this repository (Settings → Secrets and variables → Actions → New repository secret),
   and, if the lane is to be runnable locally, in `.env.local` — never in `.env.example`,
   never in a commit.
6. **Tell the implementer the secret exists.** It never needs the value.
7. **After BYOK.3's acceptance lane, revoke the key** unless it is needed continuously.

### Status, 2026-08-01: DONE. Every step, including step 5.

The owner provisioned the dedicated project and key with every constraint A-1.3 named
(`ADR-070`), and then closed the one remaining gap — **step 5** — by placing the value in
`.env.local`.

**The lane has since been executed:** `npm run test:byok:validation`, 4 passed, three real
round trips. It is recorded as run, not as shipped-and-disabled.

**Verified after the run, and this is all that is recorded:** present and non-empty,
`.env.local` git-ignored and untracked and absent from `git status`, 1024 tracked files
scanned for the exact value, **0 matches**. No length, no prefix, no hash.

**Step 7 remains outstanding and is the owner's:** revoke the key after the acceptance lane
unless it is needed continuously. BYOK.4 does not need it — the worker's validation lane
does not exist — but BYOK.6's closeout may re-run this one, so revoking now is a choice
between a smaller blast radius and one fewer step later.

*Historical, for the record: the gap this section described was real. Measured at `0b62a5b`,
`gh secret list` returned empty on a `repo`-scoped token and the name was absent from both
env files, so the lane could be written but not executed. `ADR-059` runs the opt-in lane
locally and deliberately keeps credentials out of CI, which is why `.env.local` was the
place that mattered. The command was:*

```bash
# In the repository root. The value goes straight from the OpenAI dashboard into
# a git-ignored file; `.gitignore:37` (`.env*`) already covers it.
printf '\nBYOK_VALIDATION_OPENAI_API_KEY=%s\n' 'sk-proj-…' >> .env.local
```

*That is now done, and the lane has run. The paragraph is kept because the sequencing it
describes was the right call and will recur: everything in a slice except the live lane can
be built while a credential is unavailable, and `ADR-069` forbids closing on a lane that was
built but never exercised. BYOK.6 will face the same question.*

---

## 8. BYOK.1 and BYOK.2 — final state

| Slice | Migration | Delivered | Acceptance record |
| --- | --- | --- | --- |
| **BYOK.1** | `202608010065` | `BYOK-SCHEMA-001…007`, `BYOK-CRYPTO-001…007`, `BYOK-MASTER-001…012`, `BYOK-FINGERPRINT-001…005`, `BYOK-GUARD-005` | `BYOK_SLICE_01_ACCEPTANCE.md` — all nine gates A1–A9 |
| **BYOK.2** | `202608010066` | `BYOK-RESOLVER-001…008` | `BYOK_SLICE_02_ACCEPTANCE.md` — all seven gates B1–B7 |

**What exists now:** two tables with forced RLS and no client `DELETE` anywhere, an
AES-256-GCM envelope whose AAD binds each ciphertext to its owner in both runtimes, a
fingerprint that is a slice of nothing, startup validators for both secrets, two locality
guards, a chain scan, and two resolvers that derive their owner structurally and return
ciphertext only.

**What does not exist, and must not be assumed:** no adapter, no Settings surface, no
validation lane, no provider change. **`OPENAI_API_KEY` is untouched and every existing AI
path still uses it.** Nothing in the product reads a credential yet, and the startup
validators are called by no process — deliberately, because wiring a fail-to-start check
before preview and production secrets exist would invert Amendment A-1.2's ordering and
schedule an outage.

### Four things the next session should not have to rediscover

1. **The startup checks are unwired on purpose.** Node's call site belongs to BYOK.3,
   the worker's to BYOK.4 (whose task 4.13 already owns the deploy). Gate A6 is recorded as
   passed *with that limit stated*, not as fully wired.
2. **Docker is unavailable here, and pgTAP is the highest-risk artifact every time.**
   BYOK.2's static review caught three defects that would each have reddened CI and none of
   which any local command would have found: `information_schema.columns` does not describe
   function return columns; `jobs.type = 'interpret_entry'` fires a payload trigger that
   rejects `'{}'`; and `proconfig` stores the empty search path as `search_path=""`.
3. **A guard must not forbid documenting the thing it guards.** Three separate scans in
   this initiative needed comment-stripping before they stopped failing on their own
   explanations — the third also needed `comment on … is '…'` bodies stripped, because a
   catalog comment is prose that happens to live in SQL.
4. **The EGC migration pin now has two historical bounds and one moving one.** A slice that
   adds a migration updates `AUTHORIZED_MIGRATION_HEAD` in the same commit. It must **not**
   touch `EGC_FINAL_HEAD` or `FIRST_POST_EGC_MIGRATION` — those are facts about the past,
   and an earlier revision that used the moving pin as an upper bound broke the moment a
   second migration arrived.

---

## 9. BYOK.3 — final state, and the three items it does not claim

**Closed:** PR #61, merge SHA `2c70784`, merge-SHA CI run `30711977571`, green on all three
jobs. Migration `202608010067`. Acceptance record:
`docs/reports/BYOK_SLICE_03_ACCEPTANCE.md`.

### What exists now that did not before

The project-key fallback is **deleted**. Plaintext travels in a branded `Secret` that throws
on `toString`, `toJSON`, `Symbol.toPrimitive` and `JSON.stringify`. Settings can save,
rotate and remove a credential, showing metadata only and offering no reveal control
anywhere. Validation makes one live call with `maxRetries: 0` and maps every provider
failure to one of six words. The throttle enforces per-user and per-IP daily ceilings under
advisory locks. `ip_hash` is an HMAC over a canonicalized address under a third independent
secret, with 30-day bounded retention swept by a function no client role can execute.

### Three acceptance items are NOT claimed, for one shared reason

**No BYOK migration has been applied to a shared environment.** Everything below becomes
available at the first deployment, which Amendment A-1.2 gates on preview and production
secrets existing.

| Item | Why not executed |
| --- | --- |
| Matrix cases 1–3 | need two real accounts each saving a distinct key against a deployed database |
| C10, concurrent rotation | needs two simultaneous rotations against one row. The staleness witness makes one win and one receive a declared conflict **by construction** — a single-statement `update … where updated_at = <witness>` cannot partially apply — but that is not the same as executed |
| C11, desktop + Pixel 7 Settings journeys | `test:e2e:online` runs against the linked project, where `user_ai_credentials` does not exist, so the panel would fail on a missing relation rather than render |

The pgTAP suite carries the same honesty about itself: it is single-session, so the advisory
locks are never contended and **true concurrency is reasoned, not executed**.

### Four test defects this slice made and fixed, recorded rather than smoothed

Two guard drafts were too broad (`?? process.env` caught model-name reads, which are not
credentials; `return[^;]*ciphertext` caught `sealCredential`, which returns database
columns). One migration scan reddened on its own explanatory header — the **third** time a
guard in this initiative forbade documenting the thing it guards. And one assertion was
**probabilistic**: `not.toContain("113")` over a 64-character hex digest fails ~1.5% of the
time by chance, passed twice and failed on the third CI run. All four are in
`BYOK_SLICE_03_ACCEPTANCE.md` §5, with the reasoning, because a defect silently corrected
teaches nothing.

### What BYOK.4 must do first

Delete `Deno.env.get("OPENAI_API_KEY")` and its 503 branch from
`supabase/functions/process-jobs/index.ts`, and **shrink the allowlist in
`project-key-guard.test.ts` in the same commit** — that test asserts the read is present
precisely so this cannot be forgotten.


---

## 10. BYOK.4 — final state, and what BYOK.5 must do

**Branch:** `codex/byok-slice-4`, from `main` at `423625d`. **Merged as `81b1110`
(PR #63), merge-SHA CI run `30720640705`, all three jobs green.**
**Migrations:** `202608010068`, `202608010069`. Head `202608010067` -> `202608010069`,
**by exactly two** — the whole of BYOK.4's approved budget, and the last of the
initiative's five.

**Acceptance record:** `docs/reports/BYOK_SLICE_04_ACCEPTANCE.md` — all fourteen gates,
with two recorded as NOT CLAIMED and one requirement deviation named.

### What is closed now

`Deno.env.get("OPENAI_API_KEY")` is **gone**, with its 503 branch, the `openaiKey`
parameter through `dispatch.ts`, and the allowlist entry that permitted it — in one
commit, because `project-key-guard.test.ts` asserted the read's *presence* precisely so
that deleting it would force the allowlist to shrink alongside it. **No deployed Deno path
can reach a process-wide provider key**, asserted by walking every file under
`supabase/functions/` in both directions.

What exists that did not before:

| Thing | Where |
| --- | --- |
| Deno credential adapter — takes a **job id and nothing else** | `supabase/functions/_shared/byok-adapter.ts` |
| Branded secret, Deno half, one declared asymmetry | `supabase/functions/_shared/byok-secret.ts` |
| Closed failure vocabulary + retry policy + the only way to record a failure | `supabase/functions/_shared/job-failure.ts` |
| `awaiting_ai_configuration` lifecycle, capture idempotency, credential-aware capture | `202608010068` |
| Credential-aware drain, `fail_job_terminal` | `202608010069` |
| Bounded, explicit pending-entry action (25/invocation, reports its count) | `src/features/byok/actions.ts` |
| Node/Deno adapter parity lock, with four proven-failing mutations | `src/lib/byok/adapter-parity.test.ts` |
| Heartbeat-AI-free, boot-check and no-auto-processing guards | `src/lib/byok/worker-guard.test.ts` |
| Executed ownership behaviour, against a `fetch` that fails the test if called | `supabase/functions/process-jobs/ownership.test.ts` |
| 47 pgTAP assertions over both migrations | `supabase/tests/byok_awaiting_and_drain.sql` |

### Two gates are NOT claimed, for the same reason as BYOK.3's three

**D2** (async matrix cases against the deployed function) and **half of D10** (deployed
bundle matches local). No BYOK migration has been applied to any shared environment and
`OPENAI_API_KEY` is still the deployed function's secret, so there is no deployed worker
that can decrypt a credential. These are not skipped cases — there is nowhere to run them.
The blocker is the same one that holds BYOK.3's matrix cases, concurrent rotation and the
Settings journeys, and **it moves in BYOK.5 and BYOK.6, not by re-running anything here.**

### One requirement deviation, named rather than papered over

`BYOK-GUARD-003` asks for *a Deno test* asserting handlers resolve from the claimed row's
owner before any provider call. The worker suite runs with **no `--allow-*` flags at all**,
by design, so it cannot read a source file. The substance is split — behaviour executed in
Deno (`ownership.test.ts`), absence asserted in Node (`worker-guard.test.ts`) — and the
split is written into both files' headers. Stronger than the single test described; still
not that test.

### `ADR-071` — read it before touching migration 2

Two things it records, both of which a future session would otherwise re-derive:

1. **`fail_job_terminal` is a declared expansion of an approved migration's content.** The
   file count stayed at two; the described content did not. `fail_job` cannot express
   terminality (its only rule is `attempts >= max_attempts`), and PostgreSQL cannot extend
   an argument list with `create or replace` — `ADR-057`.
2. **"Consumes no retry" is narrowed.** `jobs.attempts` is incremented by the **claim**, so
   the attempt is spent before any handler runs. What is guaranteed is that no *further*
   attempt is scheduled.

### Three residual risks, open and named

`fail_job` still accepts free text at the database level (safe only because
`_shared/job-failure.ts` is its sole caller); `reap_expired_jobs` writes the fixed literal
`'Worker lease expired'`, which is not a vocabulary member; and
`attachments.processing_error` is Portuguese-only, a pre-existing gap BYOK.4 matched rather
than widened. All three are in `BYOK_SLICE_04_ACCEPTANCE.md` §6 and `TODO.md`.

### One defect this slice found in itself

`mark_entry_awaiting_ai_configuration` refuses an entry that already carries an
interpretation. The worker's first draft treated the mark as unconditional, so a
**reprocessing** job whose credential vanished mid-flight left its entry in `reprocessing`
with the lease never released — "organizing" forever, nothing running, nothing left to
expire it. Fixed and pinned in both directions before the PR. Three smaller findings are in
`BYOK_SLICE_04_ACCEPTANCE.md` §7.

### What BYOK.5 must do, and where it must stop

1. **Remove `OPENAI_API_KEY` from the deployed Edge Function secrets** and from the
   application runtime environment. Verified **against the deployment**, not the
   repository.
2. **Pin the allowlist to exactly three entries** — `.env.example`, and the two test files
   that assert this posture. It is already at three; `BYOK-GUARD-006` makes adding a fourth
   require an ADR.
3. **The owner configures their own key through the same Settings flow every user uses.**
   Not seeded from the environment, not copied by a script or a migration.
4. Execute the owner's synchronous and asynchronous journeys on that credential.

**The stop is step 3, and it is a true stop condition**: it requires entering a credential
through an authenticated product surface, which no agent may do. Steps 1 and 2 also require
platform access. Everything else — code, guards, tests, documentation — must be committed
and pushed before stopping, and the exact owner-facing commands must be written here.

**Do not seed the owner credential from `OPENAI_API_KEY`.** Not by script, not by
migration, not as a convenience. The whole point of BYOK.5 is that the owner is not
privileged in the credential-resolution contract.


---

## 11. BYOK.5 — STOPPED at the owner boundary

**Branch:** `codex/byok-slice-5`, from `main` at `81b1110`. **Migrations: 0.**
**Merged as `41240ab` (PR #64), merge-SHA CI run `30723026363`, all three jobs green.**
**Acceptance record:** `docs/reports/BYOK_SLICE_05_ACCEPTANCE.md`.

**This is a true stop condition**, not an incomplete slice. Three gates need
platform access; one needs a credential typed into an authenticated product
surface. Neither is derivable from the approved architecture, and no agent may
perform either.

### What is done

| Gate | State |
| --- | --- |
| **E4** — allowlist exactly three, both directions | **EXECUTED** |
| E1, E2, E3 | **BLOCKED** on owner actions below |
| E5 — full remote suite | **NOT RUN, deliberately** — its purpose is to confirm the scripts still work *after* the cutover |

Also done: a classification per allowlist entry compared in both directions; a
proof that every exception is unreachable from a deployed user bundle; a scan
asserting no deployed module in either runtime reads an `API_KEY`-shaped
environment name; and an assertion that the credential chain contains **no
identity comparison, no identity from configuration, and no hardcoded uuid** — so
the mechanism by which the owner could be privileged does not exist. That does
not discharge E3; it removes the way E3 could fail.

### A plan correction, measured

Task 5.3 names `scripts/remote-*.mjs` as the third classified exception. **It is
empty in fact** — no script references `OPENAI_API_KEY`; `remote-supabase-smoke.mjs`
carries the literal `"openai"` only as a provider *name*. The count agrees with
the plan while the composition does not, and the guard now asserts this in both
directions so a future edit cannot "restore" a scripts entry to match prose.

### The four owner actions, in order

Order matters in two places, and getting it wrong causes an outage rather than a
mistake.

1. **Provision three secrets** — `BYOK_MASTER_KEY`, `BYOK_FINGERPRINT_PEPPER`,
   `BYOK_RATE_LIMIT_PEPPER` — in **both** the Supabase Edge Function secret store
   and the hosting platform's Next.js environment. Distinct per environment,
   distinct from each other, distinct from local and test.
2. **Apply migrations `202608010065`…`202608010069`** — *after* step 1, because
   the worker refuses to serve without `BYOK_MASTER_KEY` by design.
3. **Deploy `process-jobs`, then unset `OPENAI_API_KEY`** — in that order, so
   there is no window where a deployed old worker has neither key. Then remove it
   from the Next.js environment. **E2 is the read-back**, verified against the
   deployment.
4. **The owner configures their own key through Settings.** Not seeded from
   `OPENAI_API_KEY`, not by script, not by migration — a seeded credential would
   make the owner the one account that never proved the flow.

Exact commands: `BYOK_SLICE_05_ACCEPTANCE.md` §3.

### What resumes automatically afterwards

E1, E2, E3, E5, **and every item BYOK.3 and BYOK.4 deferred on the same
blocker**: the asynchronous matrix cases against the deployed function, the
deployed-bundle comparison, concurrent rotation, and the desktop/Pixel 7 Settings
journeys. One unblocking clears all of them, which is why they were recorded
together rather than slice by slice.

### One question left open on purpose

After step 3, `OPENAI_API_KEY` has **no reader anywhere** — not the app, not the
worker, not a script, not a test. This repository removes consumer-less contracts
rather than keeping them, so the `.env.example` line should probably go. It is
not removed here: it would disagree with a deployed reality until step 3
completes, and `guards.test.ts` currently asserts its presence as the control
keeping `BYOK_VALIDATION_OPENAI_API_KEY` distinct from it. Handed to **BYOK.6's
convergence audit**, whose standard is exactly this.


---

## 12. BYOK.6 — PARTIAL, and it cannot close

**Branch:** `codex/byok-slice-6`, from `main` at `41240ab`. **Migrations: 0.**
**Merged as `4a5b187` (PR #65), merge-SHA CI run `30725104149`, all three jobs green.**
The residue suite is confirmed **executed** in that run, not merely shipped:
`byok_residue.sql ... ok`, 16 assertions.

BYOK.6's deliverables split in two, and the split is the whole story:

**Executed here (environment-independent):**

- `supabase/tests/byok_residue.sql` — the zero-secret residue verifier, **run in
  CI**. It does not check a list of tables: it enumerates every base table in
  `public` carrying a `user_id` at run time, so a future BYOK table without a
  cascade fails by name without anybody having remembered to add it. Five
  calibration assertions prove the scanner finds rows *before* the delete, and
  four negative-control assertions prove a second account's identical rows
  survive — because "everything is gone" is trivially satisfied by a cascade that
  reached too far.
- `docs/reports/BYOK_INCIDENT_RUNBOOK.md` — master-key rotation, loss and
  compromise; pepper rotation; the validation key's lifecycle. **Marked "written,
  not drilled" at the top of the file and of every section**, because a runbook
  nobody has run is a hypothesis with formatting.

**Blocked on the same four owner actions as BYOK.5:** the complete cross-user
isolation matrix, concurrent rotation, queued-job removal and rotation execution,
the desktop and Pixel 7 Settings journeys in both locales, the master-key loss
drill against a disposable project, the validation-key revocation evidence, and
the remote smoke.

**One code deliverable remains and is deliberately not attempted:** the bounded
two-key master-key rotation window (§2a of the runbook). It needs a previous-key
read, a per-row `key_version` bump and a completion counter — designed against a
real environment rather than invented against none. Until it exists, the only
available rotation is invalidate-and-ask, which is correct for a compromise and
wrong for hygiene, and the runbook says so.

**BYOK does not close here, and must not be recorded as closed.** Its own
criteria include proven Node/Deno isolation at runtime, removal blocking future
asynchronous work in a deployed environment, and recovery procedures that exist
*and have been executed*. `ADR-069`'s rule applies to all of it: a lane that
ships marked "passed" while unexercised is worse than one marked "unexercised",
because the first is believed.


---

## 13. Where the loop stops, and what the next context must not do

**Stopped at:** owner-only provisioning and credential entry. Both are true stop
conditions under the loop's own rules — privileged actions on platforms an agent
cannot reach, and a credential typed into an authenticated product surface.

**Do not, on resuming:**

- **Do not record BYOK as closed.** Its criteria include proven Node/Deno runtime
  isolation, removal blocking asynchronous work in a *deployed* environment, and
  recovery procedures that have been *executed*. None of those has happened.
- **Do not start Signup Hardening or Phase 2G.** Both sit behind BYOK's close in
  `ADR-068`'s ordering. Building the next initiative on unproven credential
  isolation is the exact failure `ADR-069` exists to prevent.
- **Do not seed the owner's credential** from `OPENAI_API_KEY`, by script,
  migration or convenience. It would make the owner the one account that never
  proved the flow.
- **Do not re-run the deferred gates hoping they pass.** They do not fail; they
  have nowhere to run. One unblocking clears all of them at once.

**The four owner actions, in the order that matters** (full commands in
`BYOK_SLICE_05_ACCEPTANCE.md` §3):

1. Provision `BYOK_MASTER_KEY`, `BYOK_FINGERPRINT_PEPPER`,
   `BYOK_RATE_LIMIT_PEPPER` in **both** the Supabase Edge Function secret store
   and the hosting platform's Next.js environment.
2. Apply migrations `202608010065`…`202608010069` — **after** step 1, because the
   worker refuses to serve without its master key by design.
3. Deploy `process-jobs`, **then** unset `OPENAI_API_KEY` from the function
   secrets and the Next.js environment — that order, so no deployed worker is
   ever left with neither key.
4. The owner configures their own key through Settings.

**What unblocks the moment those are done**, all at once and from a single
cause: BYOK.3's matrix cases 1–3, concurrent rotation (C10) and the desktop /
Pixel 7 Settings journeys (C11); BYOK.4's D2 and the deployed-bundle half of D10;
BYOK.5's E1, E2, E3 and E5; and BYOK.6's isolation matrix, queued-job removal and
rotation execution, master-key loss drill, validation-key revocation evidence,
remote smoke and final report.

**One code deliverable remains that no owner action unblocks:** the bounded
two-key master-key rotation window — a previous-key read, a per-row `key_version`
bump, a completion counter, and the 30-day expiry rule. It was deliberately not
attempted against no environment, and the runbook records that the only rotation
available today is invalidate-and-ask: right for a compromise, wrong for hygiene.

---

## 14. The second stop — 2026-08-02, after the deployment. **This supersedes §13.**

§13 is retained as the record of the first stop; every one of its four owner actions has
since been performed. Do not act on §13's list. Act on this one.

### What the deployment proved

Verified against the deployment rather than reported. Full record:
`docs/reports/BYOK_DEPLOYED_ACCEPTANCE.md`.

- Parity `202608010069` both sides; `process-jobs` version 20, **16/16 files
  byte-identical** to `abef6e4`; **zero** executable project-key references in the
  downloaded bundle; `OPENAI_API_KEY` absent from the deployed secrets (**E2 passes**).
- **D2 passes on every case** and **D10 passes in full** — both had nowhere to run before.
- Twelve deployed-worker cases pass: uncredentialed owners skipped without burning
  attempts; a job made eligible by configuring a credential; terminal state on an
  unreadable credential with no further attempt scheduled; declared safe code in
  `jobs.error` and nothing else, censused across the whole table; the entry returned to
  `awaiting_ai_configuration`; a foreign object id crossing no owner boundary; removal
  refused as a mere flag by the database; removal blocking queued work; and the same job
  recovering once a credential is reconfigured.
- **The master-key loss drill is executed** — not synthetically. It happened for real,
  and every property it exists to establish was observed.

### The blocker

**The Next.js runtime and the deployed worker hold different `BYOK_MASTER_KEY` values.**
Established three ways, each with its own control. The owner's credential row looks
perfect from every surface that can see it — `active`, fingerprint, `validated_at` — and
its ciphertext opens under no available key. There is no recovery; AES-256-GCM has none
and none is claimed.

Nothing in the product could have reported this: `BYOK-CRYPTO-005` forbids a decryption
failure from naming its cause, so the mismatch is structurally invisible from inside.
`ADR-072` adds the outside check, `npm run byok:verify-runtime`.

### The two owner steps, in this order

1. **Make the two runtimes agree.** The same three BYOK values, byte for byte, in the
   Next.js runtime and the Supabase Edge Function store of this environment. Either
   direction. There is no hosting platform — no shared Next.js environment exists — so
   `.env.local` *is* this environment's Next.js configuration. Confirm with
   `npm run byok:verify-runtime`; it must print `IN PARITY`, and it prints no value and
   no digest. It checks the **file**, not a running process: restart the dev server from
   a clean shell.
2. **Re-enter the credential through Settings.** The stored ciphertext must be replaced,
   not repaired. **Not seeded from an environment variable, not by SQL, not by script.**

### Do not, on resuming

- **Do not record BYOK as closed.** One of its central claims is currently false in the
  deployed environment, and the acceptance record says so.
- **Do not re-run the still-blocked gates hoping they pass.** Concurrent rotation, the
  Settings journeys and the two-user matrix with real credentials each need a
  provider-accepted key used as a **product credential**, and
  `BYOK_VALIDATION_OPENAI_API_KEY` is explicitly not one. That blocker is *different*
  from the one §13 recorded, and it does not clear when the master keys agree.
- **Do not remove the owner's credential to test E3.** Restoring it is not symmetrical
  with removing it, and getting it wrong costs the owner a real OpenAI key and leaves
  them equally broken. The equivalent property is already proven on a disposable account.
- **Do not build the two-key rotation window yet.** Building an unproven recovery
  mechanism on top of a deployment whose credential path is broken is the failure
  `ADR-069` exists to prevent.
- **Do not start Signup Hardening or Phase 2G.** Unchanged from §13, and for the same
  reason.

### What unblocks the moment the two steps are done

E1 in full, E3, E5, concurrent rotation, the desktop/Pixel 7 Settings journeys in both
locales, the two-user isolation matrix with real credentials, and the capture lifecycle's
credentialed half. After those, BYOK's final report and traceability matrix can be
written honestly — and only then does Signup Hardening begin.

---

## 15. The third stop — 2026-08-02, after the remediation. **This supersedes §14.**

§14 is retained as the record of the second stop. Both of its owner steps have been
performed and **verified rather than believed**. Do not act on §14's list.

### What the remediation proved

Full record, appended not edited: `docs/reports/BYOK_DEPLOYED_ACCEPTANCE.md` §10.

- `npm run byok:verify-runtime` → **IN PARITY**, 5/0/0, digest control included.
- The owner's stored credential **opens under the Node runtime's master key** — verified
  read-only against the row's own AAD, with a passing positive control and a rejecting
  wrong-AAD control. The value was never read.
- **OWNER-ASYNC now passes**, on the deployed worker, through the unattended `pg_cron`
  drain: job `completed`, one interpretation persisted, `ai_usage_events` 8 → 10. The
  probe entry was cleaned up; the ledger rows are real usage and stay.
- A deployed account **without** a credential is still refused — `credential_required`,
  one attempt, zero ledger rows — and an account whose ciphertext cannot be opened is
  still refused terminally with `credential_unreadable`.
- `.env.local` holds **no** `OPENAI_API_KEY`. There is nothing to fall back to.
- Zero credential-shaped residue across six readable product tables; `jobs.error` and
  `entries.processing_error` both hold zero distinct values.
- **E5 passes.** All five remote smokes are green.

### One thing this loop changed that a reader must not misread

Two remote scripts were asserting **pre-BYOK** behaviour — that a deployed account with
no credential still gets AI. They are inverted, not weakened: they now assert the
refusal, the declared code, the single attempt and the **absent** ledger row. Do not
"restore" them.

### The blocker, now exactly one

Every remaining BYOK item needs **a provider-accepted OpenAI key that this loop is
authorized to spend as a product credential**. `BYOK_VALIDATION_OPENAI_API_KEY` is
explicitly not one (`ADR-070`). That blocks, and only that blocks:

- the two-user isolation matrix with real credentials,
- concurrent rotation (C10),
- the desktop/Pixel 7 Settings journeys in both locales (C11),
- the end-to-end half of `remote-entry-processing-smoke.mjs`.

### The smallest owner action

**Provide one or two disposable, low-limit OpenAI keys that the loop is authorized to
enter through the Settings product flow on disposable accounts, and say so explicitly.**
Two keys unblock everything above; one key unblocks everything except concurrent
rotation. Place them in `.env.local` under names of your choosing and name those names —
**do not paste any key into a chat message.** A USD 1–2 budget alert and the lowest
practical rate limits are enough; `ADR-070` records the shape.

Nothing else is needed. No migration, no deployment, no schema change.

### Do not, on resuming

- **Do not record BYOK as closed.** No central runtime claim is false any more, but the
  isolation matrix, rotation and the Settings journeys are unexecuted, and an initiative
  whose isolation claim is unexercised must not be marked done.
- **Do not remove the owner's credential to test E3.** Unchanged from §14 and for the
  same reason. The equivalent property is proven on disposable accounts.
- **Do not simulate rotation or isolation with synthetic credentials and claim C10/C11.**
  A synthetic ciphertext proves the fail-closed path and nothing about a provider.
- **Do not build the two-key rotation window unasked.** It is BYOK.6's last code
  deliverable and it is unauthorized, not merely unstarted.
- **Do not start Signup Hardening or Phase 2G.** Unchanged.

### What is open in the repository at this stop

Three PRs came out of this loop. They are independent of each other.

- **PR #68 — MERGED** at `156e414`, merge-SHA CI run `30752744866`, **all three jobs
  green**. The candidate due-date contract fix: a model-produced end-of-day due date took
  the entry detail route to the error boundary because one reader demanded `:00` seconds
  while the contract on both sides of it permitted any. Independent of BYOK.
- **PR #69 — MERGED** at `f15bcca`, merge-SHA CI run `30753460203`, **all three jobs
  green**. Rebased onto `156e414` first. The two inverted remote smokes and
  the documentation for §10 and §15. Its `CHANGELOG.md` and `STATE.md` conflicts with
  PR #68 were reconciled **semantically and append-only**: both entries are retained in
  full, and the superseded "cutover fails" records carry an explicit dated supersession
  banner rather than being rewritten.
- **PR #70** — the service worker cloned a `Response` after handing it to the page, so
  `sw.js` logged an error on every cache miss and cached nothing. Unrelated to the
  due-date failure it was reported alongside; the `asynchronous listener` /
  `No Listener` messages reported with it are browser-extension noise and are
  deliberately not chased. **Rebased onto `f15bcca`**; its `CHANGELOG.md` conflict was
  reconciled the same way — every entry retained, the service-worker record placed
  beside the other product-defect entry so the two BYOK entries stay adjacent as a
  supersession pair.

---

## 16. BYOK is CLOSED — 2026-08-02. **This supersedes §15.**

§13, §14 and §15 are retained as the record of the three stops. Every owner
action any of them listed has been performed, and every gate they left blocked
has been executed.

### What closed it

The owner provisioned two disposable, low-limit OpenAI **product** credentials.
That was the single blocker §15 named, and with it every remaining gate ran
against the deployment with real provider calls:

- **C11 Settings journeys — 4/4**, desktop and Pixel 7, pt-BR and English.
- **Two-user isolation with real credentials — PASS**, synchronous and
  asynchronous, evidenced cryptographically because a provider-side
  distinguisher was looked for and **measured absent**.
- **C10 genuine concurrent rotation — PASS**: same staleness witness, two tabs,
  `Promise.all`, one winner and one declared conflict.
- **Removal, queued jobs, capture lifecycle, bounded processing — PASS.**
- **Fixture cleanup — PASS** with non-vacuous positive and negative controls.
- **BYOK.6's last code deliverable — the bounded two-key rotation window — is
  built, parity-locked across both runtimes, and drilled** on disposable
  material.

Full records: `BYOK_DEPLOYED_ACCEPTANCE.md` §11 and
`BYOK_TRACEABILITY_MATRIX.md`.

### What the lane found on the way

Three product defects no unit test could reach, each fixed with a regression
test: `formatFingerprint`'s parse-don't-trust guard had **no consumer**; the
panel reported the previous action's outcome after a removal; and a save after a
removal announced itself as a *replacement*. A fourth finding was mine, not the
product's — a decrypt harness that read `bytea` as base64 and reported a false
"master key mismatch".

### What is NOT closed, and must not be recorded as if it were

- **`BYOK-OPERATIONS` (6 requirements) is not built.** No operator dashboard, no
  alerting, no admin view of credential health. Unchanged from
  `2F-OPERATIONS-002`.
- **The production master-key rotation has never been run.** Owner-authorised
  key change; there is no undo; `byok:verify-runtime` must print `IN PARITY`
  first and `--limit` exists so a first run can be checked.
- **Six orphaned storage objects from 2026-07-16.** Database rows cascade on
  account deletion; storage objects do not. This is Signup Hardening's
  account-deletion requirement, found by this sweep.
- **Three OpenAI keys should be revoked** — the validation key and the two
  disposable product credentials. Outside the implementer's boundary.
- **47 of 131 requirement ids are untraced**, dispositioned family by family in
  the traceability matrix. Most are implemented and were executed this session;
  `BYOK-OPERATIONS` genuinely is not.

### Next

**Signup Hardening**, per `ADR-068`, which BYOK's close authorises. Its three
prerequisites do not exist at all: **account deletion** (and the storage-residue
gap above is part of it), **admin suspension**, and **terms and privacy policy**.
Phase 2G stays unauthorised until Signup Hardening closes.
