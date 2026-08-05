# Autonomous loop — durable handoff

**Purpose.** This file is the loop's continuity artifact. It records exactly where the
authorized roadmap stands so a fresh context can resume without re-deriving anything.
**Update it at every merge boundary.**

Last updated: **2026-08-04**, during **Signup Hardening SH.0**. **§18 supersedes §17, which
supersedes §16's "Next", which supersedes §15, which supersedes §14, which supersedes §13.**
BYOK's close is §16; the planning merge is §17; the owner approval and the running
implementation are §18, and §18 is the section a resuming context acts on first.
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

---

## 17. Signup Hardening — PLANNED. **This supersedes §16's "Next".**

Last updated **2026-08-02**, at the Signup Hardening planning merge. §16 remains the
record of BYOK's close; act on this section for what comes next.

**The planning package exists and is merged; no implementation is authorized by it.**
`ADR-068` ordered Signup Hardening after BYOK's close; BYOK closed on `b007ffa`, so the
initiative is authorized to be *planned*, and it now is. The package:

- `docs/SIGNUP_HARDENING_PRD.md` — 16 `SH-*` families, ~120 requirements, each with slice,
  migration expectation, trust boundary, owner/shared-env flags, evidence class.
- `docs/SIGNUP_HARDENING_IMPLEMENTATION_PLAN.md` — slices SH.0–SH.7, eight-migration budget,
  tiered pre-code gates, the BYOK-OPERATIONS/Phase 2H boundary.
- `docs/reports/SIGNUP_HARDENING_FINDINGS.md` — the four-agent census (the evidence base).
- `docs/reports/SIGNUP_HARDENING_THREAT_MODEL.md` — 35 threats with prevention/detection/test/
  residual.
- `docs/reports/SIGNUP_ROLLOUT_GATE_DEFINITION.md` — the fail-closed public-signup checklist.
- ADR-073…ADR-076 (Proposed).

**What the census changed about the assumed scope** — measured, not inferred:

- Row-level cascade from `auth.users` is **already complete** (41/41 user-owned tables). The
  deletion gaps are **storage objects** (six live orphans from 2026-07-16, no cascade) and the
  **untested** 43 composite `NO ACTION` FKs in a bulk delete's path — not the tables. The
  cascade drill (`SH-DELETE-001`) is the load-bearing all-implementation gate.
- **No account-lifecycle state exists anywhere.** Deletion and suspension share one foundation
  (`account_lifecycle`), enforced in the DB and workers, not React.
- `service_role` still holds platform-default DML on `user_ai_credentials` and
  `credential_validation_attempts` (`SH-EXPOSURE-001` revokes it).
- Retention is absent except BYOK's 30-day prune (`SH-RETENTION`).

**Do not, on resuming:**

- **Do not begin Signup Hardening implementation, Phase 2G, or Phase 2H.** The package
  authorizes none of them. Implementation begins only when the owner approves the package and
  SH.0's pre-code gates pass.
- **Do not open self-service signup or flip `disable_signup`.** It stays `true`; the initiative
  delivers the rollout gate, not the flip (`SH-ROLLOUT-005` is post-initiative, owner-only).
- **Do not use a `2G-` (or any phase) prefix for a Signup Hardening requirement** — it trips
  `ADR-067`'s phase-start guard. The namespace is `SH-*`.
- **Do not absorb the BYOK-OPERATIONS operator surfaces** (dashboard, alerting, credential/
  account-health) into Signup Hardening — they go to a Phase 2H-aligned Operations initiative
  (`ADR-073`, plan §8). Signup Hardening builds the admin *boundary*, not the operations
  tooling.
- **Do not delete the six orphaned storage objects yet** — `SH-DELETE-015`: manifest first,
  then a separate owner-authorized irreversible step.

**Owner actions the plan will need** (tiered, so none blocks unrelated slices): sign the PRD
§20 quota/retention value sheet; verify a restorable production backup; provision disposable
accounts for the deletion/suspension journeys; make the hosted-config readbacks and the CAPTCHA
vendor / SMTP / hosting decisions at their slice's point of use.

**Roadmap, explicit:** Signup Hardening → Phase 2G (Conversational Creation) → Phase 2H
(Deploy and Operate, which absorbs the operator-surface residual) → open self-service signup.
Public signup is a gate proven by a checklist, never a scheduled step.

---

## 18. Signup Hardening — APPROVED and IN IMPLEMENTATION. **This supersedes §17.**

Last updated **2026-08-04**, during SH.0. §17 remains the record of the planning merge;
act on this section.

**The owner approved the planning package in full on 2026-08-04**, and the approval is
recorded append-only: `ADR-077` (the decision record, reproducing the approved quota and
retention values verbatim), PRD Amendment `P-1`, plan Amendment `A-1`, and ADR-073…ADR-076
flipped Proposed → **Accepted** with their proposal history retained on the status lines.
Approved: all five planning documents; the eight-migration budget; the SH.0–SH.7 sequence;
the PRD §20 quota values **as proposed**; the plan §7 retention schedule **as proposed**
(approval ≠ purge authorization — SH-RETENTION-008's dry-run/transcript/owner chain stands);
the ADR-074 deletion executor (self-only, resumable Edge Function); the ADR-075 admin
boundary (operator CLI, no product admin UI, no service-role HTTP endpoint); Cloudflare
Turnstile (ADR-076); the v1 no-malware-scanner posture with compensating controls
(SH-STORAGE-006); the Phase 2H destination for operator dashboard/alerting/health views.
**Public signup stays disabled throughout; opening it is post-initiative, owner-only, gated
by one green fail-closed rollout run.**

### The execution mode this loop is running under

One branch and PR per slice (splits only where the approved plan permits, measured against
the diff); per PR: three jobs green on PR-head, exact merge-SHA CI green, preserved branch,
acceptance report, adversarial review, updated handoff, synchronized clean `main`. The loop
does not pause on a completed slice; it pauses only on the true stop conditions (an
unbudgeted-migration finding from the drill, an owner-only action at its point of use, a
backup requirement before an irreversible step, disposable accounts, CAPTCHA platform
configuration, a boundary that would need weakening, or a PRD/plan/repository
contradiction). Deployment gates SH-GD.1…SH-GD.4 block shared-environment execution only —
never repository implementation.

### SH.0 — CLOSED. PR #73, merge SHA `a05cfb5`, merge-SHA CI run `30905402273` green on
all three jobs; branch `codex/sh-slice-0` preserved. Four PR-head runs: `30903589273`
(drill ok on its FIRST execution — the bulk delete is NOT blocked by the 43 composite
`NO ACTION` FKs; census cut 1 refused), `30904179153` (census cut 2 refused),
`30904706152` (all green), `30905060309` (docs-only, all green). Both census refusals are
recorded in the acceptance report §4.7 — they are a live measurement of the FINDINGS
sec. 12.3 local/hosted privilege divergence, not noise.

### SH.0 — delivered in this slice (branch `codex/sh-slice-0`, 0 migrations)

- **`supabase/tests/signup_hardening_cascade_drill.sql`** — SH-DELETE-001 / gate SH-G0.2.
  Two accounts populated by one populator across every runtime-enumerated user-owned table
  (41 at head `202608010069`); population failures fail by table name; a completeness scan
  fails by name on any enumerated table with zero fixture rows (so a future table joins the
  drill unasked, T-32); `delete from auth.users` executed through the 43 composite
  `NO ACTION` FKs; zero residue schema-wide plus byte-level ciphertext checks; negative
  control requires the bystander to stay **row-complete**. `profiles` and
  `agent_preferences` are seeded by `handle_new_user`, and the completeness scan is what
  proves the trigger did it.
- **`supabase/tests/signup_hardening_grant_census.sql`** — SH-EXPOSURE-002 skeleton / gate
  SH-G0.3. anon zero explicit table/function grants (by name); **the service_role revoke
  carve-out pinned in both directions** — exactly the two RPC-only ledgers carry zero
  service_role grants, measured on explicit-grant presence — plus the ledgers'
  effective-denial pins; forced RLS censused over all user-owned tables; F-18 and F-19
  pinned by name as recorded exposures awaiting SH.6 and SH.1. **A session resuming here
  must know the service_role pin took three cuts:** run `30903589273` refused the
  hosted-posture pin (no local table grants the full four-DML set) and run `30904179153`
  refused the zero-grants over-correction (40 of 42 local tables carry service_role
  grants) — the platform defaults fire in both environments but grant different privilege
  sets, the live form of FINDINGS sec. 12.3. Do not "restore" either earlier cut; the
  per-privilege matrix belongs to SH.6 beside SH-EXPOSURE-001's revoke and its hosted
  readback.
- **Governance:** ADR-077; PRD status + P-1; plan status + A-1; ADR-073…076 status lines;
  STATE.md, TODO.md, CHANGELOG.md, this file; acceptance report
  `docs/reports/SIGNUP_HARDENING_SLICE_00_ACCEPTANCE.md`.

### What the next context must not do

- **Do not treat the drill passing as permission to skip SH.2's stop-on-unknown design** —
  the drill proves the cascade completes today; SH.2 still stops rather than forces on
  anything unclassifiable.
- **Do not delete the six 2026-07-16 orphaned storage objects.** Manifest first (SH.2),
  separate owner authorization after (SH-DELETE-015).
- **Do not run any production purge.** The retention schedule is approved; no purge is
  authorized until SH.6 ships dry-runs and the owner authorizes the first live run.
- **Do not flip `disable_signup`, start Phase 2G/2H, or absorb operator surfaces.**
- **Do not spend a ninth migration or convert a NO ACTION FK silently** — if the drill ever
  reds on a blocked delete, that is a finding and an owner decision (budget amendment), not
  a fix-in-branch.

### SH.1 — built on branch `codex/sh-slice-1` (2 migrations, head -> `202608040071`)

Delivered: `202608040070` (account_lifecycle: table, machine trigger + unconditional
audit, handle_new_user seed + backfill, SH-EXPOSURE-004 revoke with the census F-19 pin
flipped in the same slice) and `202608040071` (the predicate in capture, reprocessing,
all three claim paths — byte-identical, SH-WORKER-003 test over the migration text — and
the heartbeat skip). App side: `requireUser` resolves lifecycle per request and routes
non-active accounts to `/[locale]/account-state` (no product surface, exactly sign-out);
`assertActiveAccount` gates the 19 inline-auth action sites across seven feature
modules; all fail-closed. pgTAP `signup_hardening_account_lifecycle.sql` (28 assertions,
lifecycle-only discriminating fixture). History vocabulary gained
`account_lifecycle_transition`/`account_lifecycle` (the audit trigger is a new SQL
writer); the 2F cleanup partition and SECURITY.md's head line were updated by the same
cause. Acceptance: `docs/reports/SIGNUP_HARDENING_SLICE_01_ACCEPTANCE.md`.

**Deployment-ordering hazard, recorded (the A-1.2 class):** apply `202608040070` and
`202608040071` to the hosted project BEFORE running this slice's app code against it.
Without the table, the fail-closed lifecycle read sends every account — including the
owner — to the account-state surface. Repository and CI are internally consistent; the
hazard exists only at the hosted boundary, behind SH-GD.1 as planned.

### SH.1 — CLOSED. PR #74, merge `3c227f6`, merge-SHA CI `30910079676` green on all
three jobs; PR-head CI `30909345700` green on the first attempt. Branch preserved.

### SH.2 — CLOSED. PR #75, merge `947bb26`, merge-SHA CI `30914160291` green on all
three jobs; branch preserved. PR-head runs: `30912845317` (two pgTAP failures, both
guards catching their own author — recorded in the acceptance §3.8, not squashed),
`30913298153` (all three green, all four Signup Hardening pgTAP suites `ok`),
`30913748841` (docs-only, green).

**THE LOOP STOPS HERE — see §19.**

### SH.2 — built on branch `codex/sh-slice-2` (1 migration, head -> `202608040072`)

Delivered: `202608040072` (`account_deletion_log` de-identified by construction —
the user_id/email/name columns do not exist — forced RLS with NO policy and no
table grants, its DEFINER RPC the only writer; `request_account_deletion()` with
no parameter, running through SH.1's audited machine, idempotent on retry;
`account_owned_row_counts()` enumerating owned tables from the catalog at run
time with `-1` for unscannable). The executor is
`supabase/functions/delete-account/` — `executor.ts` holds the machine and
`index.ts` the entrypoint, because `Deno.serve` binds a port at module scope and
the worker suite runs with no `--allow-*` flags. Self-only by input shape;
seven ordered steps; stop-on-unknown; storage by exact `<uid>/` prefix, verified
empty before the account row is touched. Request surface: provider-validated
re-authentication plus a typed phrase, both server-side, declared codes only.
Scanner reports and cannot destroy. Capability guard classifies all 20
`admin.deleteUser` holders (1 product, 5 e2e teardown, 14 operator scripts),
both directions. Acceptance:
`docs/reports/SIGNUP_HARDENING_SLICE_02_ACCEPTANCE.md`.

**SH.2's true stop condition — the six 2026-07-16 orphaned storage objects.**
`docs/reports/SH_DELETE_015_ORPHAN_MANIFEST.md` carries the read-only procedure
and an explicitly UNFILLED manifest. A session resuming here must not fill it
from belief or from the older records: run the scanner against the deployed
project, record what it actually finds, and then **stop for owner
authorization** — deletion is irreversible, owner-only, and gated on SH-GD.2's
verified restorable backup. A count, date or class that disagrees with the prior
records is itself the finding.

**Deployment ordering, unchanged in kind from SH.1:** `202608040072` must reach
the hosted project before the app code that calls `request_account_deletion`.
Milder failure than SH.1's (a declared error, not a closed product), but stated.

### Next after SH.0 merges green

**SH.1 — account lifecycle foundation**, 2 migrations (`account_lifecycle` + RLS/grants +
`handle_new_user` seed/backfill; lifecycle predicate wired into capture/reprocess, all
three claim paths, and the heartbeat), the app-shell status read, server-side action
refusal, SH-EXPOSURE-004 (`handle_new_user` EXECUTE revoke — the census skeleton's F-19
pin flips in the same slice), SH-WORKER-003 SQL-reachability parity, SH-COPY-001. Both
migrations update `AUTHORIZED_MIGRATION_HEAD` in the same commit and carry the
SH-EXPOSURE-008 DEFINER catalog assertions.

---

## 19. The fourth stop — 2026-08-04, after SH.2. **This supersedes §18's "Next".**

Last updated **2026-08-04**, at the SH.2 merge. §18 remains the record of SH.0–SH.2;
act on this section.

### Where the initiative stands

| Slice | State | Merge | Merge-SHA CI |
| --- | --- | --- | --- |
| **SH.0** — census, drill, gates | **CLOSED** | `a05cfb5` (PR #73) | `30905402273`, all three green |
| **SH.1** — account lifecycle | **CLOSED** | `3c227f6` (PR #74) | `30910079676`, all three green |
| **SH.2** — deletion | **CLOSED** | `947bb26` (PR #75) | `30914160291`, all three green |
| SH.3–SH.7 | not started | — | — |

Migration head **`202608040072`**; three of the eight budgeted migrations spent
(SH.1 two, SH.2 one), each slice moving the head by exactly its allocation.
`main` is clean and synchronized. Branches `codex/sh-slice-0`, `codex/sh-slice-1`,
`codex/sh-slice-2` are preserved.

**The load-bearing gate passed.** SH-DELETE-001's cascade drill executed against a
row-complete account on its very first CI run: the bulk `delete from auth.users` is
**not** blocked by the 43 composite `NO ACTION` foreign keys. The plan's declared
schema-blocker stop condition did not trigger, and no ninth migration was needed.

### Why the loop stops here, and what it is NOT

**This is a true stop condition, not an incomplete slice.** SH.2's repository work is
complete, merged and green. What remains in SH.2 cannot be done by an agent:

**1. SH-DELETE-015 — the six orphaned storage objects. OWNER DECISION.**
`docs/reports/SH_DELETE_015_ORPHAN_MANIFEST.md` holds a **read-only** procedure and a
deliberately **UNFILLED** manifest table. Two steps, in this order:

  a. *Take the manifest* (read-only, no risk, but needs the deployed project and the
     service-role key): `npm run verify:storage:orphans`. Record its output verbatim
     into the manifest table and commit that.
  b. *Then, and only then, decide.* Deleting the objects is **irreversible**,
     **owner-only**, and **gated on SH-GD.2** (a verified restorable backup).

  **Do not fill the manifest from the five older documents.** "Six objects, all
  2026-07-16" is currently inherited belief, not a measurement. A different count, a
  different date, or any object in the `cross-owner` or `unparseable` class **is itself
  the finding** and stops the procedure.

**2. The deployment-tier gates are now genuinely blocking, for the first time.**
SH.0–SH.2 were fully buildable behind them; SH.3 is not. Its acceptance requires
executing suspension and worker enforcement **against the deployment** on disposable
accounts (SH-WORKER-004/005, SH-SUSPEND-002).

| Gate | What the owner does | Blocks |
| --- | --- | --- |
| **SH-GD.1** | read back and record the hosted Auth config (`disable_signup` still `true`, `site_url`, redirect allowlist, `mailer_autoconfirm`, password policy, GoTrue rate limits) | applying any SH migration to the hosted project; SH.5's hosted half |
| **SH-GD.2** | restore the production backup to a disposable project once, record the transcript | **any** destructive step: the six orphans, SH.6's first live purge |
| **SH-GD.3** | provision two disposable accounts (admin-created; signup stays closed) | SH.2's deployed journey, SH.3's suspension journeys |
| **SH-GD.4** | record the hosting/SMTP decision (recorded, not built) | SH.4/SH.5 email journeys |

**3. Deployment ordering, which is an outage risk if reversed.** Migrations
`202608040070`, `202608040071` and `202608040072` must reach the hosted project
**before** the app code of SH.1/SH.2 runs against it. Without `account_lifecycle`, the
fail-closed lifecycle read sends **every** account — including the owner — to the
account-state surface. Repository and CI are internally consistent; the hazard exists
only at the hosted boundary.

### What a resuming context may do without any owner action

**SH.3 can be built and merged behind SH-GD.1/GD.3** — its migration, the admin
transition functions, the operator CLI, the suspended surface, the worker
re-verification, the three-vocabulary distinction, and every CI-provable test. Only its
*deployed* acceptance (SH-WORKER-004/005) waits. Same for SH.4 (fully offline-testable)
and SH.5's application half. If the owner prefers the loop to continue rather than wait,
that is the path — and it is what the plan's gate tiering exists to permit.

### Do not, on resuming

- **Do not delete the six orphaned objects**, or fill their manifest from belief.
- **Do not run any production purge.** The retention schedule is approved; no purge
  exists yet and none is authorized until SH.6 ships dry-runs and the owner authorizes
  the first live run.
- **Do not apply migrations to the hosted project** — that is the owner's step, and it
  is ordered before the app code, not after.
- **Do not flip `disable_signup`**, start Phase 2G/2H, or absorb operator surfaces.
- **Do not spend a ninth migration.** Five remain of the approved eight: SH.3 one,
  SH.4 one, SH.5 one, SH.6 two. A slice needing more stops and asks.

---

## 20. SH.3 and SH.4 — the loop continued rather than idled. **This supersedes §19's "Next" and its "Where the initiative stands".**

2026-08-04. §19 recorded a stop at SH.2 and named, in its own words, what a resuming
context was permitted to do without any owner action: *"SH.3 can be built and merged
behind SH-GD.1/GD.3 … Same for SH.4 … If the owner prefers the loop to continue rather
than wait, that is the path."* The owner chose that path. This section records what it
produced. **Nothing in §19's "Do not, on resuming" list was done** — no orphan deleted,
no manifest filled from belief, no production purge, no migration applied to the hosted
project, no ninth migration spent.

### Where the initiative stands now

| Slice | State | Migrations | Merge | Merge-SHA CI |
| --- | --- | --- | --- | --- |
| SH.0 | CLOSED | 0 | `a05cfb5` | `30905402273` green |
| SH.1 | CLOSED | 2 (`…070`, `…071`) | `3c227f6` | `30910079676` green |
| SH.2 | CLOSED | 1 (`…072`) | `947bb26` | `30914160291` green |
| SH.3 | CLOSED | 1 (`…073`) | `3a0f4f7` | `30936842221` green on all three |
| SH.4 | CLOSED | 1 (`…074`) | `66b2648` | `30941069995` green on all three |

**Migration budget: five of eight spent. Three remain — SH.5 one, SH.6 two.** SH.7 is
allocated zero. No slice has exceeded its allocation and none has asked to.

Migration head: `202608040074`. Public signup: still disabled. Hosted project: still at
`202608010069` — **five SH migrations are unapplied**, and that number is the one to
carry forward.

### SH.3 — suspension and the administrative boundary (branch `codex/sh-slice-3`)

The administrative boundary is `service_role` SQL and an operator CLI (ADR-075): three
DEFINER transition functions with per-verb closed reason sets and the unconditional
audit write, a readback that returns a state and no user content, and
`npm run account:lifecycle` — dry-run by default, pinned in both directions as the only
executable caller (T-10). `defer_job_for_inactive_owner` answers SH-WORKER-001 without
`fail_job`: a job whose owner stopped being active goes back to `pending`, no
`jobs.error`, no extra attempt burned. One shared worker gate wired into both handlers
also closes **SH-WORKER-002**, which SH.2 scoped and did not deliver. Reminders that come
due during a suspension are never delivered retroactively and are never touched
(ADR-078). Evidence: 42 pgTAP, 118 Deno, 37 unit. **Its `database` job was the first in
this initiative to pass on its first run** — the two defects that would have failed it
were caught by reading the BYOK ciphertext constraint and the plpgsql reference instead.

**SH.3's adversarial review found one substantive residual and recorded it with a
destination rather than arguing it down:** the lifecycle predicate covers the paths the
PRD names — capture, reprocessing, the three claim paths, the heartbeat — but **not every
`authenticated`-executable RPC**. Verified, not assumed: only the SH migrations mention
`account_lifecycle`, so `confirm_entry_task_candidates_v6`, `resolve_pending_question_v3`,
`create_task_command`, `apply_reminder_command_v1`, `correct_entry_interpretation` and
`undo_operation` carry none, and a suspended account holding a valid JWT could reach them
through PostgREST. Not fixed inside SH.3's migration because six-plus further
`create or replace`s inside a migration allocated for the admin boundary is exactly the
silent scope growth `ADR-071` exists to stop. **Destination: SH-EXPOSURE-007's re-census
(SH.7) and SH-EXPOSURE-002's matrix (SH.6)**, written into `TODO.md` so the re-census
meets a written expectation instead of discovering it. Partial mitigation, stated as
partial: such an account can neither capture nor have any job executed, so nothing
reachable this way causes AI spend or queued work.

### SH.4 — Terms, Privacy and versioned consent (branch `codex/sh-slice-4`, PR #78, merge `66b2648`)

The slice turns on one decision (ADR-079). `SH-LEGAL-005` requires `authenticated` to
hold a direct INSERT on `policy_acceptances`, so PostgREST is a real door — and a client
able to write `version = '9999-12-31'` would **pre-accept every future policy it has
never been shown**, after which no bump would ever re-interpose it. No Server Action
validation closes that. So the current version is stated in SQL as well as TypeScript,
a `BEFORE INSERT` trigger refuses anything else, the two literal sets are pinned to each
other in both directions, and `record_policy_acceptance` takes **no version parameter at
all**. **Consequence carried forward: bumping a policy version is a migration plus the
constant in the same commit.**

The retention section of the Privacy Policy is **generated** from
`src/features/legal/retention.ts`, and it tells the truth about itself: each class
carries `sweepActive`, the document renders a plain warning while any declared window has
no active sweep, and a test asserts the warning is present *exactly while* one is.
**SH.6 removes that paragraph by flipping the flags, not by remembering to delete it.**

**SH.4 closed two residuals it found rather than routing around them.** SH.2 had shipped
`requestAccountDeletion` with **no UI consumer at all**, so SH-LEGAL-010's decline path
had nowhere to point — the deletion surface is built here over the already-merged action.
And SH.1's account-state surface used `auth-page`, a class present in no stylesheet.

### The owner gates SH.4 creates — values, not blockers

Four legal facts render as **visibly unfilled markers** carrying their own names:
`OPERATOR_ENTITY`, `OPERATOR_CONTACT`, `GOVERNING_LAW`, `JURISDICTION`. A test asserts
each appears in both documents and none has been quietly filled with prose. Supplying
them is an owner action; removing the professional-legal-review banner is a named
rollout gate (SH-LEGAL-013). **Neither blocks any remaining slice.**

### Deployment ordering — now the most severe it has been

Five migrations (`202608040070`–`202608040074`) must reach the hosted project **before**
the app code of SH.1–SH.4 runs against it. The failure modes compound:

- without `account_lifecycle`, the fail-closed lifecycle read sends **every** account to
  the account-state surface;
- without `policy_acceptances`, the fail-closed consent gate interposes **every** account
  and none can reach the product.

Both gates fail closed by design and both are correct to; the hazard is entirely at the
hosted boundary and does not exist in CI, which applies the whole chain from empty.

### Deployment-gated evidence, recorded as NOT EXECUTED with exact blockers

| Requirement | Not executed | Blocker |
| --- | --- | --- |
| SH-WORKER-004 | suspend a disposable account with a queued job, watch the deployed drain skip it across two ticks, reactivate, watch it complete | SH-GD.3 + hosted migration parity |
| SH-WORKER-005 | the heartbeat skip across one hourly tick | same |
| SH-ADMIN-005 | the provider-side sign-in ban and its `banned_until` readback | owner action; exact command and readback in the admin runbook |
| SH-ADMIN-006 | every runbook section's first execution — it is marked **written, not drilled** | same |
| SH-DELETE-012 | the end-to-end deletion journey | SH-GD.2 + SH-GD.3 |
| SH-LEGAL-008/009/010 | the rendered interposition, version-bump and decline journeys on a real account | SH-GD.3 |

### Next

**SH.5 is the next slice, and it is the first one this loop should not simply start.**
Its deployed half depends on decisions the repository cannot make: the CAPTCHA provider
is chosen (Cloudflare Turnstile, ADR-076) but its enforcement is a **hosted setting the
owner enables**, and the hosted readbacks (redirect allowlist, `site_url`,
`mailer_autoconfirm`, password policy, GoTrue rate limits) are SH-GD.1. The plan permits
building the application half first and says so; whoever resumes should confirm that is
still wanted before spending the sixth migration, because SH.5's application half is
large and its acceptance is thin without the hosted half.

### Do not, on resuming — unchanged from §19, plus two

- Everything in §19's list still stands, verbatim.
- **Do not fill the four legal placeholders with plausible values.** A plausible value
  reads as settled and nobody goes looking for it again.
- **Do not remove the retention warning by editing the paragraph.** It is generated; the
  correct way to remove it is SH.6 flipping `sweepActive` per class as each sweep ships.

---

## 21. The fifth stop — 2026-08-04, after SH.4. **This supersedes §20's "Next".**

Four implementation slices are closed and merged with the exact merge-SHA CI green
on all three jobs. `main` is clean and synchronized at `66b2648`. **The loop stops
here for a scope decision, not for a blocker** — and the difference matters,
because everything it is stopping in front of is buildable.

### The state, in one place

| | |
| --- | --- |
| Migration head | `202608040074` |
| Budget | **five of eight spent**; SH.5 one, SH.6 two, SH.7 zero remain |
| Hosted project | still `202608010069` — **five SH migrations unapplied** |
| Public signup | disabled, and untouched by this initiative |
| Working tree | clean; branches `codex/sh-slice-0…4` preserved |
| Destructive actions taken | **none** |

### Why this is a stop, and what kind

**SH.5 is the first slice whose acceptance is mostly not repository work.** Its
requirements split unevenly:

- *The application half* — the app-level signup gate defaulting closed, the
  `signup_disabled` copy, the origin-not-header fix, the resend surface,
  enumeration-uniform responses, `auth_event_attempts` with its throttle claim and
  prune, the CAPTCHA widget wiring, the `safeAuthNext` guard-of-the-guard, the
  session-fixation pins. All buildable and CI-provable today.
- *The hosted half* — CAPTCHA **enforcement** (a GoTrue setting only the owner can
  enable, and the thing that makes SH-CAPTCHA-002's "UI-only bypass is structurally
  impossible" true rather than aspirational), the redirect allowlist and `site_url`
  readbacks, `mailer_autoconfirm`, the password policy, and the GoTrue rate limits
  the application ceilings must sit at or below. All SH-GD.1, all owner actions.

The plan explicitly permits building the application half first. The reason to ask
rather than assume is that **SH.5's application half is large and its acceptance is
thin without the hosted half**: a CAPTCHA widget that passes a token nothing
verifies, and throttle ceilings set below provider limits nobody has read back, are
both merged code whose central claim stays unproven. That is a legitimate way to
spend the sixth migration — it is also the kind of choice that should be made
deliberately rather than by momentum.

### The three things the owner can do, in increasing order of unblocking

1. **Nothing.** Say "keep going" and the loop builds SH.5's application half behind
   SH-GD.1, exactly as it built SH.3 and SH.4 behind SH-GD.1/GD.3, recording the
   hosted half as NOT EXECUTED. This is the smallest possible action and it is a
   legitimate answer.
2. **Apply the migrations.** `202608040070`–`202608040074` to the hosted project,
   **before** any SH.1–SH.4 app code runs against it. This is the single highest-value
   owner action available, because it unblocks *every* deployed acceptance still
   outstanding — SH.2's deletion journey, SH.3's suspension and worker journeys,
   SH.4's consent journeys. See the ordering warning below; it is not optional.
3. **Open SH-GD.1 and SH-GD.3.** Read back and record the hosted Auth configuration,
   and provision two disposable accounts. Together with (2) these turn six recorded
   NOT-EXECUTED rows into executable work.

### The ordering warning, restated because it is now the most severe it has been

Both new gates **fail closed by design, and both are correct to**:

- without `account_lifecycle` (`…070`), the lifecycle read sends **every** account —
  including the owner's — to the account-state surface;
- without `policy_acceptances` (`…074`), the consent gate interposes **every**
  account and none reaches the product.

Apply the migrations **first**, then the app code. CI proves the whole chain from an
empty database on every run; the hazard exists only at the hosted boundary, and only
if the order is reversed.

### What was NOT done, and must stay that way

Everything in §19's "Do not, on resuming" list stands verbatim. Restated because two
slices have passed since it was written:

- The **six orphaned storage objects** are untouched and their manifest is still
  **unfilled**. "Six, all 2026-07-16" remains inherited belief, not a measurement.
  Taking the manifest is read-only (`npm run verify:storage:orphans`) and needs the
  deployed project; deleting anything is irreversible, owner-only and gated on
  SH-GD.2.
- **No production purge exists or is authorized.** The retention schedule is
  approved; SH.6 builds the sweeps with dry-runs first.
- **No migration has been applied to the hosted project by this loop.**
- **No ninth migration was spent**, and no slice asked for one.
- `disable_signup` was never touched; Phase 2G/2H were never started; no operator
  dashboard was absorbed.

### The two open items SH.4 created — both values, neither blocking

- **The four legal placeholders** (`OPERATOR_ENTITY`, `OPERATOR_CONTACT`,
  `GOVERNING_LAW`, `JURISDICTION`) render as visibly unfilled markers. Supplying
  them is an owner action. Removing the professional-legal-review banner is a named
  rollout gate (SH-LEGAL-013), not an edit.
- **The retention warning is load-bearing until SH.6.** The Privacy Policy states the
  declared windows *and* says plainly the sweeps are not running. It is generated —
  SH.6 removes it by flipping `sweepActive` per class in
  `src/features/legal/retention.ts` as each sweep ships, and a test fails if the
  paragraph and the flags ever disagree.

---

## 22. The sixth stop — 2026-08-04, after the deployed acceptance. **This supersedes §21.**

**Merged: PR #80, merge SHA `7767339`, merge-SHA CI run `30948714242` green on all
three jobs** (application; edge worker; database and journey). `main` is
synchronized at `7767339` and the tree is clean.

The owner applied `202608040070`–`202608040074` to the hosted project. That was
option (2) of §21 — the highest-value action available — and it unblocked every
deployed acceptance the initiative had been carrying. All of it has now been
executed. **The loop stops before spending migration `202608040075`.**

### What changed since §21

| | Before | Now |
| --- | --- | --- |
| Hosted head | `202608010069` | **`202608040074`** — parity confirmed row-by-row |
| Deployment-gated rows | 6 NOT EXECUTED | **0** |
| Acceptance journeys | none | **3, re-runnable, in `e2e/`** |
| `delete-account` | not deployed | **v1, ACTIVE** |
| Orphan manifest | unfilled | **taken** — six, all `absent-owner`, no halting class |
| Runbook | written, not drilled | **3 of 4 drilled** |
| Migration budget | 5 of 8 spent | **5 of 8 spent** — the acceptance run spent none |

### The two owner-reported facts that did not verify

Both were reconciled append-only rather than assumed:

- **"Hosted Auth configuration was read back and recorded."** It is not in the
  repository — the tree was clean at `e925ba2`, unchanged since before those
  actions. The public GoTrue settings were therefore re-read here; the
  Management-API-only values were not, and SH-GD.1 stays open for them.
- **"Disposable accounts are available."** There were none. The project held two
  accounts, both predating this initiative, one of them the shared
  `ONLINE_AUTH_TEST_EMAIL` fixture the whole online suite depends on — which must
  **not** be consumed by a deletion journey. SH-GD.3's strategy is
  "admin-created until signup opens", so the journeys now provision and remove
  their own. That is strictly better and needs no owner action again.

### Why this stop is a real blocker, unlike §21's

§21 stopped for a *scope decision*; everything it faced was buildable. This one
is different. The checkpoint conditions spending `202608040075` on reading the
hosted GoTrue rate limits first, and the reason is sound: SH.5's
`auth_event_attempts` throttles exist to sit **at or below** the provider's own
ceilings, and ceilings chosen against unread limits are a number somebody made
up. Spending a migration on that is precisely the silent budget spend the plan
forbids.

Those values live behind the Management API. The CLI's personal access token is
in the **Windows Credential Manager**, not a readable file. Extracting a PAT
from the OS credential vault is not something this loop will do, so this is
owner-only by the checkpoint's own stop list: *"CAPTCHA or hosted configuration
requiring owner-only access."*

The public `GET /auth/v1/settings` endpoint gave what it exposes and no more:
`disable_signup: true`, `mailer_autoconfirm: false`, email the only enabled
provider, `saml_enabled: false`, `anonymous_users: false`.

### The smallest owner action

Read back and record, from the dashboard or the Management API:

- the **GoTrue rate limits** (the one that actually blocks `…075`),
- the redirect allowlist and `site_url`,
- the password policy.

With those recorded, SH.5's database half becomes buildable with honest
ceilings. Its application half — the app-level signup gate defaulting closed,
the `signup_disabled` copy, the origin-not-header fix, the resend surface,
enumeration-uniform responses, the Turnstile token plumbing, the `safeAuthNext`
guard — needs **no migration** and could be built first if the owner prefers;
the plan permits it. That is a legitimate choice and it is the owner's, not
this loop's, because SH.5's acceptance stays thin without the hosted half.

### What the acceptance found that review had not

- **A production defect, fixed.** The consent decline path's deletion link
  pointed at `/{locale}/app/settings` — inside the consent gate being declined.
  Declining looped back to the interposition. SH.4 built
  `/{locale}/account/delete` outside `app/` for exactly that caller and nothing
  pinned the link to it. This is the **second** time this initiative's own
  warning — *"a decline path pointing at a route that does not exist is not a
  path"* — described something that had actually happened.
- **Dead copy.** The deletion receipt (`receiptTitle`/`receiptBody`) never
  renders: the lifecycle gate re-runs on revalidation and interposes the
  `deleting` screen first. Both gates correct. A copy decision for the owner.
- **The suite made its own orphans.** The suspension journey's teardown deleted
  the auth row before the storage — the mechanism behind the historical six —
  and produced two new objects on its first run. Fixed (storage first, the
  executor's ordering), cleaned, re-verified back to exactly six.

### Do not, on resuming

Everything in §19's list still stands, plus:

- **Do not delete the six orphaned objects.** The manifest is now *taken*, which
  makes deletion look like the obvious next step. It is not: it is irreversible,
  owner-only, and gated on SH-GD.2. The owner's backup report is carried as an
  **attestation**, not a measurement — this side could not verify it.
- **Do not spend `202608040075` before the rate limits are read back.** That is
  this stop.
- **Do not consume the `ONLINE_AUTH_TEST_EMAIL` account.** It is the shared
  online fixture, not a disposable.
- **Do not "fix" the unreachable receipt copy by asserting it renders.** It does
  not, and the reason is a gate working correctly.
- **Do not treat the drilled runbook as battle-tested.** Three sections were
  drilled once, by an agent, against an account it created.

### State at this stop

`main` synchronized, tree clean. Hosted: 2 accounts (owner + online fixture),
both `active`; 6 storage objects, the historical orphans, untouched; signup
**disabled** and untouched. Every disposable account created during the run was
removed. Phase 2G/2H not started.

---

## 23. The seventh stop — 2026-08-04, mid-SH.5. **This supersedes §22.**

**Merged: PR #81 (orphan cleanup) at `e9948a7`, and PR #82 (SH.5 application
half) at `6f0909f`, merge-SHA CI run `30953588680` green on all three jobs.**
`main` is synchronized at `6f0909f` and the tree is clean.

One CI failure was diagnosed and fixed rather than worked around, and it taught
something: `[auth.email].enable_signup = false` made the local stack refuse
sign-**in** (`email_provider_disabled`). That key gates the email provider
itself, not just registration through it. The global `[auth].enable_signup` is
the real signup control, and it matches the hosted readback — `external.email`
true, `disable_signup` true.

The owner authorized autonomous completion of Signup Hardening, including
destructive cleanup of proven-disposable data and use of the authenticated CLI
for hosted configuration. Two of those three things were done. The third has a
hard boundary that authorization does not remove, and this section is about
where it is.

### Done under this authorization

- **SH-DELETE-015 is CLOSED.** The six historical orphans were re-verified
  immediately before the act and removed; the scanner reports **zero** objects
  of every class. Both protected accounts verified untouched afterwards. PR #81,
  merge `e9948a7`. The tool (`scripts/sh-delete-015-remove-orphans.mjs`) is
  single-use by construction — re-running it refuses, because the manifest it
  reads now describes objects that do not exist.
- **SH.5's application half.** The app-level signup gate defaulting closed, the
  honest `signup-disabled` copy in both locales, the configured application
  origin replacing request-`Origin` trust, and a `config.toml` that can no
  longer open signup. No migration spent — **five of eight remain.**

### The `config push` footgun, because it is the shape of the blocker

`supabase/config.toml` carried `enable_signup = true` (the CLI template
default). `supabase config push` sends that file **wholesale** to the linked
project. So the standard command for changing any hosted Auth setting would
have **opened public signup** as a side effect of unrelated work. That is now
`false` in both tables with a guard test.

Fixing it does not make `config push` usable, and understanding why is the
whole stop.

### Why hosted configuration cannot proceed, precisely

The owner authorized "the normal authenticated Supabase CLI and Management API
interfaces already available in the environment". Both were examined:

1. **Reading** hosted Auth config (rate limits, redirect allowlist, `site_url`,
   password policy, CAPTCHA state) requires the Management API, which requires a
   personal access token. `SUPABASE_ACCESS_TOKEN` is unset and the CLI keeps its
   token in the **Windows Credential Manager**
   (`LegacyGeneric:target=Supabase CLI:supabase`). Extracting it is explicitly
   forbidden. The public `GET /auth/v1/settings` endpoint exposes only
   `disable_signup`, `mailer_autoconfirm`, enabled providers and `saml_enabled`
   — **not** the rate limits SH.5 needs.
2. **Writing** it has exactly one CLI path: `supabase config push`. The `config`
   command has **one subcommand, `push`** — no `pull`, no `get`, no `--dry-run`
   — verified on both the installed CLI (2.106) and latest (2.111). It is
   all-or-nothing over the whole file, so rate limits cannot be changed without
   simultaneously overwriting `site_url` and `additional_redirect_urls`.
3. **`site_url` cannot be determined from repository truth.** SH-GD.4 (the
   hosting/SMTP decision) is unresolved — there is no deployed application
   origin. The repository's value is `http://127.0.0.1:3000`, a dev value.
   Pushing it would point hosted auth emails at localhost; choosing anything
   else would be **inventing** a production origin, which is precisely what the
   configured-origin work exists to stop.

So: the throttle ceilings cannot be chosen against a hosted limit nobody can
read, and the hosted values cannot be written without collateral damage to
settings whose correct values do not exist yet. Both stop conditions apply —
*"provider configuration cannot be changed through the available authenticated
administrative interface"* and *"the rollout requires real hosting … that does
not yet exist."*

### The smallest owner action, in order of what it unblocks

1. **Make a personal access token available to the environment** — e.g. set
   `SUPABASE_ACCESS_TOKEN` in the shell or CI secret store the loop runs in.
   *Do not paste it into chat; it is never needed as a value here.* This alone
   unblocks every hosted **readback**, which is what gates migration
   `202608040075`.
2. **Decide SH-GD.4** (hosting origin, and SMTP). That is what makes `site_url`
   and the redirect allowlist writable to correct values rather than invented
   ones — and `config push` safe to use at all.
3. **Enable Turnstile** in the hosted GoTrue once (1) and (2) exist. Its secret
   is a hosted setting; the widget and token plumbing can be built before it,
   but SH-CAPTCHA-002's "UI-only bypass is structurally impossible" stays
   aspirational until the provider enforces.

### What is NOT delivered, stated plainly

SH.5 is **partially** delivered. Not built: the database-locked auth throttles
and migration `202608040075`, `auth_event_attempts` and its retention,
genuine-concurrency boundary tests, confirmation resend, enumeration-uniform
outcomes, the Turnstile widget and token plumbing, session-fixation regression
evidence, and the deployed missing-/invalid-token probes. **SH.6 and SH.7 were
not started.** No migration was spent by any of this work.

The throttles were not built ahead of the readback on purpose: their ceilings
must sit at or below the provider's, and shipping numbers chosen against unread
limits — then spending a migration to lock them — is the silent budget spend
the plan forbids and the checkpoint named as a precondition.

### Do not, on resuming

Everything in §22's list still stands, plus:

- **Do not run `supabase config push`** until `site_url` and
  `additional_redirect_urls` in `config.toml` hold the real hosted values. It is
  all-or-nothing. The `enable_signup = false` guard means it can no longer open
  signup, but it will still overwrite the hosted origin with a dev value.
- **Do not set `SIGNUP_ENABLED=true`.** It is one half of a two-control gate;
  opening signup needs both, deliberately, after a green rollout run.
- **Do not invent an `APP_ORIGIN` or a `site_url`.** SH-GD.4 is the input.
- **Do not re-point the orphan-removal tool.** It refuses by design now; making
  it act again means rewriting the manifest, which is a reviewable act.

### State at this stop

`main` synchronized, tree clean. Hosted: 2 accounts (owner + online fixture),
both `active`; **storage empty**; `disable_signup: true` and untouched; parity
`202608040074`. Migration budget: **five of eight spent, none by this work.**

---

## 24. The eighth stop — 2026-08-04, after the hosted readback. **This supersedes §23.**

The owner supplied a Personal Access Token and chose Vercel + the production
origin. That unblocked §23's stop, and the readback immediately found two things
worse than the blocker it replaced.

**Merged: PR #83, merge SHA `09cf1d3`, merge-SHA CI run `30958728180` green on
all three jobs.** `main` synchronized, tree clean.

### The token, verified without being exposed

Present and non-empty in `.env.local` (not the shell environment — worth knowing
when a script expects `process.env`). `.env.local` is gitignored and untracked,
and a scan of **all 1,132 tracked files** found zero containing the value. It is
read as a bearer header only. `scripts/hosted-auth-config.mjs` redacts by field
**name**, so a secret field the provider adds later is redacted by default
rather than by having been listed.

### Two findings, both from probing rather than reading

1. **The production project was pointing auth emails at localhost.**
   `site_url = "http://localhost:3000"` with an **empty** `uri_allow_list`.
   Supabase falls back to `site_url` for every auth redirect and an empty list
   permits only that — so every confirmation and recovery link the deployed
   product could send pointed at the recipient's own machine, and any
   `redirectTo` the app supplied would have been refused.
2. **Password recovery was returning a bare HTTP 500 in production.** §23's own
   work caused it: PR #82's configured origin *throws* when unset, and Vercel
   Production has no `APP_ORIGIN`. Fixed to a declared `auth-misconfigured`
   refusal — **verified live**: the 500 is gone and the honest copy renders.
   The fix makes the failure honest; it does **not** make recovery work.

### What was applied, and why not `config push`

A Management API **PATCH** of two fields, then a re-read of all **242** and a
field-by-field diff: **2 changed, 0 unintended.** `config push` was not used and
should not be — it sends the whole `[auth]` block, and 242 fields returned means
most of what it would set is something `config.toml` never mentions and this
initiative has no opinion about.

The allow list is **generated from `buildAuthCallbackUrl`**, the same function
the Server Actions call, so it cannot disagree with the URLs actually sent. 12
exact URLs, no wildcard, no preview host. localhost enumerated because the
online suite and `npm run dev` serve the app there against this project.

### Provider ceilings — §23's blocker, now answered

| Limit | Value |
| --- | --- |
| `rate_limit_email_sent` | **2 / hour** ← binding |
| `rate_limit_verify` | 30 / 5 min / IP |
| `rate_limit_otp` | 30 / 5 min / IP |
| `rate_limit_token_refresh` | 150 / 5 min / IP |

The email limit is the **default Supabase SMTP** value — it exists *because* no
custom SMTP is configured, and it will change when Resend lands. Any resend
ceiling chosen now must sit at or below 2/hour, and must be revisited when SMTP
changes it. **Migration `202608040075` is still unspent; five of eight remain.**

### What is NOT done

SH.5's remaining repository work: `auth_event_attempts` and migration
`202608040075`, the throttle claim/finalize paths, genuine-concurrency tests,
30-day retention and scheduler-only prune, confirmation resend,
enumeration-uniform responses, session-fixation evidence, Turnstile application
plumbing, and the SH.5 acceptance report. **SH.6 and SH.7 were not started.**

### Owner actions, smallest first

1. **Set `APP_ORIGIN=https://my-brain-dusky.vercel.app` in Vercel Production and
   redeploy.** Password recovery is refusing until this exists. The Vercel CLI
   here is unauthenticated and its login is an interactive OAuth device flow
   this session cannot complete, so the whole Vercel lane — env inventory,
   setting the variable, confirming the deployment reads it — is owner-only.
2. **Configure Resend custom SMTP.** Needs a sending domain, DNS and
   credentials that do not exist. Blocks every email journey *and* the
   behavioural verification of the allow list applied above, which is currently
   correct-by-construction and unverified-by-observation.
3. **Enable Turnstile** in hosted Auth — `security_captcha_enabled` is `false`
   and the provider is still `hcaptcha`.

### Do not, on resuming

Everything in §23's list still stands, plus:

- **Do not run `supabase config push`.** Use `scripts/hosted-auth-config.mjs`,
  which changes only named fields and proves the rest did not move.
- **Do not treat the redirect allow list as verified.** No email has been
  delivered through it. The verification step is written down in the readback
  report; it needs SMTP.
- **Do not soften `resolveConfiguredOrigin` to stop throwing.** The throw is the
  honest signal; the graceful handling belongs at the call site and is already
  there.
- **Do not add a Vercel preview host to the production allow list.** A parity
  test forbids it.

### State at this stop

`main` at `09cf1d3` + the record commit, tree clean. Hosted: parity
`202608040074`; `site_url` is the Vercel origin; 12 enumerated redirect URLs;
`disable_signup: true`; storage empty; 2 accounts, both `active`. Production
deployment healthy, recovery refusing honestly, signup closed on both sides.

---

## 25. The ninth stop — 2026-08-04, after the origin verification and SH.5's migration. **This supersedes §24.**

The owner set `APP_ORIGIN`, redeployed, and reported it. Verifying rather than
accepting that turned out to matter twice, and the migration §24 was waiting on
turned out not to be blocked at all.

`main` was clean at `8ed69ed`; this work is on `codex/sh-slice-5-throttle`.

### The origin, checked where it lands rather than where it was set

All seven points the owner asked about hold. Six were straightforward. The
seventh — *which* origin the deployment actually sends — could not be settled
the obvious way, and the obvious way is the trap:

**A successful recovery does not prove the origin is right.**
`resolveConfiguredOrigin` accepts any https origin **and** accepts localhost,
and localhost is on the redirect allow list for the online suite. So
`recovery-sent` is consistent with `APP_ORIGIN` being wrong.

Vercel's CLI here is unauthenticated (still owner-only), but the provider that
*receives* the value logs it. The Management API's `logs.all` endpoint over
`auth_logs` returned the deployment's own `/recover` calls with
`redirect_to = https://my-brain-dusky.vercel.app/pt-BR/auth/callback?next=%2Fpt-BR%2Fauth%2Freset`
— the value itself, not an inference about it. Note the endpoint defaults to a
very narrow window; pass `iso_timestamp_start`/`iso_timestamp_end` or it returns
almost nothing and looks like an empty result.

### §24's "needs SMTP" was wrong, and the correction is the more useful finding

§24 recorded the allow list as correct-by-construction and unverifiable without
a delivered email. `admin/generate_link` composes the link GoTrue *would* send
**without sending it**, so no sender is required. Run against the online test
fixture account (never the owner's), printing only the resolved `redirect_to`:

| offered | composed |
| --- | --- |
| the production callback | **preserved exactly** |
| `https://attacker.example.com/...` | `https://my-brain-dusky.vercel.app` |
| `https://my-brain-dusky-git-preview.vercel.app/...` | `https://my-brain-dusky.vercel.app` |

**Enforcement is silent rewriting, not refusal.** `POST /auth/v1/recover`
returns **200** for a disallowed `redirect_to`. Two consequences the next
context must carry:

1. `site_url` is the actual backstop — its being the production origin is
   load-bearing, not cosmetic.
2. **A mis-set `APP_ORIGIN` fails invisibly.** Mail still arrives, pointing at
   the wrong host, and nothing in the application can detect it. Re-check at the
   provider after any change to the deployment's environment.

### SMTP and Turnstile — read, not asked

The brief left both as unfilled `[CONFIGURED / NOT CONFIGURED]` placeholders.
The hosted configuration answers both without ambiguity:

- **SMTP: NOT CONFIGURED.** `smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`,
  `smtp_admin_email`, `smtp_sender_name` are **all null**. No verified sending
  domain, because there is no sender. `rate_limit_email_sent = 2/hour` is
  therefore a default-SMTP artefact.
- **Turnstile: NOT CONFIGURED.** `security_captcha_enabled = false`, and
  `security_captcha_provider` is still `hcaptcha` against ADR-076's Turnstile.

### The migration was not blocked, and why that is a structural fact

The instruction was to stop only where `202608040075` would need an unsettled
provider-dependent value. It does not, and the reason is in the pattern the
plan already names: `claim_credential_validation_slot` takes its ceilings as
**function parameters**, and SH-THROTTLE-002 requires them changeable without a
migration. So the migration carries the mechanism and the application carries
the numbers. The pending SMTP ceiling lives in `throttle-policy.ts`, marked
`provisional`, with a test asserting the marker so un-marking it is a reviewable
deletion rather than a quiet edit.

**Migration `202608040075` is spent — six of eight. Two remain, both SH.6's.**

### ADR-080 — the three decisions the plan left open

The plan says "follow `claim_credential_validation_slot`". It cannot be
followed literally: that function's first act is `auth.uid()`, and **every event
this table throttles happens before there is a session.**

1. **`anon` holds `execute`** — the first anonymous `execute` grant in this
   database. The alternative was a service-role client in the Next.js runtime,
   which trades a bounded hash-blinded insert for a credential that bypasses RLS
   on every table, in the most exposed process — and would have made recovery
   depend on a new production secret, the exact failure SH-ORIGIN-001 had just
   finished repairing. What bounds the anonymous path is the **pepper, which is
   not in the database**: a direct caller cannot compute a victim's hash, so
   identifier-stuffing cannot lock anyone out.
2. **Ceilings are required parameters, no defaults**, clamped by
   `private.auth_event_ceiling_cap()`. The argument list is fixed on the first
   attempt deliberately — `create or replace` cannot extend one (ADR-057).
3. **Auth hashes are domain-separated from BYOK's** (`auth:` tag) so the two
   ledgers cannot be joined on the same address.

### A guard that did not hold

Writing SH-SIGNUP-010's guard-of-the-guard found `safeAuthNext` returning
`/en/app/../../evil` verbatim — it passed the `startsWith("/en/app/")` branch,
and a browser resolves it to `/evil`. **Not** an open redirect (it cannot leave
the origin, so T-20 was never reachable this way), but it defeated the subtree
pin the allowlist exists for. Fixed in the guard, with a backslash rejected
alongside it.

### Three pgTAP traps caught statically, since there is no local Docker

- `isnt(claim(...), null)` leaves pgTAP's `anyelement` undecidable — it fails to
  *resolve*, not to assert. Use `ok(... is not null)`.
- An "outside the window" case that shrinks the window to a microsecond proves
  nothing: `now()` is **transaction start time**, so every row the file writes
  shares one `attempted_at`. Backdate the rows instead.
- `has_table_privilege` with the role coming from `unnest` is cast `::name`;
  only the one-variable form is precedented here.

### What is NOT done — SH.5 cannot close

The Server Actions **do not call the throttle**, so SH-THROTTLE-003 and the
enumeration-uniform refusal are not in force. Also missing: the
confirmation-resend surface (SH-SIGNUP-008), Turnstile widget and token plumbing
(SH-CAPTCHA-003/004), session-fixation pins (SH-SIGNUP-012), a regenerated
`database.types.ts` for the two new RPCs, the genuine-concurrency script, and
the SH.5 acceptance report. **SH.6 and SH.7 are not started.**

The wiring must fit the mechanism already shipped: **SH.5 has no migration
left.**

### Do not, on resuming

Everything in §24's list still stands, plus:

- **Do not treat a green recovery as proof of the origin.** It is not; §25's
  first section is why. Read `auth_logs` at the provider.
- **Do not expect a disallowed `redirect_to` to error.** It returns 200 and is
  silently rewritten, so no test may assert enforcement by expecting a failure.
- **Do not un-mark `AUTH_EVENT_CEILINGS.resend.provisional`** until the
  post-SMTP readback has run. Its assertion exists to make that deliberate.
- **Do not add a ceiling above `private.auth_event_ceiling_cap()`** — the RPC
  refuses it at runtime, in the auth path, in production.
- **Do not grant `service_role` on the throttle RPCs.** A postcondition and a
  pgTAP assertion both forbid it; it would be a way to bypass a ceiling.

### State at this stop

Branch `codex/sh-slice-5-throttle`, three commits, tree clean. Lint and
typecheck zero; production build passes; the vitest suite is green except the
**four pre-existing local-only failures** (three `.mjs` shebang import errors
and `sql-reachability`'s two CRLF assertions) which were failing identically
before this work and are green in CI. Hosted: parity `202608040074` —
**`202608040075` is NOT deployed** — `site_url` is the Vercel origin, 12
enumerated redirect URLs, `disable_signup: true`, no custom SMTP, CAPTCHA off,
2 accounts both `active`, storage empty. Production deployment healthy, recovery
working, signup closed on both sides.

### §25 addendum — what CI found that static review did not, and where the branch actually stands

The first CI run **failed the `database` job**, and the shape of the failure is
the useful part: the new suite (`signup_hardening_auth_throttle.sql`, 46
assertions) passed in full, and three **pre-existing** census assertions failed
on the new migration.

| Assertion | Why the migration tripped it |
| --- | --- |
| `BYOK-SCHEMA-013: ip_hash exists on exactly one table` | `auth_event_attempts.ip_hash` is a second one |
| SH.0: `no public function carries an explicit grant to anon` | the two throttle RPCs are the first ever |
| SH.0: `exactly the three RPC-only ledgers carry zero service_role grants` | the new ledger is a fourth |

Each is a declared-set assertion whose own comment requires a new member to
"join the expected list **by name in its own slice**". All three were widened by
name with ADR-080 as the citation — **not loosened**.

The `ip_hash` one had a tempting wrong fix worth naming: rename the column and
the assertion passes untouched. That was refused, because the value *is* an IP
hash and renaming it would slip past a guard whose entire purpose is to notice
this. The defensible answer is on the requirement's own terms — its stated
concern is "a second retention surface and a second thing to forget to prune",
and `auth_event_attempts` is swept on the same 30-day window by its own
scheduler-only function; and Decision 3's `auth:` domain tag means the two
columns are not the same value for the same address, which is what stops the two
ledgers being joinable on one.

**ADR-080 was corrected where it was wrong about timing.** It said the *SH.6*
grant-matrix census "must treat these two functions as a declared exception", as
though the census were a future event. It runs every CI cycle and failed within
minutes. A census that only ran at SH.6 would have let three declared invariants
drift for two slices.

**Second run: all five checks green** — `application`, `database and journey`,
`edge worker`, and both Vercel checks (run `30971441702`).

### Where this actually stops

**PR #84 is open and green at `d9c5ff9`. It is NOT merged** — the merge was
declined by the environment's permission classifier, and no attempt was made to
route around it. `main` is unchanged at `8ed69ed`; the four commits live on
`codex/sh-slice-5-throttle`.

So the next context inherits a branch, not a merged slice. Merge it (or have the
owner merge it) before treating `202608040075` as repository truth, and
**re-check the merge-SHA CI run** as every prior slice in this loop has done.

---

## 26. The tenth stop — 2026-08-05, SH.5's repository work complete. **This supersedes §25.**

PR #84 merged at `34fc621` with its merge-SHA CI green on all three jobs, and
the branch preserved. This section covers what came after.

### The reported state was verified, and one claim was false

Everything the owner reported held **except** the one the whole task depended
on: `202608040075` was on `main` but **not on the hosted project**. Hosted head
was `202608040074` and `claim_auth_event_slot` answered `PGRST202`.

That mattered because Vercel auto-deploys `main` and the throttle **fails
closed** by design. Merging the wiring first would have taken production
authentication down. The migration was applied under explicit owner
authorization, with five pre-flight checks and six post-apply verifications —
`SIGNUP_HARDENING_MIGRATION_075_DEPLOYMENT.md`.

**Hosted head is now `202608040075`.** `db push` changed schema and only
schema: the full Auth configuration was read back before and after and diffed
**byte-identical**, so `disable_signup` and the allow list are provably
untouched. Worth knowing: `db push` is migrations only — `config push` is the
one that would have sent `config.toml` wholesale.

### The verification that could not fail, and had to be redone

The first check that the refused probes wrote no row asked PostgREST as
`service_role` and got `403`. That is *correct* — ADR-080 grants no table
privilege to any role, `service_role` included — but it made the check compare
`"?"` with `"?"` and report a pass. The real count came from the Management API
query endpoint, which runs as `postgres`: **0 rows after four refused probes**.

Keep the instinct: a verification whose failure mode is indistinguishable from
its success mode is not a verification.

### Concurrency: demonstrated, finally

`scripts/sh5-throttle-concurrency.mjs`, against the deployed project as `anon`.

| Ceiling | Simultaneous claims | Admitted |
| --- | --- | --- |
| 3 | 10 | **3** |
| 5 | 20 | **5** |

§25 recorded this as argued-not-demonstrated. It is now demonstrated. A pgTAP
file is one session, and a sequential test passes whether the advisory locks
exist or not — this script is the only thing that can tell the two designs
apart.

### Three decisions inside the wiring

1. **The sign-in ceiling counts attempts, not only failures.** The claim
   reserves *by inserting*, so a ceiling cannot be consulted without recording
   against it, and no client role holds DELETE to withdraw the row after a
   success. Stricter than the `signin_failure` name implies; written at the call
   site so nobody has to rediscover it.
2. **An unreachable throttle refuses.** Failing open would make the control one
   an attacker can switch off by inducing errors, with nothing reporting it.
3. **The Turnstile widget is on the sign-in form**, which SH-CAPTCHA-003 does
   not name. Supabase's CAPTCHA switch is per-project and GoTrue applies it to
   the password grant too — enabling it without a widget there would lock every
   existing account out, the owner's included.

### Three regressions this slice caused, each fixed at the cause

- `actions.ts` now reaches `server-only` transitively through the crypto core,
  which broke `sign-out.test.ts` and `app-shell.test.tsx`. **This repository hit
  that exact trap once before.** Stubbed in the tests with
  `vi.mock("server-only", () => ({}))`; the marker is a build-time guard and
  `npm run build` in CI enforces it, so the source marker stays.
- The resend page pushed the inline locale-ternary count from 266 to 267, a
  guarded ceiling. Fixed the way the guard names — a typed `auth/copy.ts` — not
  by raising the baseline.
- The captcha suite's directory scan needed a real `readdirSync`.

### Where SH.5 stops, and it is one action

**Everything repository-provable is done.** The only thing between SH.5 and its
close is the owner enabling Turnstile:

> Supabase Dashboard → **Authentication → Attack Protection → CAPTCHA
> protection** → enable → **Provider = Turnstile** (currently `hcaptcha`) →
> paste the existing **Secret Key**. The site key is already public in Vercel as
> `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.

Then six deployed probes run: missing token refused, invalid token refused,
valid token reaches the normal path, a raw API call cannot bypass enforcement,
signup still disabled even with a valid CAPTCHA, and recovery/resend still
enumeration-uniform. **SH-CAPTCHA-002 is not claimed until those execute.**

### Not done, named rather than counted

- **SH-SIGNUP-007** hosted password policy — owner dashboard action.
- **SH-SIGNUP-005** confirmation-required's behavioural half — needs SMTP.
- **SH-SIGNUP-011's timing residual — NOT MEASURED.** The requirement says to
  measure it once and record it. It has not been. Carried to the rollout gate.
- Both delivered-link journeys — deployment-blocked on custom SMTP.

### Do not, on resuming

Everything in §25's list still stands, plus:

- **Do not claim SH-CAPTCHA-002 from a green CI run.** CI has no site key, so no
  widget and no token; that is deliberate (SH-CAPTCHA-005) and means CI can
  never evidence the hosted control.
- **Do not remove `AUTH_EVENT_CEILINGS.resend.provisional`** until custom SMTP
  exists and the readback is redone. A test asserts the marker.
- **Do not make the throttle fail open** to fix a transient error. That is the
  one change that would quietly turn this control off.
- **Do not remove `server-only` from the crypto core** to fix a test import.
  Stub it in the test; the marker is what `npm run build` enforces.
- **Do not run `supabase config push`.** Still all-or-nothing. `db push` is
  migrations only and is the safe one.

### State at this stop

Branch `codex/sh-slice-5-wiring`. Lint and typecheck zero, production build
passes, vitest **3852 passing** with the four known pre-existing local-only
failures. Hosted: parity **`202608040075`**, `site_url` the Vercel origin, 12
enumerated redirect URLs, `disable_signup: true`, `security_captcha_enabled:
false`, no custom SMTP, 2 accounts both `active`, ledger empty. Production
deployment healthy; public signup closed at both layers.

---

## 27. The eleventh stop — 2026-08-05, at the Turnstile activation boundary. **This supersedes §26.**

`main` at `9ce5154`. **PR #85** (SH.5 wiring) and **PR #86** (the CSP fix) are
both merged with merge-SHA CI green on all three jobs, branches preserved.
Migration `202608040075` is applied to the hosted project.

**Every repository-provable SH.5 item is done.** What remains is one owner
action and the probes that follow it.

### The deployment probe earned its keep

It found a defect **no test in this repository would have caught**: the CSP
blocked `challenges.cloudflare.com`, so the widget rendered, the site key was
right, the field name was right — and Turnstile never injected its response
input. **No token could exist.**

That failure is invisible while hosted CAPTCHA is off, and switching it on turns
it into *every sign-in refused for a missing token* — locking out every account,
the owner's included.

**The trap inside the fix:** two `Content-Security-Policy` headers on one
response are enforced as an **intersection**. A looser `/auth` policy layered
over the global strict one would have changed nothing while looking exactly like
a fix. The two sources are now mutually exclusive by construction, and
`csp.test.ts` asserts every route matches exactly one — including the direction
nobody checks, where a route matches *neither* and silently loses its CSP.

### What is still unknown, stated as unknown

After the fix the widget **loads, renders and communicates**: `window.turnstile`
defined, `render()` returns a widget id, the response input is injected, ~20
challenge-platform requests return `200`, **zero CSP violations**.

**But no token materialised** in 15–20s, headless or headed, at any size
including the default; and two requests to `brunhild.challenges.cloudflare.com`
failed `ERR_NAME_NOT_RESOLVED` **in this environment**.

That points at automation and local DNS, not misconfiguration — a wrong hostname
or bad site key fires `error-callback` with a code, and none fired. **It is not
proof.** Do not record it as either a pass or a defect.

`data-size="flexible"` was suspected and **cleared by experiment**: the default
size behaves identically, so it is not the differentiator. It was left alone
rather than changed on a hunch.

### The owner action, and the ordering is not optional

**First** — open `https://my-brain-dusky.vercel.app/pt-BR/auth/login` in an
ordinary browser and confirm the widget visibly appears and completes. If it
does not, stop: enabling enforcement would lock every account out, and the
account that would fix it is one of the locked-out ones.

**Then** — Supabase Dashboard → **Authentication → Attack Protection → CAPTCHA
protection** → enable → **Provider: Turnstile** (currently `hcaptcha`) → paste
the existing **Secret Key**. Never paste it into a chat or a commit. The site
key is already public in Vercel as `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.

**Then** — the six probes, none of which have run:

1. missing token is refused;
2. invalid token is refused;
3. valid token reaches the normal auth path;
4. a raw API request cannot bypass provider enforcement;
5. signup stays disabled even with a valid CAPTCHA;
6. recovery and resend stay enumeration-uniform.

**SH-CAPTCHA-002 is not claimed until those execute.** A green CI run can never
evidence it — CI has no site key by design (SH-CAPTCHA-005), so it renders no
widget and sends no token.

### Still not done, named rather than counted

- **SH-SIGNUP-007** hosted password policy — owner dashboard.
- **SH-SIGNUP-005** confirmation-required's behavioural half — needs SMTP.
- **SH-SIGNUP-011's timing residual — NOT MEASURED.**
- Both delivered-link journeys — deployment-blocked on custom SMTP.

### Do not, on resuming

Everything in §26's list still stands, plus:

- **Do not enable hosted CAPTCHA before a human has seen the widget complete.**
  The lockout is total and self-locking.
- **Do not "fix" the missing token by changing `data-size`.** Tested; the
  default behaves identically.
- **Do not add a second CSP header** to loosen something. Headers intersect;
  scope the source instead.
- **Do not treat `ERR_NAME_NOT_RESOLVED` on a Cloudflare challenge host as a
  product defect.** It was observed in this environment only.

### State at this stop

`main` at `9ce5154`, tree clean. Lint and typecheck zero, build passes, vitest
**3859 passing** with the four known pre-existing local-only failures. Hosted:
parity `202608040075`, `disable_signup: true`, `security_captcha_enabled:
false`, provider still `hcaptcha`, no custom SMTP, 2 accounts both `active`.
Production healthy; the auth routes serve the Turnstile-permitting CSP and the
product routes do not. Public signup closed at both layers. No retention purge
has been executed.

### §27 addendum — the open question is closed, and §27's reading of it was wrong

§27 recorded the missing token as "points at automation and local DNS rather
than at a misconfiguration… not proof". A discriminating experiment settled it
the other way, and the correction matters because it changes the owner's next
action from *"look at it"* to *"fix the widget registration"*.

Cloudflare publishes site keys with fixed behaviour for exactly this question.
All three were rendered **on the live page, in one browser session, through the
deployed CSP** — only the key varied:

| Site key | Result |
| --- | --- |
| `1x00000000000000000000AA` (always passes) | **token, 21 chars** |
| `2x00000000000000000000AB` (always blocks) | **`error-callback` `600010`** |
| the configured `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | **timeout, 0 iframes, no callback** |

Two conclusions, the second of which is what makes the first trustworthy:

1. **The environment can complete a Turnstile challenge.** Automation, headless
   Chromium and local DNS are exonerated — §27's reading was wrong.
2. **Error callbacks fire and propagate here.** The real key's silence is not a
   swallowed error; the widget never starts.

**So the configured site key does not render on `my-brain-dusky.vercel.app`.**
The likeliest cause by far is the widget's **hostname allowlist** in Cloudflare:
a Turnstile widget serves only its registered domains, and a key created for a
different hostname behaves exactly like this.

**This is the second defect on this path that is invisible until the switch is
flipped**, and it has the same consequence as the first: with hosted CAPTCHA on
and no obtainable token, every sign-in, signup, recovery and resend is refused —
and the owner account that would turn it back off is one of the locked-out ones.

### The corrected owner sequence

1. **Cloudflare dashboard → Turnstile → this widget.** Confirm **Hostnames**
   contains `my-brain-dusky.vercel.app`; confirm the displayed **site key**
   matches `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. The site key is public. The secret
   key is not needed for this and must not be pasted anywhere.
2. Reload an auth page and confirm the widget **visibly completes**.
3. Only then: Supabase → **Authentication → Attack Protection → CAPTCHA
   protection** → enable → **Provider: Turnstile** → paste the Secret Key.
4. Then the six enforcement probes. **SH-CAPTCHA-002 stays unclaimed until they
   execute.**

### Method note worth keeping

The discriminator — run a known-good and a known-bad control through the *same*
path as the subject, changing one variable — is what turned "no token, cause
unknown" into a named defect in one run. Two earlier attempts at this question
produced only more description. When a probe keeps returning ambiguity, add a
control rather than more instrumentation.
