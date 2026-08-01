# Autonomous loop — durable handoff

**Purpose.** This file is the loop's continuity artifact. It records exactly where the
authorized roadmap stands so a fresh context can resume without re-deriving anything.
**Update it at every merge boundary.**

Last updated: **2026-08-01**, at the **BYOK.2 boundary — the loop's required stop**.

---

## 1. Position in the roadmap

| # | Initiative | State |
| --- | --- | --- |
| 1 | **Entity Graph Completion** | **CLOSED.** All three slices merged, all three merge-SHA CI runs green |
| 2 | **BYOK** | **BYOK.1 and BYOK.2 CLOSED, both merged with green merge-SHA CI. STOPPED before BYOK.3** — G-0.4 is unprovisioned and `ADR-069` makes it gate BYOK.3's acceptance and merge. See §4 and §7 |
| 3 | Signup Hardening | not started |
| 4 | Phase 2G — Conversational Creation | not started, unauthorized until 1–3 close |
| 5 | Phase 2H — Deploy and Operate | not started |
| 6 | Open self-service signup | blocked on all of the above |

---

## 2. Repository truth

- **Branches, all preserved:** `codex/docs-and-gates`, `codex/egc-slice-1`,
  `codex/egc-slice-2`, `codex/egc-slice-3`, `codex/byok-precode`, `codex/byok-slice-1`,
  `codex/byok-slice-2`.
- **Migration chain head: `202608010066`.** Entity Graph Completion added **zero**
  migrations across all three slices; BYOK.1 and BYOK.2 added one each, each moving the
  head by exactly its budgeted allocation.
- **Neither BYOK migration has been applied to a shared environment.** Both are validated
  on every CI run by `supabase db reset` from empty. The last verified local/remote parity
  is the version Slice G5 closed on.
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

---

## 3. Test and gate state

- **Lint 0, typecheck 0, build exit 0.**
- **Vitest: 3411 passed, 2 failed.**
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

## 4. BYOK — gate status, and the one thing still blocking

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
| **G-0.3** — `local` / `test` provisioning | **DONE and verified**, authorized by the owner as `BYOK-GATE-DEC-2`. 4/4 present, valid base64, 32 bytes; 6/6 pairs distinct; 994 tracked files scanned against 20 needle forms, **0 matches**. Evidence: `BYOK_G03_MASTER_KEY_PROCEDURE.md` §7 |
| **G-0.3** — `preview` / `production` provisioning | **DEFERRED to point of use** (Amendment A-1.2). Gates *deployment*, not BYOK.1 or BYOK.2. **Owner action** when it arrives |
| **G-0.4** — dedicated low-limit OpenAI validation key | **NOT PROVISIONED. Still a stop condition.** Gates BYOK.3's validation lane **and BYOK.3's acceptance and merge**. Constraints: Amendment A-1.3 |
| **G-0.5** — hosted signup closed | **Satisfied and verified** |

### What is authorized, and where the loop stopped

**BYOK.1 and BYOK.2 were authorized, and both are CLOSED** — merged, with green merge-SHA
CI on all three jobs. They depended on nothing G-0.4 provides: schema, crypto and RPC work,
tested against ephemeral keys.

**The loop has stopped before BYOK.3.** G-0.4 is unprovisioned, and `ADR-069` makes it gate
BYOK.3's **acceptance and merge**, not merely its lane — so BYOK.3 cannot be built with the
lane disabled and reported as passing. The lane is not weakened, not bypassed, and not
marked complete. The smallest owner action needed is §7.

**Two decisions are waiting, and BYOK.3 needs both:**

1. **G-0.4** — the validation key. §7 has the exact steps.
2. **The per-IP throttle conflict** — `BYOK-SCHEMA-007` fixes
   `credential_validation_attempts` at `(user_id, attempted_at, outcome)`, plan task 3.8
   requires a throttle "per user **and per IP**" over that table, and BYOK.3's migration
   budget is **zero**. All three cannot hold. BYOK.1 implemented SCHEMA-007 exactly and
   invented no column, because expanding a governing document's schema inside a branch is
   the move `ADR-069` exists because the *owner* is entitled to make. Three options with
   their trade-offs: `BYOK_SLICE_01_ACCEPTANCE.md` §5.

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

**Until step 5 is done, BYOK.3 does not start.** The lane is not built-and-disabled and it
is not reported as passing; the slice waits.

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
