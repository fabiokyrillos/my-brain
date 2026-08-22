# Phase 2R — audit of the current product

**Read this before the PRD.** Every claim below was **measured against the tree,
the deployed database, the test suite or the CI record** on 2026-08-22, at
`main` = `43c8be17`. A historical mention in `CHANGELOG.md`, `STATE.md` or a
closing report is **not** evidence that something is still pending, and this
audit treats it as a hypothesis to re-test rather than a fact to inherit.

Nothing here authorizes anything. This document declares **no requirement
identifiers** and allocates **no migration**.

---

## 1. The baseline, re-proved rather than carried forward

The task that produced this document was given a baseline and told not to trust
it. Every line was re-derived:

| # | Claim | Method | Result |
|---|---|---|---|
| 1 | `main` local = `origin/main` | `git rev-list --left-right --count` | **`0 0`**, both at `43c8be17` |
| 2 | worktree clean | `git status --porcelain` | **empty** |
| 3 | residual worktrees | `git worktree list` | **two**, both clean — sanctioned by ADR-128 Decision 9 (*"The residual worktrees stay"*) |
| 4 | open pull requests | `gh pr list --state open` | **zero** |
| 5 | CI at the exact `main` SHA | `check-runs` on `43c8be17` | **3 / 3 success** — edge worker · application · database and journey |
| 6 | local migrations | `ls supabase/migrations/*.sql` | **100** |
| 7 | hosted migrations | `list_migrations`, read-only | **100**, newest `202608210100` |
| 8 | parity | comparison of 6 and 7 | **`202608210100`**, 100 = 100 |
| 9 | signup | `supabase/config.toml` | `[auth].enable_signup = false` — **closed** |
| 10 | Phase 2Q closed | ADR-130, `3761cfa` | **closed**, 42 / 42 classified |
| 11 | successor artifacts | filesystem scan of `docs/` | **absent** before this package |
| 12 | commits after closeout | `git log 3761cfa..43c8be17` | **only the merge commit** |

**Gates run locally at that SHA:** `lint` — zero errors in the product;
`typecheck` — zero errors; `npm test` — **8 957 tests passing, zero failing**.

Three *files* fail to transform under Vitest on this workstation
(`scripts/verify-*.mjs`, a shebang the Windows parse rejects). That is the
recorded Windows baseline, it is **zero failing tests**, and CI is green. It is
not a defect and this phase does not inherit it.

### 1.1 One correction to the baseline itself

`npm run lint` reports **six errors** on this workstation. **All six are inside
`.worktrees/suggest-new-people/`** — a residual worktree nested *inside* the
repository, which ESLint walks into and CI never sees. The product has **zero**
lint errors. Recorded so that the next reader does not spend an iteration on it.

---

## 2. What the product already is

Measured from the route tree, not from the roadmap.

**Forty-one authenticated pages** ship under `src/app/[locale]/app/`: capture,
inbox, today, work (with an intercepted detail panel), tasks, waiting, calendar
and its planner, projects, organizations, people, contexts, relations, memories,
library, files, reviews, chat, search, history, notifications, questions, jobs,
costs and a nine-section settings area.

**Search ships.** `src/features/search/` — actions, contracts, copy and a
surface — plus the route `/app/search` and a command palette at
`src/features/palette/command-palette.tsx`. Any note that the product's *"real
gap is search"* is **stale** and is corrected here.

**The capability register is honest.** `src/features/shell/capabilities.ts`
marks twelve preferences `state: "future"` with `visible: false` and **no**
consumer evidence — stored columns that are deliberately not presented as
behaviour. That is the contract working, not a defect.

---

## 3. The mandatory re-audit, candidate by candidate

Each candidate is classified with exactly one of: **belongs to the next phase ·
separate initiative · external dependency · rollout · backlog · rejected by rule
· already resolved · obsolete description · waived by the owner.**

### 3.1 Return to *"Precisa de você"* — `2P-ATTENTION-008`

**Classification: belongs to the next phase only if the theme is findability;
otherwise a standalone defect. Recorded as a proved defect either way.**

Phase 2Q slice 2Q.0 narrowed this remainder and recorded that refresh **is**
proved in a browser while back navigation is proved **nowhere**. That narrowing
is confirmed. This audit adds the mechanism, which no prior record contains.

`src/features/daily-cycle/needs-attention-list.tsx` holds **all** of its state in
component-local `useState`:

```
const [items, setItems]           = useState(initialItems);
const [cursor, setCursor]         = useState(initialCursor);
const [hasNext, setHasNext]       = useState(initialHasNext);
const [activeFilter, setActiveFilter] = useState<AttentionFilter>("all");
```

`activeFilter` is **never** written to the URL and **never** read from it —
there is no `useSearchParams`, no `router.replace`, no `history` call in the
file. Navigating away unmounts the component; navigating back remounts it from
props. The filter the owner chose resets to `"all"` and every page loaded by
*"load more"* is discarded.

**This is structural, not incidental**, and it is established from the code
rather than from a document. **It is not, however, established in a browser** —
and the browser observation stays a closing condition rather than being replaced
by this paragraph. Proving a mechanism and observing a behaviour are different
acts, and this repository has already recorded what happens when a document is
accepted in place of a run.

### 3.2 Real push on the iPhone — HTTP 403

**Classification: separate initiative + external dependency + owner hardware.
It does not enter a product phase.**

It already has a governing artifact:
`docs/initiatives/push-hardware-validation/PUSH_HARDWARE_VALIDATION_BACKLOG.md`,
created by ADR-107. Re-read in full, it is accurate and needs no rewriting.

What it establishes by measurement: the application's and the function's VAPID
public keys match by `sha256`; the deployed sender's self-check reports
`pair: "consistent"`; the key is a real uncompressed P-256 point; the key
predates the subscription; the subject categorises as `operational`; and
`VAPID_PRIVATE_KEY` is absent from the application environment. **What it does
not establish is why Apple answers 403 when both halves of the authentication
agree** — and it states, correctly, that no root cause is asserted anywhere in
this repository.

Four hypotheses remain unexcluded (an Apple-specific RFC 8292 requirement; a
property of the subscription the endpoint does not reveal; a request-level
requirement beyond the token; an account or origin condition on Apple's side).

**Investigable without reading any secret:** the sender's own diagnostic output,
the request shape against RFC 8292, and whether a *new* subscription behaves
differently. **Requires the owner's hardware:** every delivery observation in
§3.2 of that backlog. **Requires an external provider:** the 403 itself.
**Android has never been executed at all** and the owner has no Android device.

**Migrations:** none needed and none available — this is not a schema problem.

**Recommendation: keep it as its own operational initiative.** Folding an
unexplained third-party refusal and an owner-hardware dependency into a product
phase would make the phase's completion depend on Apple.

### 3.3 Restore drill — `RG-DEP-3`

**Classification: rollout.**

`docs/initiatives/post-2h-rollout/POST_2H_ROLLOUT_READINESS.md` records it as
**FAIL**, and — the important part — records that `RG-DEP-3` passes on a file's
*existence*, which is exactly why the repository has repeatedly written that **it
cannot be closed by writing a file**. That prohibition is inherited unchanged.

What exists: the gate and its verdict. What is missing: the owner completing the
backup install, and then a drill run in an environment where a restore is safe.
**Risk is genuinely destructive** — a restore drill against the live project
would overwrite real data — so the environment is the whole problem, not the
procedure.

**It belongs to the rollout track, not to this or any product phase**, and this
package must not appear to advance it. No restore is executed by this task.

### 3.4 The four missing automation review flows

**Classification: separate initiative — the disposition ADR-127 Decision 8
already signed. Re-measured here and confirmed, not merely preserved.**

Phase 2Q's finding was that the four cannot accumulate calibration evidence.
That was re-derived independently from the deployed SQL:

```
private.automation_category_has_producer(p_category)
  → select p_category in ('task', 'person');
```

and the only observation producers in the migration are
`automation_observation_from_task_resolution()`,
`automation_observation_from_person_resolution()` and
`automation_observation_from_undo()`. **`project`, `organization`, `memory` and
`relation` have no path that can write an observation.** The 2Q finding
**stands**.

Re-measured sizing, treated as four problems rather than one:

| flow | size | why |
|---|---|---|
| `project` | **medium** | `extraction-schema.ts` already emits a `projects` array — the candidate exists, the review flow does not |
| `organization` | **medium** | same, `organizations` array |
| `memory` | **large** | not an entity array in the extraction schema at all; the AI contract **and** the Deno worker both change |
| `relation` | **blocked** | `2N-RELATION-TRIGGER` is a hard remainder needing an owner decision and a migration |

The thresholds they would have to clear are real: `task` 50 reviewed at 0.90,
`person` 80 at 0.97, `project`/`organization` 60 at 0.95, `memory` 80 at 0.97,
`relation` 100 at 0.98 — plus at least 10 reviewed inside 90 days and a newest
observation inside 30. **See §4, which is the reason none of this is buildable
now.**

### 3.5 Accessibility tests on real routes

**Classification: backlog — test infrastructure, not a phase.**

The remainder is **much narrower than its description**. Real-route accessibility
lanes **already exist**: `e2e/phase-2o-mobile-accessibility.spec.ts` and
`e2e/online-phase-2o-mobile-accessibility.spec.ts` both `page.goto(path)` against
real pages, the second after signing in.

The only fixture-based lane is `e2e/accessibility.spec.ts`, which uses
`page.setContent(...)` — and it is the **dark-mode contrast scan** specifically.
ADR-129 recorded converting it to real routes as *"the more robust shape"* and
rejected it **for that slice only**, leaving it available later.

**Divergence classes fixtures have already produced**, all recorded: a lane that
stripped `@import "tailwindcss"` and thereby invented a `color-contrast` failure
that the product never had (ADR-129); a `setContent` document with no real origin
under which WebKit resolves **no** custom properties; and an unstubbed
`next/font` variable poisoning every type token.

**Cost:** the lane must sign in, so it joins the authenticated online set, which
is not in the default CI job. **Stability:** authenticated lanes here are run
`--workers=1`. **What it would prove:** that the dark palette is correct on
pages as rendered. **What it still would not prove:** anything about screen
readers — see §3.9.

**It should not become a phase.** It is one spec file's mechanism.

### 3.6 Recurrence of reminders

**Classification: absent, desirable, and the strongest candidate for the next
phase. Confirmed against the schema.**

`public.reminders` is created in `202607160007_agent_operations.sql` with:

```
id · user_id · task_id · entry_id · title · remind_at · important
status · snoozed_until · sent_at · created_at · updated_at
```

and altered exactly once afterwards (`202607170016`, foundation hardening).
**There is no recurrence column of any kind**, and no `rrule`, `recurrence`,
`repeat_*` or equivalent anywhere in `supabase/migrations/`.

This is why `2P-REMINDER-002` was corrected by amendment during Phase 2P: the
requirement as written named recurrence, recurrence needed a third Phase 2P
migration, and **the owner refused it**. The remainder is
`2P-REMINDER-RECURRENCE`, refused **by name** and still refused. **Lifting that
refusal is an owner decision and is not taken here.**

What the work would have to answer, none of it free:

- **the model** — a fixed set of enumerated patterns, or an RRULE subset;
- **occurrence vs series** — editing one occurrence must not silently edit the
  series, and the product has no vocabulary for either today;
- **timezone and daylight saving** — and this repository has scar tissue here:
  three different local-day implementations existed at once, two wrong in
  opposite directions, and a fixed instant lands in the previous day where local
  midnight does not exist. A recurrence is a *wall-clock* intention, so this is
  the hard part, not a detail;
- **ending a series** — cancellation of one, of the rest, or of all;
- **reminders vs tasks** — they are different objects, and recurring tasks would
  be a second phase, not a second requirement;
- **notifications** — recurrence multiplies delivery, and quiet hours, the daily
  cap and the 24-hour cooldown all already exist and must keep holding;
- **a migration** — certainly at least one;
- **mobile UX** — the modal already groups content, date, time, importance and
  link, and a recurrence control has to fit that without becoming a form.

**Hosted usage, read-only:** the `reminders` table currently holds **2 rows**.
That is a signal about adoption, and §4 reads it.

### 3.7 Real conversation with BYOK — `2P-CHAT-007`

**Classification: unspendable — the treatment it already has. Not resolved, not
declined.**

The requirement is *"Desktop and mobile journeys cover new conversation,
existing conversation, source round-trip, failure and recovery."* Its remainder
`2P-CHAT-007-JOURNEY` was recorded **unspendable** because no AI credential
exists in the agent's environment, and Phase 2Q left it unchanged.

**The conversation page itself is not broken.** Phase 2P slice 2P.2 repaired it,
and the closing record is explicit that the defect *"was never in the provider
path"* — it was a boundary nobody had looked at. So *"does the page work"* and
*"can an end-to-end paid journey be proved"* are different questions with
different answers.

What is proved with fixtures: the surface, the failure and recovery states, the
citation round-trip shape. **What would require a paid call:** a real model
answering over the owner's own data. **No key is used and no call is made by
this task**, per the authorization.

The honest disposition is unchanged: **unspendable, never a pass.** It is
discharged only by the owner spending their own credential, exactly as
`2P-REVIEW-CITATIONS` finally was.

### 3.8 Mobile and voice remainders

**Classification: owner hardware (open) and already approved (closed) — and the
two must not be confused.**

Still open and hardware-bound: **`2P-MOBILE-002`'s keyboard and IME half**, and
`2L-MOBILE-008` / `2L-ACCESS-008`, which travelled into the push backlog because
they belong to the same owner-run device session.

**Already approved and not reopened here:** the iPhone checkpoints of rounds
one, two and three, the Revisões checkpoint, the final two-item checkpoint that
closed Phase 2P, and all **eight** items of the Phase 2Q checkpoint — including
mobile layout and Safari dark-mode contrast. This audit does not revisit them.

Voice and transcription: `202608080085_phase_2j_transcription_usage` is applied
and the capture surface ships. **No audio is persisted**, which every recent ADR
restates as a standing constraint, and this package does not change it.

### 3.9 VoiceOver

**Classification: waived by the owner. Status is, verbatim and unchangeably:**

> **NOT EXECUTED — OWNER WAIVED**

`2P-ACCESS-005` was discharged by ADR-125 Decision 2 as a **waiver**, not a pass,
and ADR-130 Decision 5 restated it after the Phase 2Q checkpoint: item 8 approved
**contrast in Safari**, which is not a screen-reader test.

**It must never be described as approved, tested or passing**, it is **not** a
priority of the next phase, and **nothing** in this repository — including an
accessibility lane that now runs on WebKit in CI — may be reported as
screen-reader evidence. A lane on a third engine is precisely the change a later
reader might mistake for coverage.

---

## 4. What the data says, and why it disqualifies one otherwise-attractive theme

Read-only aggregate counts against the deployed database. No content, no
identifiers, no personal data:

| table | rows |
|---|---|
| `automation_calibration_observations` | **0** |
| `automation_category_policies` | 4 |
| `reminders` | 2 |
| `summaries` | 2 (one with citations, one `[]`) |

**This is a pre-MVP with essentially one user and almost no accumulated data.**

That single fact decides more than any preference could. The most valuable theme
on paper — *make the agent act* — requires calibration evidence the product
cannot produce: `task` alone needs **50** reviewed subjects at **0.90**
precision, with at least 10 inside 90 days. There are **zero**. A phase that
built an automatic writer would be building the most dangerous component in the
product **with no evidence against which to validate it**, and would very
probably ship something that never fires.

**Any theme whose completion depends on usage volume is not buildable now.** The
themes in §6 are ranked with that constraint applied first.

---

## 5. A finding this audit was not looking for

**The record is factually wrong about automation, and the safety it claims comes
from a different mechanism than the one it names.**

ADR-128 Decision 9, ADR-129 Decision 10 and ADR-130 Decision 8 each state:

> All six automation categories stay `suggest_only` with no automatic writer.

Read live from the deployed database:

| category | stored state | created (UTC) | computed decision | eligible | observations |
|---|---|---|---|---|---|
| `task` | **`automatic_when_eligible`** | 2026-08-20 12:14:34 | `insufficient_calibration` | `false` | 0 |
| `person` | **`automatic_when_eligible`** | 2026-08-20 12:14:48 | `insufficient_calibration` | `false` | 0 |
| `project` | `suggest_only` | 2026-08-20 12:14:54 | `suggest_only_by_owner` | `false` | 0 |
| `organization` | `suggest_only` | 2026-08-20 12:15:04 | `suggest_only_by_owner` | `false` | 0 |
| `memory` | *(no row)* | — | `suggest_only` (computed default) | `false` | 0 |
| `relation` | *(no row)* | — | `suggest_only` (computed default) | `false` | 0 |

**Two of the six are not `suggest_only`.**

**Attribution, stated before anything is inferred.** The four rows were created
within **thirty seconds** of one another, in ascending order through the settings
surface, on **2026-08-20** — the day Phase 2P closed. That is the shape of a
person clicking through a settings page, and the only writer is
`public.set_automation_category_policy`, which is `authenticated` and audited.
**This is the owner's own action.** It is not an unattributed change, not an
agent write, and this audit does not call it a defect of anything but the record.

**The product is safe, and it is worth being exact about why.** Two independent
facts hold it:

1. **There is no automatic writer.** `private.automation_category_decision` is
   consumed by exactly one thing — `public.automation_category_status()` — which
   is consumed by exactly one thing, `src/features/agent/automation-data.ts`, a
   **display** path. Nothing in `supabase/migrations/`, `src/` or
   `supabase/functions/` writes anything as a consequence of `eligible`.
2. **Calibration is empty**, so `eligible` is `false` for every category anyway.

**Neither of those is the fact the record names.** The record says the *policy*
is `suggest_only`; for two categories it is not. The claim was written in three
successive ADRs and never checked against the rows.

**Why it matters for the successor, which is the only reason it is here.** The
owner has **already consented** to automation for `task` and `person`. If an
automatic writer were ever built, and if calibration ever accumulated, those two
categories would begin acting **with no further owner action** — the consent is
already stored. Any future phase touching automation must start from that fact
rather than from the sentence in the ADRs.

**Disposition.** This is a **documentary correction**, it costs no migration and
no code, and it is carried by the authorizing ADR of this package rather than
becoming phase scope. Accepted ADRs are never edited in this repository, so the
correction is recorded by appending, exactly as ADR-129 corrected ADR-127's
premise.

---

## 6. Themes, measured against each other

Four coherent options. The comparison is in
[`PHASE_2R_THEME_OPTIONS.md`](../../initiatives/phase-2r/PHASE_2R_THEME_OPTIONS.md);
the summary is that **option A is recommended and the choice is the owner's.**

| | theme | user value | risk | migrations | volume-dependent? |
|---|---|---|---|---|---|
| **A** | **Rotina — what repeats** | **high** | medium | 1–2 | **no** |
| B | Autonomy — the agent acts | highest | **high** | 1–2 | **yes — disqualifying (§4)** |
| C | Find it, and come back to it | medium | low | **0** | no |
| D | Evidence for autonomy (`project` + `organization` flows only) | medium | medium | 0–1 | partly |

---

## 7. Inherited items, every one with a destination

Nothing below is absorbed, discharged or downgraded by this package.

| item | state | destination |
|---|---|---|
| `2P-ACCESS-005` (VoiceOver) | **NOT EXECUTED — OWNER WAIVED** | stays waived; never reported as passing |
| `2P-ATTENTION-008` back navigation | open, mechanism now proved (§3.1) | theme C, or a standalone defect |
| `RG-DEP-3` | **FAIL** | rollout track; **not closable by writing a file** |
| push HTTP 403 · Android never executed | open | `push-hardware-validation`, external + hardware |
| `2P-CHAT-007-JOURNEY` | **unspendable** | the owner's credential |
| `2P-AUTONOMY-005` / `-006` / `-007` / `-008` | `not-built-by-rule` | ADR-123 Decision 3 |
| `2P-AUTONOMY-003` reference set | open | with the autonomy theme, if ever chosen |
| `2P-REMINDER-RECURRENCE` | **refused by name** | **theme A would lift it — an owner decision** |
| `2P-CALENDAR-MONTH-TELEMETRY` | refused by name | stays refused |
| `2P-MOBILE-002` keyboard / IME | open | owner hardware |
| four automation review flows | out under `OD-2Q-8` | separate initiative |
| `2N-RELATION-TRIGGER` · `2N-IDENTITY-EXTRACTION` · `2N-FILES-WRITER` · `2N-PRIVACY-FREETEXT` · `2N-RELATION-END-ANNOUNCEMENT` | open | unchanged |
| dark accessibility scan on real routes | open | backlog, test infrastructure (§3.5) |
| **ADR-055 expiry — 2026-10-27** | **live, 66 days out** | **owner; dated, and named here because nothing in this repository fires on a date** |

### 7.1 The dated item, called out because it will otherwise be missed

ADR-055 set a **90-day expiry** on the semantic-retrieval evidence standard: at
expiry without a met threshold, *"an ADR removes semantic retrieval from the
active roadmap until a new demand signal appears."* `docs/TODO.md` carries the
dated entry and the date is **2026-10-27**.

Today is **2026-08-22**. **Nothing in this repository fires on a date** — ADR-055
says so itself — so this is an owner action with a deadline, and it is named
here rather than left to be noticed. This package does not resolve it.

---

## 8. Serious defects found by the broad sweep

The instruction was to include additional findings **only if proved**, and not to
widen a phase out of an abstract preference for tidiness. Two qualify.

| # | finding | severity | proof |
|---|---|---|---|
| 1 | **A search cannot be linked, shared, bookmarked or returned to.** `/app/search` reads **no** `searchParams`; query, domain, period and the results themselves live in `useState`. Ten of the twelve list routes — `history`, `work`, `tasks`, `people`, `projects`, `memories`, `files`, `reviews`, `calendar`, `notifications` — **do** read `searchParams`. Search and `library` are the only two that do not. | **medium** — a primary surface behaves unlike every comparable one | route file read in full; `searchParams` counted across all twelve routes |
| 2 | **The *Precisa de você* filter and pagination are lost on back navigation** (§3.1). | **medium** | component read in full; no URL, router or history call exists |

**Deliberately not raised as defects**, having been checked and found sound: the
twelve `state: "future"` capability rows (correctly invisible, correctly without
consumers); the three Vitest file-transform failures (Windows-only, zero failing
tests); the six lint errors (residual worktree only).

**One documentation defect, recorded without being fixed here.** `STATE.md`'s
prepended head is current, but its structured tail sections — *"Next
priorities"*, *"Pending or incomplete functionality"* — still describe Phase 2C
slices as unpushed and Phases 2D–2F as future work. They are roughly a month
stale. The head is the part every process reads, so this is low severity, but a
reader who scrolled would be misled.

---

## 9. What this audit deliberately did not do

- **No AI call, and no BYOK credit spent** — the authorization forbids it.
- **No hosted data written.** Every hosted statement was a `select`. No fixture
  was planted, so no residue can exist and none is claimed.
- **No restore, no push send, no secret read, no signup change, no rollout
  change, no migration, no product code.**
- **No browser run.** §3.1's mechanism is proved from source; the behavioural
  observation is left as a closing condition rather than being replaced by a
  document. An authenticated session against the deployed product would have
  required either the owner's password past a live CAPTCHA or a
  service-role-minted link — the first is not available to this task and the
  second creates hosted auth artifacts the authorization does not permit.
