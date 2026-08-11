# Phase 2K — Slice 2K.8 acceptance

**Accessibility, mobile, content-free telemetry, security and closeout.**

**Written after execution, from executed evidence.** Every gate is reported as executed, skipped or **NOT PROVED** — never inferred.

**Authorization.** ADR-101, which authorizes creating, merging and **deploying** the single migration OD-2K-C budgeted.

**Baseline.** `main` = `9c36e1be352421e05cb9b384424b457c58100efb` (PR #152, slice 2K.6), **CI green on that exact merge SHA across all three jobs**.

**Migration budget.** **`1 allocated · 1 spent`** — `202608090088_phase_2k_conversation_telemetry.sql`. The ceiling was never an obligation and `1 · 0` would have been a legitimate close; it is spent because telemetry cannot be delivered honestly without a database that names the events.

---

## 1. A correction this slice found, and is reporting rather than absorbing

**The Phase 2K PRD declares 79 requirements, not 68.**

ADR-097, ADR-098, `docs/STATE.md`, `docs/reports/README.md` and the PRD's own §4 preamble all say "68 requirements across eleven families". The traceability generator extracts them from the PRD and counts **79**, across the same eleven families:

`2K-ACT` 9 · `2K-CARD` 9 · `2K-CONT` 8 · `2K-METRICS` 8 · `2K-SRC` 8 · `2K-A11Y` 7 · `2K-EXPL` 7 · `2K-AUDIT` 6 · `2K-CLOSE` 6 · `2K-PRIVACY` 6 · `2K-SUGG` 5.

No requirement is duplicated and none is outside the `2K-` namespace, so this is a **counting error in the authorizing documents**, not a scope change. It was repeated in five places, which is exactly the failure mode the traceability contract was written against: *"if a single table produced the PRD, the plan and the matrix, one wrong premise would propagate into all three and appear confirmed three times."*

**It is corrected by appending, never by rewriting.** ADR-097 and ADR-098 are accepted and append-only; the correction is recorded here, in the closing report, in `CHANGELOG.md` and in `STATE.md`. **All 79 are classified.** Classifying 68 and calling it complete would have been the more comfortable option and the wrong one.

---

## 2. Requirements this slice claims

| Id | Claim | Evidence |
|---|---|---|
| `2K-A11Y-001` | **built** | Conversar's card states, controls, resumption, sources, explanation and suggestions all joined `e2e/accessibility.spec.ts`'s `SURFACES` **as each slice landed**, never at closeout — six fixtures added across 2K.1–2K.6, each pinned to its component by `accessibility-mirror-guard.test.ts`. Supersedes 2K.1's `partial`, which was true of 2K.1 |
| `2K-A11Y-002` | **built** | `2J-ACCESS-001` runs axe over every Conversar surface at desktop **and** Pixel 7. Zero serious or critical violations |
| `2K-A11Y-003` | **built** | `2J-ACCESS-006` measures rendered target size from paint at Pixel 7. Every new control carries a 44px minimum — above WCAG 2.2 AA 2.5.8's 24px — and the check is what caught a real 16px defect the first time this lane ran |
| `2K-A11Y-004` | **built** | `2J-ACCESS-005` measures focus from computed style, asserting the union of outline, box-shadow and border so a design that uses either passes and one that paints nothing fails |
| `2K-A11Y-005` | **baseline, preserved** | The composer's single polite live region is untouched, and `TaskCommandResult` still renders `silent` so a turn cannot be announced twice. No slice added a second region |
| `2K-A11Y-006` | **built** | Exactly one focus move per resolved turn. The resumption is the only thing on the thread that moves focus, and it fires once on arrival; the composer's own effect fires only on an action round |
| `2K-A11Y-007` | **partial** | Thumb reach, no hover dependency and both locales are proved at Pixel 7 width in a real browser; `isComposing` on Enter is preserved and untouched. **Remainder:** no real-device session — an emulated Pixel 7 is not a phone. **Destination:** carried past close as a named residual, with the same standing as G-2J.4b |
| `2K-METRICS-001` | **built** | Three event names and the `conversation` surface are declared in `product-analytics/contracts.ts` and **derived** from it everywhere else. The migration was *assembled* from `202608080086`'s own text rather than retyped |
| `2K-METRICS-002` | **built** | Every property is a closed enum or a boolean. The guard walks each declared shape and fails anything that is neither, and asserts no content-shaped **key** on any Phase 2K arm |
| `2K-METRICS-003` | **built, vacuously — and it says so** | Phase 2K declares **no duration at all**, so there is nothing to bucket. Asserted as an absence rather than claimed as a bucketing mechanism this phase never built |
| `2K-METRICS-004` | **built** | **Closed by the post-phase correction `202608090089`, not by slice 2K.8, and the history is kept rather than smoothed.** At closeout this was **partial**: both gates the previous defect taught this repository to watch were widened together, with a name-by-name agreement block that refuses to run vacuously — and **a THIRD existed that the deployment probe found**, a hardcoded SURFACE allowlist inside `private.record_product_event`, in the same function `202608080087` edited, without `conversation`. A **second** gate was undersized too: `product_events_surface_check` on the table itself, which the writer's copy refused first and so masked. The correction **deletes the writer's copy** rather than adding `conversation` to it (owner decision), widens the table CHECK, and preserves the `22023 Unsupported product surface` contract by translating the check violation through `GET STACKED DIAGNOSTICS` — **no second list in any format**. There is now exactly **one** surface vocabulary, asserted from the catalog |
| `2K-METRICS-005` | **built** | `post_2j_product_event_write_path.sql` **extended, never duplicated**: three legal payloads added, and the suite's existing set-difference assertions in both directions make an omission fail rather than pass quietly. One added assertion names the three explicitly |
| `2K-METRICS-006` | **built** | Negative controls: an undeclared event name and an undeclared property are each refused with `22023`. Non-vacuity: accepted events must return a non-null id, and the historical-gate probe asserts it refuses exactly **seven** — the number that rose from four when this phase added three |
| `2K-METRICS-007` | **partial** | **Reclassified downward on 2026-08-11, from `built`, and the superseded claim is kept in full rather than deleted.** What was written at close, and still stands: *"Phase 2K reached closeout with this INERT on the deployed project, and that is recorded, not erased. The consumer existed, RLS-scoped, authenticating as the owner, writing nothing, and distinguishing 'not deployed yet' from 'a quiet week' — but every event was refused `22023 Unsupported product surface`, inside producers that swallow the failure. Closed after `202608090089` by a hosted producer→consumer proof, 13/13: three Phase 2K events written through the authenticated `public.record_product_event` (owner from `auth.uid()`, never an argument) by a disposable account, read back under that account's own RLS session, and fed to the real `aggregateConversationFunnel`, which reported answers 2 / memories 1 / suggestions 1 with 0 unrecognised. An event outside the consumer's set was ignored by the funnel."* **What is now known, and was not knowable from that record:** the declared consumer `scripts/phase-2k-conversation-funnel-reader.mjs` **could not have executed** on the day it was claimed — it selected, filtered and ordered by `product_events.occurred_at`, a column the ledger has never had (`202607170024:51` declares `created_at` and nothing else), and it authenticated with `grant_type=password`, which hosted Turnstile has refused since SH.5. The 13/13 proof reached the aggregation through a query written for the occasion, which is exactly why the broken reader stayed invisible. **Remainder:** one execution of the repaired reader against the deployed project, on a real owner session. **Destination:** carried past this phase's close as a post-phase obligation in `docs/TODO.md`; the repair itself was made during Phase 2M (PR #169, merge `611dd01`) and is charged to no phase. See the second post-phase correction at the end of this file |
| `2K-METRICS-008` | **built** | At closeout this was proved **by construction and for the wrong reason** — every write was refused by the surface gate, so no row could exist. That is a true statement about residue and a worthless one about the probe. **Re-proved after `202608090089` with writes that actually succeeded**: the disposable account owned five rows, the account was deleted, and **the same authenticated read replayed to zero** (`product_events.user_id references auth.users(id) on delete cascade`). A **global** ledger count is deliberately impossible — `service_role` holds no `SELECT` on this table — so the residue claim is owner-scoped, which is the stronger of the two |
| `2K-CLOSE-001` | **built** | All **79** declared requirements classified exactly once, by a generator that refuses to emit anything otherwise |
| `2K-CLOSE-002` | **built** | Every `partial` names its remainder and destination, enforced by the generator rather than by review |
| `2K-CLOSE-003` | **built** | Budget reconciled per slice: 2K.0–2K.6 spent nothing, 2K.8 spent one. `1 allocated · 1 spent` |
| `2K-CLOSE-004` | **built** | ADR-055's status restated: retired unmet by ADR-099, expiry `2026-10-27` **not yet reached** at close, no renewal date written, and the retrieval that ships today untouched |
| `2K-CLOSE-005` | **built** | Real-device, assistive-technology, provider and hosted checks are each labelled executed, skipped or **NOT PROVED** in §5, and the screen-reader session is reported as an evidenced negative rather than inferred from an axe pass |
| `2K-CLOSE-006` | **built** | The signup rollout gate is restated as untouched at 25 pass · 3 fail · 2 owner-signature, and Phase 2K is explicitly **not** progress toward it |

---

## 3. The telemetry, and the three decisions inside it

**Three events, and the count is the point.** `2K-METRICS-007` requires a **consumer** before close, because SH.6 shipped a producer with none and its quota refusals recorded nothing for weeks while the code read as though they did. These three are exactly what `phase-2k-conversation-funnel-reader.mjs` asks questions of. A fourth name nothing reads would be SH.6's failure wearing a different label.

**The migration was assembled, not retyped.** The validator is ~280 lines and must be re-declared whole, because Postgres cannot extend a `case` arm in place. A hand-copy is how a pre-existing arm gets silently dropped — which is a defect that deploys clean and then refuses at runtime, inside a path that swallows the error. So the file was generated from `202608080086`'s own text, with the three arms inserted and every pre-existing name asserted present.

**The verification block that did not exist before.** `202608080087` had to delete a third vocabulary copy that had been silently rejecting `rate_limit_refused` since `202608070081`. This migration's final block extracts every name from the CHECK and asserts the validator knows each one — **name by name**, and refusing to run if the extraction returns fewer than 30. That is the check which would have caught that defect a phase earlier.

---

## 4. Five pins moved, because a migration moved the chain

Adding a migration is supposed to be noticed. Five guards noticed, and each was updated in the same commit, which is the documented protocol rather than an inconvenience:

- `egc-invariants.test.ts`'s authorized chain head, whose own comment says the pin is moved by the slice that adds a migration, deliberately and visibly.
- `post-2h-retention-correction.test.ts`'s successor list — *"nothing follows that somebody did not deliberately account for."*
- `telemetry-parity.test.ts`'s `MIGRATION` pin, which must read the newest declaration or it reports a name "dropped" that was simply added later.
- `docs/DATABASE.md`'s allowlist count, 30 → 33, whose own parenthetical predicted this: the guard extracts the list from the chain so the next widening fails the build rather than letting the text age.
- `docs/SECURITY.md`'s chain head.

---

## 5. Gates, as executed

| Gate | Result |
|---|---|
| Lint / typecheck | **Executed, zero errors** |
| Full unit | **Executed** — 4898 tests passed, 0 failing tests. 3 files fail to *load* on Windows (the known local baseline, green in CI) |
| Build | **Executed, green** |
| Browser, both viewports | **Executed** — every Conversar surface scanned by axe at desktop and Pixel 7; targets and focus measured from paint |
| pgTAP | **Written and extended; executed in CI only** — no local Docker on this machine |
| Traceability generator | **Executed.** It refused four times before it emitted, on real findings |
| `git diff --check` | **Executed, clean** |
| Migration | **One, created.** Applied to the deployed project — see the deployment record |
| **Screen-reader session** | **NOT PROVED.** Never executed for this surface. An axe pass is not one, and this record does not treat it as one |
| **Real-device mobile** | **NOT PROVED.** An emulated Pixel 7 is not a phone |
| **Hydrated interactivity in a browser** | **NOT PROVED.** Proved in jsdom; the markup is proved in a browser; the two together are not the third thing |
| **Zero-source provider prose** | **NOT PROVED.** Needs a real OpenAI call; ADR-101 does not authorize spending the owner's credential, and no slice did so silently |
| **Authenticated online journeys** | **NOT EXECUTED.** The `online-*` lane needs live credentials and is manual |

---

## 6. Security posture at close

- **No new RLS policy, grant, secret, external service or second write path** across the whole phase.
- **No service-role client** on any product path. The consumer authenticates as the owner and RLS does the bounding — a measurement path that could read across owners is one that has to be trusted rather than bounded.
- **The continuity payload is incapable of authorizing**, proved against a planted instance of each of twelve forbidden fields, and R17 is asserted by the generator itself.
- **Retrieved content cannot produce a mutation.** The answer schema still declares exactly two fields.
- **No existence oracle.** `unavailableCard` takes no cause parameter; the explanation payload carries no count, rate or sensitivity fact.
- **Signup remains closed.** The rollout gate reads **25 pass · 3 fail · 2 owner-signature** and is untouched. Phase 2K is **not** progress toward it.

---

## 7. What remains open at close

1. **`2K-METRICS-007` and `2K-METRICS-008` were partial until the deployment probe ran.** Their remainder was named and their destination was the deployment record. **The probe then found the defect that made the whole telemetry inert** — see the post-phase correction section at the end of this file. Both are now closed against a hosted proof, and the partial state is left on the record rather than back-dated away.
2. **No screen-reader session, and no real-device mobile session.**
3. **The zero-source provider prose**, narrowed by 2K.4 to what the provider *says* rather than whether the product *tells the user*.
4. **Historical citation excerpts** remain the named residual OD-2K-2 declared — contained by a renderer that never reads one.
5. **Relation references are not editable from a card**, and **interpretation correction has no domain effect**. Both declared, both with destinations.

---

## Post-phase correction — migration `202608090089` (appended 2026-08-09)

**Phase 2K reached closeout with its telemetry inert on the deployed project. That is the first fact of this section, and it is not softened anywhere in it.**

The deployment of `202608090088` succeeded and hosted parity was clean. The probe that ran immediately afterwards found that not one Phase 2K event could be written: `private.record_product_event` carried a **hardcoded surface allowlist** without `conversation`, so every event was refused `22023 Unsupported product surface` — inside producers that `.catch(() => {})`, which is why nothing was visible from the product side. This is `202608080087`'s defect **one field over**: that migration deleted the *event-name* copy from the same function and left the *surface* copy standing, describing it as a non-vocabulary guard.

**A second gate was undersized as well.** `product_events_surface_check`, on the table, also stopped at `task_command`; `202608090088` widened the event-name CHECK and the property validator but not that one. The writer's copy refused first and **masked** it. Both were fixed together, because fixing only the writer would have moved the refusal rather than removed it.

**The owner chose deletion over addition**, and authorized **one extraordinary corrective migration outside Phase 2K's budget**. That budget is unchanged and is not retroactively reclassified: Phase 2K's authorized implementation remains **`1 allocated · 1 spent`**. `202608090089` is charged to **no phase** — in particular not to the roadmap successor, which has not started.

- The writer's list is **deleted**, not extended. No equivalent list was introduced in any other format; the invariant is asserted from the catalog, against whatever is installed.
- The `22023 Unsupported product surface` contract is **preserved** by translating the CHECK violation through `GET STACKED DIAGNOSTICS`, so no caller can tell the refusal moved.
- Surface is now validated **after** the event name. That ordering change is an improvement rather than a cost: surface-first ordering is precisely what made this phase's own negative controls vacuous — they were refused before the dimension under test could answer.
- `security definer`, `set search_path = ''`, ownership and subject assertions, idempotency, return shape, grants and revokes are unchanged. **No RLS change, no policy change, no new grant, no product-code change.**

**The permanent regression was extended, never duplicated and never weakened.** `post_2j_product_event_write_path.sql` goes from **20 to 29** assertions with a surface dimension derived from the CHECK at test time — a list restated there would be the third copy this correction exists to delete. It proves every declared surface is writable through the real writer, that `conversation` is accepted, that all three Phase 2K events are writable **on** that surface, that an undeclared surface is still refused with the same errcode **and** message, and that the writer names no declared surface. It is non-vacuous by assertion: fewer than ten extracted surfaces fails, and the **historical gate is planted** to prove the refusal returns and **restored** to prove it disappears.

**Hosted proof, after deployment: 13/13.** A disposable account, created through the admin API — signup was never opened, no BYOK credential was used, and no provider was called. Events were written through the **authenticated** `public.record_product_event`, the path the browser producers actually reach, so the owner comes from `auth.uid()` and not from an argument.

| Proof | Result |
| --- | --- |
| Three Phase 2K events on the `conversation` surface | accepted, event ids returned |
| Undeclared surface | refused `22023 Unsupported product surface` |
| Undeclared event, **on a valid surface** | refused `22023 Unsupported product event` |
| A person's name in the payload | refused `22023 Unsupported product event property` |
| Idempotency replay | same id, `recorded` true then false |
| Owner reads its own events under **RLS** | 4 rows |
| Real `aggregateConversationFunnel` | answers 2 / memories 1 / suggestions 1, **0 unrecognised** |
| An event outside the consumer's set | ignored by the funnel |
| Zero residue | 5 owned rows before the account delete, **0 after the same read replayed** |

The negative controls are non-vacuous on purpose: the undeclared **event** and the forbidden **property** are both exercised on a **valid** surface, so the surface gate cannot be what answers.

**Still not proved, and still not inferred:** screen reader; real-device mobile; hydrated interactivity; zero-source provider prose; authenticated online journeys. None of these was executed, and none is claimed.

---

## Second post-phase correction — the declared consumer could not execute (appended 2026-08-11)

**Everything above stands. This section does not revise the first correction; it records a defect that neither the phase nor that correction could see, and reclassifies one requirement downward because of it.**

### What was found, and when

**Discovered on 2026-08-11, during Phase 2M**, while proving that phase's own funnel reader — by *running* it rather than by reading it. Two independent, invocation-fatal defects were in `scripts/phase-2k-conversation-funnel-reader.mjs`, the consumer Phase 2K declared for `2K-METRICS-007`:

1. **It queried `product_events.occurred_at`, a column that does not exist.** `202607170024:51` creates the ledger with `created_at` as its only timestamp. The reader selected, filtered *and* ordered by `occurred_at`, so every invocation would have died on *"column product_events.occurred_at does not exist"* before printing anything.
2. **It authenticated with `grant_type=password`**, which hosted Turnstile has refused since Signup Hardening SH.5 (2026-08-05) — four days before Phase 2K closed. The endpoint answers `400 captcha_failed` for any scripted caller.

Either alone is fatal. **Phase 2K's declared consumer could therefore never have executed at closeout, and it never was executed.**

### What this does and does not overturn

**It does not overturn the hosted proof.** §8.6's thirteen results stand exactly as written: the three events were accepted through the authenticated writer, read back under the owner's own RLS session, and aggregated by the real `aggregateConversationFunnel` in `scripts/phase-2k-conversation-funnel.mjs` — which has no defect and is unchanged. The negative controls, the idempotency replay and the owner-scoped residue proof are unaffected.

**What it overturns is narrower and it matters.** The proof reached that aggregation through **a query written for the occasion**, not through the consumer's own code path. So the half of `2K-METRICS-007` that says *a consumer exists* — a thing an owner can run to ask a question of the events — was **not** true, and the proof was shaped so that it could not have noticed. This is the same lesson one level up: *a producer with no consumer is invisible on both sides*, and here the consumer was the invisible half.

### What changed, and what deliberately did not

- **`2K-METRICS-007` is reclassified `built` → `partial`**, with a remainder and a destination. The counts were **regenerated by `node scripts/generate-phase-2k-traceability.mjs` from the slice record**, never typed: **79 declared · 79 classified — 66 built, 9 baseline, 4 partial.**
- **No historical execution is claimed, invented or back-dated.** The requirement is not being closed by this section.
- **Phase 2K's migration budget is untouched**: `1 allocated · 1 spent`. The repair is not a migration and costs nothing.
- **The repair is charged to Phase 2M, not to Phase 2K.** It landed in PR #169 (merge `611dd01`, commit `d456571`) on 2026-08-11: the reader now reads `created_at` and accepts `--access-token`. Phase 2M is credited with finding and fixing it; Phase 2K is not credited with having done so.
- **The repaired reader has still not been run against the deployed project.** "Corrected and executable" is not "executed", and the row says so.

### Why no guard fired for nine days

`phase-2k-telemetry-guard.test.ts` asserted the reader's *shape* thoroughly — that it reads all three event names, authenticates as the owner and never as service-role, writes nothing, and distinguishes "not deployed yet" from "a quiet week". Every one of those assertions was true of a file that could not run. **A guard over a script's shape is not a guard over its executability**, and `2E-ANALYTICS-006`'s vocabulary reader had the matching gap: it stopped the probes drifting and nothing stopped them being abandoned.

The structural half is now covered — `phase-2m-telemetry-guard.test.ts` derives the ledger's real column list from the create-table migration and fails **any** consumer, this one included, that reads a column the table does not have. The remaining half is not structural and is not pretended to be: only running it proves it runs.

### The remainder, stated as an obligation

One execution of `node scripts/phase-2k-conversation-funnel-reader.mjs --access-token <jwt>` against the deployed project, on a real owner session, with the output recorded. It is in `docs/TODO.md`. Until then `2K-METRICS-007` stays `partial`, and no document in this repository may say Phase 2K's producer→consumer path was proved through its declared consumer.
