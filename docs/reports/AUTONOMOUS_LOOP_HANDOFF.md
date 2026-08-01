# Autonomous loop — durable handoff

**Purpose.** This file is the loop's continuity artifact. It records exactly where the
authorized roadmap stands so a fresh context can resume without re-deriving anything.
**Update it at every merge boundary.**

Last updated: **2026-08-01**, at the **BYOK.3 close**. G-0.4 is satisfied, its live lane
has been **executed**, and the project-key fallback is **deleted**. BYOK.4 is next.

---

## 1. Position in the roadmap

| # | Initiative | State |
| --- | --- | --- |
| 1 | **Entity Graph Completion** | **CLOSED.** All three slices merged, all three merge-SHA CI runs green |
| 2 | **BYOK** | **BYOK.1, BYOK.2 and BYOK.3 CLOSED**, all merged with green merge-SHA CI. The project-key fallback is **deleted** and Settings shipped with it. G-0.4's live lane was **executed**. **BYOK.4 is next**; three acceptance items await the first deployment. See §9 |
| 3 | Signup Hardening | not started |
| 4 | Phase 2G — Conversational Creation | not started, unauthorized until 1–3 close |
| 5 | Phase 2H — Deploy and Operate | not started |
| 6 | Open self-service signup | blocked on all of the above |

---

## 2. Repository truth

- **Branches, all preserved:** `codex/docs-and-gates`, `codex/egc-slice-1`,
  `codex/egc-slice-2`, `codex/egc-slice-3`, `codex/byok-precode`, `codex/byok-slice-1`,
  `codex/byok-slice-2`, `codex/byok-handoff`, `codex/byok-gate-amendment-2`,
  `codex/byok-slice-3`.
- **Migration chain head: `202608010067`.** Entity Graph Completion added **zero**
  migrations across all three slices; BYOK.1, BYOK.2 and BYOK.3 added one each, each moving
  the head by exactly its budgeted allocation. The budget is **five** since `ADR-070`.
- **None of the three BYOK migrations has been applied to a shared environment.** All three
  are validated on every CI run by `supabase db reset` from empty. The last verified
  local/remote parity is the version Slice G5 closed on. **This is what blocks the three
  deferred acceptance items** — see §9.
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
