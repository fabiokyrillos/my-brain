# Autonomous loop — durable handoff

**Purpose.** This file is the loop's continuity artifact. It records exactly where the
authorized roadmap stands so a fresh context can resume without re-deriving anything.
**Update it at every merge boundary.**

Last updated: **2026-08-01**, at the EGC.3 boundary.

---

## 1. Position in the roadmap

| # | Initiative | State |
| --- | --- | --- |
| 1 | **Entity Graph Completion** | **COMPLETE** (EGC.1, EGC.2 merged green; EGC.3 in PR #55) |
| 2 | **BYOK** | **NOT STARTED** — pre-code gates partially blocked, see §4 |
| 3 | Signup Hardening | not started |
| 4 | Phase 2G — Conversational Creation | not started, unauthorized until 1–3 close |
| 5 | Phase 2H — Deploy and Operate | not started |
| 6 | Open self-service signup | blocked on all of the above |

---

## 2. Repository truth

- **Main HEAD at last sync:** `8305424` (EGC.2 merge).
- **Branches, all preserved:** `codex/docs-and-gates`, `codex/egc-slice-1`,
  `codex/egc-slice-2`, `codex/egc-slice-3`.
- **Migration parity: `202607310064`**, local and remote, unchanged since Slice G5.
  Entity Graph Completion added **zero** migrations across all three slices.
- **Hosted signup: DISABLED and verified** (gate G-0.5).
  Evidence: `docs/reports/G05_HOSTED_SIGNUP_CLOSURE_EVIDENCE.md`.

### Merged this loop

| Slice | PR | Merge SHA | Merge-SHA CI run | Result |
| --- | --- | --- | --- | --- |
| EGC.1 | #53 | `840da99` | `30672108083` | green, all three jobs |
| EGC.2 | #54 | `8305424` | `30677225551` | green, all three jobs |
| EGC.3 | #55 | pending | pending | pending |

---

## 3. Test and gate state

- **Lint 0, typecheck 0, build exit 0.**
- **Vitest: 3342 passed, 2 failed.**
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

## 4. BYOK — what blocks the start, precisely

Governing artifacts exist and are approved: `docs/BYOK_PRD.md`,
`docs/BYOK_IMPLEMENTATION_PLAN.md`, `docs/reports/BYOK_SECURITY_DEFINITION.md`.

The plan declares **five pre-code gates** and the rule that no slice may start until every
artifact is in the repository. Their status:

| Gate | Can this loop satisfy it? |
| --- | --- |
| **G-0.1** — provider call-site census, re-measured against `main` | **Yes.** Pure measurement |
| **G-0.2** — crypto interop proof, Node ↔ Deno, identical AAD | **Yes.** Executable locally and in CI |
| **G-0.3** — master-key procedure **and four keys provisioned** (production, preview, test, local) | **Partly.** The written procedure and the `local`/`test` keys, yes. **Production and preview require the hosting platform's secret store**, which is an administrative control this loop cannot reach without extracting or exposing credentials |
| **G-0.4** — a dedicated low-limit OpenAI key for the validation lane, with a spend limit | **No.** Requires OpenAI dashboard access **and a spend decision** — a paid external vendor commitment |
| **G-0.5** — hosted signup closed | **Already satisfied and verified** |

### The honest reading

**G-0.4 is a genuine stop condition** as the loop defines one: *"paid external vendor
commitment requiring the owner to choose a vendor or price"* and *"inability to access a
required administrative control without extracting or exposing credentials."*

**It does not block everything.** G-0.4 exists for the opt-in validation lane, which is
**BYOK.3**'s concern. BYOK.1 (credential store and crypto core) and BYOK.2 (resolvers)
depend on none of it: they are schema, crypto and RPC work, testable against local and
test master keys this loop can generate.

**Recommended continuation**, in this order:

1. Execute **G-0.1** and **G-0.2** in full and commit them.
2. Write the **G-0.3** procedure; generate and place the `local` and `test` master keys
   and fingerprint peppers in untracked env files; record production and preview as
   **owner actions**, with the exact variable names and the procedure to follow.
3. Execute **BYOK.1** and **BYOK.2** as normal slices, each with its own branch, PR,
   merge-SHA CI and acceptance report.
4. **Stop before BYOK.3's validation lane** and ask the owner for: the production and
   preview master keys / peppers to be provisioned, and the decision on the validation
   key and its spend limit. Everything else in BYOK.3 (Settings surface, Node adapter,
   fallback removal) can be built with validation disabled behind its absent key,
   provided the acceptance report says plainly that the lane is unexercised.

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
