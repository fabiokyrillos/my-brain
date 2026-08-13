# Local Day Correction — Closeout

**Authorized by ADR-111.** Planning through closeout, **zero migrations allocated
and zero spent**. Not a phase: it opened no roadmap position and implemented
nothing from Phase 2N.

**Status: CONCLUDED.** Thirty-one occurrences repaired across four families, all
at zero tree-wide, and the correction is now proved to *render* — in two zones
that disagree about the calendar date of one instant, in both hemispheres across
a DST transition, on the deployed application.

---

## 1. Why this document is also the initiative's acceptance record

The four code units produced **no per-unit acceptance files**. Their record lives
in `docs/STATE.md`, `docs/CHANGELOG.md` and handoff §59, which is a departure
from how every phase since 2C recorded itself, and it is stated here rather than
left for a later reader to notice. This document therefore carries both roles:
the acceptance of Unit 5 and the closing record of Units 1–4b.

## 2. Merge SHAs, each with CI green on the exact SHA

| unit | what | merge SHA | debt after |
|---|---|---|---|
| 1 | contract and tree-wide guard | `911c58a` | 31 |
| 2 | daily-cycle | `1734d34` | 27 |
| 3 | contextual pages | `ea9fd39` | 20 |
| 4a | remaining formatters | `45fb7fb` | 14 |
| 4b | three families, resolver consolidation | `7bd89aa` | **0** |
| — | handoff §59 | `07639c7` | 0 |
| 5 | journeys, review-period extraction, hosted proof | `005c42e` (PR #198) | 0 |
| 5 | closeout, 2N.0 re-audit, handoff §60 | *(this PR)* | 0 |

The hosted proof in §3.2 was executed **before** the merge against the deployed
`07639c7` — whose product surfaces are byte-identical to the merged ones — and
**again after** it, against the deployed `005c42e`: **29/29 desktop, zero
residue**. The merged bytes are what the deployment now serves and what was
proved last.

## 3. What Unit 5 executed

### 3.1 The browser journey — `e2e/online-local-day.spec.ts`

One instant is run past **two owners whose zones are on different calendar dates
at that instant**, in **opposite directions**, so a surface pinned to UTC fails
for both and a surface that merely picked some other zone fails for at least one.

| owner | zone | locale | seeded instant | owner sees | UTC **and the deployment's host** would show |
|---|---|---|---|---|---|
| ahead | `Pacific/Auckland` | pt-BR | `2026-05-14T23:00Z` | **15 May** | 14 May |
| behind | `America/Los_Angeles` | en | `2026-05-14T03:00Z` | **13 May** | 14 May |

Before this initiative every cell in *owner sees* read **14 May**.

May was chosen deliberately: today is in August, and a fixture dated today would
let a page's own "today" satisfy an assertion about a stored instant.

**Eleven surfaces, each for both owners:** entry detail, memory detail, person
page, project page, conversations, question panels, inbox, files, work, calendar,
search. Plus the **Home header** and a **DST pair per hemisphere**.

### 3.2 Results — executed, four times over

| target | project | result |
|---|---|---|
| hosted project, merged bytes run locally | desktop | **29/29** |
| hosted project, merged bytes run locally | mobile (Pixel 7) | **29/29** |
| **deployed application** `https://my-brain-dusky.vercel.app` | desktop | **29/29** |
| **deployed application** `https://my-brain-dusky.vercel.app` | mobile (Pixel 7) | **29/29** |

**116 passing assertions.** The deployment matters specifically: its host zone is
**UTC**, while this machine's is `America/Cayenne`. A host-zone defect renders
differently in the two, and the deployment is the environment the defect was
originally reported against.

### 3.3 DST — one case per hemisphere, measured rather than remembered

Every transition below was established by walking this runtime's own `Intl` data
before any assertion was written.

| zone | hemisphere | transition | effect |
|---|---|---|---|
| `America/New_York` | northern | `2026-03-08T07:00Z` | 23-hour day |
| `America/New_York` | northern | `2026-11-01T06:00Z` | 25-hour day |
| `Pacific/Auckland` | southern | `2026-09-26T14:00Z` | 23-hour day |
| `Pacific/Auckland` | southern | `2026-04-04T14:00Z` | 25-hour day |
| `America/Santiago` | southern | `2026-09-06T04:00Z` | **`2026-09-06` has no local midnight at all** |

In the browser the DST case is a **pair of instants six months apart at the same
UTC clock time**: `Pacific/Auckland` renders them 22:00 and 21:00 (NZDT +13,
NZST +12), `America/New_York` renders them 12:00 and 13:00 (EST −5, EDT −4). **A
fixed offset cannot pass that**, which is what makes it a DST test rather than a
zone test.

### 3.4 `generateReview` — the one signed behaviour change

ADR-111 Decision 6 signed it in advance: the daily, weekly and monthly periods
are derived from the **owner's** calendar, not the host's.

Unit 4b made the change and **nothing could contradict it**. `actions.ts` carries
`"use server"`, so every export in it is an async Server Action: the window could
not be exported, could not be called with a fixed `now`, and could only be
"tested" by a test that re-wrote the same expressions and compared them to
themselves. Unit 5 extracted it to `src/features/agent/review-period.ts`
**unchanged** — an extraction, not a second correction — and
`review-period.test.ts` is the first thing in the repository able to fail on it.

**26 cases, all passing**, covering: two zones disagreeing about one instant;
Monday-based weeks including a Sunday walked back six days; month boundaries
crossed in **both** directions; a half-hour offset (`Asia/Kolkata`); a DST case
per hemisphere; the missing local midnight; and a ~2000-window property sweep
hour by hour across every 2026 transition these zones have.

**Proved able to fail, twice:**

| planted regression | cases failed |
|---|---|
| `today` taken from the host calendar | **6**, by name |
| the daily branch's bounds taken from the host calendar | **14**, including every DST case and the missing-midnight one |

## 4. Honest classification

### 4.1 Executed and approved

- All 31 occurrences repaired; `OPEN_OCCURRENCES` empty; four families at zero
  tree-wide over 400+ files with a per-file budget of zero. **No allowlist, no
  exemption, no exception was created to make the guard pass.**
- The four `DUPLICATE_ZONE_RESOLVERS` consolidated into one `resolveOwnerTimeZone`.
- Eleven surfaces + Home header proved to render the **owner's** civil day and
  **never** UTC's, for two owners in opposite directions, on desktop and mobile,
  in both locales, against the hosted project **and the deployed application**.
- A DST case executed in **each** hemisphere, plus a missing local midnight.
- `generateReview`'s period derivation proved deterministic and owner-calendared,
  with a mutation control that fails it two different ways.
- **Zero fixture residue**, verified after every run including a deliberately
  failing one.
- Gates: `lint`, `typecheck`, `npm test` (**6563 passed**), `build`,
  `git diff --check` — all green.

### 4.2 Partial, with a real remainder and a destination

- **`generateReview` end-to-end against production.** The *period derivation* is
  proved deterministically and the *stored labels* come from the same computation
  as the window, so they cannot drift apart. What is **not** executed is a live
  hosted review generation producing a `summaries` row: `generateReview` is gated
  behind `openAiGate` and makes a **paid provider call**, so proving it live means
  provisioning a BYOK credential onto a disposable account and spending the
  owner's money on an LLM call. **Destination:** the owner, as an explicit
  decision — it is a cost question, not a technical blocker.
- **The files surface.** Its only instant is a *failing job's* retry time, so the
  journey seeds a failed `process_attachment` job to reach it. That is the whole
  of the date rendering on that page; an ordinary attachment renders no instant.
  **No remainder** — stated so the coverage is not read as wider than it is.

### 4.3 Not executed

- **A live `generateReview` call against production** — see 4.2.
- **Real mobile hardware.** The mobile lane is Playwright's Pixel 7 emulation.
  An emulated device is not hardware and is not recorded as one.
- **Zones beyond the six exercised.** `Pacific/Auckland`, `America/Los_Angeles`,
  `America/New_York`, `America/Santiago`, `Asia/Kolkata`, `UTC`. The guard is
  tree-wide, so the *mechanism* is universal; the *renderings* were proved in
  these.

### 4.4 Blocked

**Nothing.** No stop condition in ADR-111 Decision 8 was reached: no migration,
column, schema, RLS, grant, policy or RPC change was needed; no persistent
reprocessing; no amendment to a signed Phase 2N contract. **M1, M2 and M3 remain
allocated to Phase 2N and untouched.**

## 5. Residue

`npm run verify:online-residue` reads **every** account on the hosted project, so
it is a global check and not an owner-scoped one.

| moment | accounts | fixture residue |
|---|---|---|
| after the first (failing) run | 4 | **2** |
| after removal by explicit id | 2 | **0** |
| after every subsequent run, including a deliberately failing one | 2 | **0** |

The two leaked accounts were the initiative's own, created seconds earlier by a
run whose `beforeAll` threw after creating them, on the RFC-2606 reserved
`@example.com` domain, with ids matching the failure output exactly. They were
removed **by explicit id**, each verified to be an `@example.com` address before
its delete was issued — never by a predicate sweep.

**The leak was then fixed at its cause:** the account id is now recorded *before*
seeding can throw, so the run that most needs cleaning up is no longer the one
that leaks. Proved by the deliberately failing mutation run, which left nothing.

## 6. Five things Unit 5 learned by executing

1. **An absence assertion passes on a page that never rendered.** Eleven surface
   cases "passed" while one of them was reading a body containing only the
   navigation shell and "Carregando página". `settle()` now waits out the route's
   Suspense fallback, and **every surface names a marker from its own fixture**,
   so "the wrong day appears nowhere" can no longer be satisfied by a blank page.
2. **A test that pins a format tests the format.** The calendar was *correct* and
   failed anyway, because `calendar-view.tsx` labels a column `Wed, May 13` and
   the assertion wanted `May 13, 2026`. A day is now checked as a **set** of
   spellings, each one a bag an actual surface uses.
3. **`innerText` does not report collapsed content.** The question panels are
   `<details>`; their dates were in the DOM and invisible to the assertion.
   Opened by clicking — and scoped to `main`, because the navigation shell's own
   `<details>` is hidden at desktop widths and never becomes clickable.
4. **Thirty sign-ins in two minutes earn `429 over_request_rate_limit`**, which
   surfaced as eight unrelated failures and was none of them. One session per
   owner, minted once and reused.
5. **A fixture must be read back.** Each seeded instant is verified before any
   page is opened, because a trigger rewriting `updated_at` would otherwise
   surface as a confusing *product* failure three surfaces later.

## 7. Three findings that are not date defects

Recorded rather than fixed — none is in this initiative's scope, and none is a
timezone defect.

1. **`src/app/[locale]/app/loading.tsx` labels its fallback `"Carregando página"`
   in both locales.** A real i18n gap on a `role="status"` live region, so a
   screen reader in `en` announces Portuguese. **Destination:** Phase 2N's
   accessibility work (`2N-ACCESS`), or a standalone copy fix.
2. **`calendar-view.tsx`'s `timeZone: "UTC"` is correct** and was verified as
   such: it formats an already-decided `LocalDate` at UTC noon, which is what
   guarantees a column label cannot disagree with the column it sits on. Noted
   because it reads alarmingly and a future audit will meet it again.
3. **`loadQuestionPreviews` is wrapped in `.catch(() => new Map())`**, so a row
   shape its Zod schema rejects yields no preview and **no error** — a surface
   that renders nothing while looking like it rendered fine. **Destination:**
   Phase 2N's provenance work, which opens that projection.

## 8. Posture, unchanged throughout

**92 migrations. Hosted parity `202608120092`, verified against the live project.
Zero migrations created and zero spent.** No schema, RLS, grant, policy, RPC or
preference change. No Edge Function change. `planned_at` untouched. Push **not**
resumed. Signup **closed**. Rollout gate **25 · 3 · 2**. **Phase 2N planned and
unimplemented. Phase 2O not started.** A13 still targets the roadmap successor.

## 9. The contracts this initiative was required to preserve

| contract | state |
|---|---|
| `getOwnerTimeZone()` is server-only and request-cached | **preserved** — `cache()`-wrapped, one query per request |
| `resolveOwnerTimeZone()` is pure and total | **preserved** — and is now the only resolver |
| `requireProfileTimeZone` stays fail-closed on day-computing surfaces | **preserved** — still throws, asserted by the guard |
| no silent timezone fallback where refusal is deliberate | **preserved** — two postures, each stated |
| `planned_at` out of scope | **preserved** — untouched |
