# Phase 2S — Slice 2S.3 acceptance record

**Where the notices appear, and on what — up to the owner's device checkpoint.**

- **Authorization:** implementation of slices 2S.0 … 2S.4, **ADR-138**
  (2026-08-24).
- **Requirements:** `2S-ATTENTION-001` … `-008`; `2S-ACCESS-001` … `-007`;
  `2S-MOBILE-001` … `-007` (**22** of 99).
- **Migration:** **none.** The phase's one migration was spent and applied by
  slice 2S.1. Hosted parity is untouched at `202608240102`, **102 local = 102
  hosted**.
- **Baseline:** `main` **`533d02fc4cd8238c65f34835693d121a9c82e63f`**, the tree
  slice 2S.2's handoff produced, with CI green 3/3 on that exact SHA (run
  `32902765351`).
- **Hosted writes: the rendered lane, run with the owner's authorization on
  2026-08-26 — and nothing else.** It created a disposable account, planted two
  tasks and three notices, and deleted the account in `afterAll`. Residue was
  proved **zero** by comparing a full snapshot of all 59 `public` tables taken
  before the run against one taken after it: **identical, row for row**. See
  **§10**, which also records the **seven defects the run found** — one of them a
  product defect that took `/app` down for every owner with an unanswered
  notice — and an **eighth that CI found**, latent on `main` and visible only in
  a three-hour window each day.
- **One further hosted write, authorized explicitly: a single notice planted in
  the owner's own account** so the device checkpoint had something to act on, and
  **deleted by id** afterwards. `notifications` is back to 57 and nothing the
  owner touched wrote anything — §11.
- **AI calls by this work: none. BYOK credit spent: none. Push: not resumed, not
  repaired, not claimed. Signup unchanged. Rollout unchanged.** (Two
  `ai_usage_events` rows appeared during the checkpoint window; they are the
  product's extraction and embedding of a capture **the owner made**, itemised in
  §11.)

**The owner's `2S-MOBILE-003` checkpoint was HELD on 2026-08-27** — §7 and §11.
What remains after it is named there rather than implied.

---

## 1. The owner's decision on the queue's filters, delivered clause by clause

Given on 2026-08-25, and the only product decision this slice was handed:

| clause | how it is delivered | how it is proved |
|---|---|---|
| unanswered notices appear under **Todos** | `visibleNotices` admits `all` | rows render with no filter chosen |
| a filter of their **own** | a fourth chip, `Avisos` | the chip shows notices and hides records and conflicts |
| **never** in a filter meant for another type | the predicate names exactly two filters and no reason | the records chip and the conflict chip each yield **zero** notices, and each still does its own job |
| count and list from the **same set** | `queueSize`, read by both | three kinds counted; and without the handlers **no row renders and none is counted** |
| existing filters **preserved** | nothing about them changed | the whole `daily-cycle` suite, unchanged |
| mobile: reachable, readable, no horizontal overflow | 44px chips at ≤600px; `flex-wrap: wrap` was already there | the rendered lane (§7) |

**It corrected a divergence that predates this slice.** `itemCount` was
`items.length` even after `2N-CONFLICT-003` put conflicts in the same queue, so
a day whose only item was a contradiction reported **zero** items viewed.

---

## 2. `2S-ATTENTION-002`: the requirement's own example does not exist here

The criterion reads *"a task present from its own source and from a notice
appears once"*. Measured against the tree, that pairing cannot occur: the
queue's other sources are `list_needs_attention`, which returns **entries**, and
the memory conflicts, which return **memories**. Neither carries a task.

**What does duplicate is a subject with more than one unanswered notice**, and
it is not hypothetical. A task key carries the owner's local date, so a subject
nobody answers accumulates one notice per qualifying day until the backoff
ladder stops it. Slice 2S.0 measured exactly that: **54 of 57 notices were
`task_stale`, about three tasks.**

So the collapse is by **subject**, the newest survives, and:

- the older notices are **not deleted** — they stay in the database and stay
  answerable on `/app/notifications`. This is a projection.
- a row with **no resolvable subject** is never collapsed. Two of those are two
  different things, not one thing seen twice, and folding them would silently
  hide a notice.
- `hasMore` is read **after** the collapse. From the raw read it would say "+1"
  beside a queue already holding every distinct subject there is.

**The reading is recorded rather than chosen quietly**, because it changes what
the requirement asks for.

---

## 3. What the rendered lane cannot be, and why

`2S-ATTENTION-005`, `2S-ACCESS-004` and every `2S-MOBILE` build requirement name
the **rendered page**. `2S-MOBILE-006` says it twice: *"never against a media
query, because headless Chromium reports `pointer: coarse` at 1280px and a
pointer query is not a device."*

The surfaces are `/app`, `/app/notifications` and `/app/inbox?view=needs-you`.
**Every one of them is behind a session**, and the first and third render the
attention row while the second renders the history's own — §10.3 is the price of
having read that the other way round.

`e2e/phase-2o-mobile-accessibility.spec.ts` proves the rendered floor in CI and
reaches only the **public** routes, precisely because those are the ones
reachable without one — its own header says so.

**So this lane cannot gate in CI.** `e2e/online-phase-2s-attention.spec.ts` is
written against the hosted project and runs by hand, exactly as
`online-phase-2o-mobile-accessibility.spec.ts` does. Saying otherwise would be
reporting as executed something that is not.

### What the lane does that a weaker one would not

- **It plants three notices about two subjects.** Two rows out of two notices
  would prove nothing about the collapse; the duplicate is what makes the
  number able to be wrong.
- **The empty state is reached only after rows were proved on the same
  account.** `2S-ATTENTION-004`'s own wording — *"the control plants rows first,
  so a zero that could never be false would fail"*.
- **axe runs twice per surface: menu closed, and menu OPEN.** `role="menu"`,
  `role="menuitem"`, `aria-expanded` and `aria-describedby` exist only while it
  is open, so a lane that never opened it would scan markup the owner never
  meets.
- **`2S-MOBILE-007` is geometric.** "Visible" alone would pass for an element a
  panel sits on top of, so the assertion compares the menu's top edge against
  the row title's bottom edge.

---

## 4. Three defects, all found by guards or controls rather than by review

1. **`LDC-GUARD-001`: the day count read the DEVICE's zone.** The silence
   consequence computed "today" from `new Date().getFullYear()` and friends —
   and this is a **client** component, so an owner in São Paulo reading on a
   laptop still set to Lisbon would be told a different number of days than the
   suppression will last. It walks calendar days through
   `localDateOf`/`addLocalDays` now, so a 23-hour day still counts as one.
2. **`stylesheet-class-coverage`: `.notice-open-outcome` shipped with no rule at
   all** — the class existed and nothing drew it, which is the defect this
   repository has already paid for on this very feature.
3. **An ARIA contradiction in the menu.** `role="menuitem"` sat on a `<div>`
   *wrapped around* the button: the element that takes focus and the element
   claiming to be the item were different, so menu navigation had nothing to
   move between. The role is on the button, and the meaning reaches it through
   `aria-describedby`.

### And two more of the owner's own controls found the product

`2S-ATTENTION-006`'s *Abrir* was written twice before it was right:

- **`disabled` is not the defence.** It guards the **button**, not the **form**:
  a `form.requestSubmit()` reaches the action with the button disabled, and the
  first version performed a second write from it.
- **An in-flight flag did not help either**, because React **queues** actions
  rather than running them concurrently — the second dispatch ran after the
  first settled, when the flag was already clear.

The guard is now about what **happened**: a notice this control already opened
is not opened again, and a **failed** round leaves both flags down, because a
control that can never be pressed again is the other half of "stuck".

---

## 5. `2S-ATTENTION-008`, by both mechanisms — and a gap it exposed

Three surfaces now read the same rows through the same projection. They agree
for two separate reasons, and either alone would leave a way to disagree:

1. **The same projection.** A row answered on one surface resolves differently
   on the others' next read — asserted directly: a notice marked read vanishes
   from the attention loader while the history page still holds it, reading
   `read`, offering no *marcar como lido*.
2. **Every write invalidates all three routes.** Without that, "the next read"
   never happens.

**`/app/inbox` was missing from both writers.** That queue now holds notices, so
an action taken on the history page left it showing a row the owner had already
answered. Added to `markNotification` and to `suppressNotificationSubject`.

**A check that passed by containing its own subject, again.** The mutation
control that deleted `markNotification`'s inbox invalidation left the test green,
because `agent/actions.ts` holds **another** action that revalidates
`/app/inbox` for its own reasons. The scan reads one exported function's body
now, not the file.

---

## 6. Controls and gates

**Seventeen mutation controls in this slice, seventeen failures**, every
mutation verified performed on disk and every file restored and re-verified.
One of them failed to fail and was repaired first — §5.

| gate | result |
|---|---|
| typecheck | **zero** |
| lint | **at baseline** — the only errors are inside gitignored `.worktrees/`; two warnings this slice introduced were removed |
| `npm test` | green; the three load failures are the pre-existing rolldown shebang baseline |
| production build | passes |
| pgTAP · `db lint` · chain from empty · CI Playwright | **CI** |
| **the rendered authenticated lane** | **RUN, 18/18, on the hosted project** — §10. This row read *NOT RUN* when the slice merged, and the run is what found the seven defects §10 lists. |

---

## 7. THE OWNER CHECKPOINT — HELD 2026-08-27, and what it did and did not cover

`2S-MOBILE-003`: *"The owner validates this phase's surfaces on their own
device. A person with the device, on a named list of items. **No automated lane
substitutes**, including an emulated WebKit project."*
`2S-CLOSE-009`: *"A hardware proof is never discharged by a document."*

**The owner held it on their own iPhone on 2026-08-27** and reported all five
named items passed — §11 records how it was reached, what it cost, and the one
surface the named list does not reach.

| item | state | why |
|---|---|---|
| `e2e/online-phase-2s-attention.spec.ts` | **EXECUTED 2026-08-26, 18/18 green, one worker** | the owner authorized a run with a disposable account and synthetic fixtures; §10 |
| `2S-ATTENTION-001` · `-003` · `-004` · `-005` · `-006` | **proved on the rendered page** | by that lane; `-006` is proved in the **database** as well as on the page |
| `2S-ACCESS-004` (axe) | **proved on all three rendered routes**, menu closed and open | by that lane |
| `2S-MOBILE-001` · `-002` · `-006` · `-007` | **proved on the rendered page at 320px and 375px** | by that lane |
| `2S-MOBILE-003` | **HELD 2026-08-27 — a person, an iPhone, the five named items, all reported passing** | performed against the **deployed production build `6d38edc`**, not a lane and not a preview; §11 |
| `2S-ACCESS-005` (VoiceOver) | **NOT EXECUTED — OWNER WAIVED**, carried verbatim | nothing in this phase may be reported as screen-reader evidence |

### The procedure, short and in order

```bash
npm run test:e2e:online -- e2e/online-phase-2s-attention.spec.ts --project=desktop
```

It **skips itself** when `ONLINE_SUPABASE_URL`, `ONLINE_SUPABASE_SERVICE_ROLE_KEY`
and `ONLINE_SUPABASE_PUBLISHABLE_KEY` are absent, so a run with no credentials
reports nothing rather than reporting a pass.

Then the phone, on the real device, at `/app` and `/app/notifications`:

1. The row's **Abrir**, the primary action and **Mais ações** are all thumb
   reachable, and nothing scrolls sideways.
2. Opening the compact menu **does not cover the row it acts on**.
3. Choosing *Silenciar por um tempo* and a date states **how long** before you
   confirm.
4. Tapping a date field does **not** zoom the page.
5. On *Precisa de você* at `/app/inbox?view=needs-you`, the **Avisos** chip is
   reachable and readable, and the chip row wraps instead of scrolling.

---

## 8. What this slice does NOT claim

| | |
|---|---|
| any rendered-page proof | **performed** — §10. This row read *not performed* when the slice merged. |
| a screen-reader run | **not performed**, and waived. The announcement contract is asserted in the accessibility tree, which is not the same thing. |
| `2S-MOBILE-003` | **HELD 2026-08-27 on the owner's iPhone**, five named items, all reported passing — §11. This row read *still not performed* until then. |
| the notice the checkpoint acted on | **planted, not produced.** It carried the heartbeat's exact shape, but the heartbeat did not write it — §11. |
| `/app/notifications` on the device | **not walked.** The five named items reach `/app` and `/app/inbox?view=needs-you`; the history page was measured at 320px and 375px by the lane, and a viewport is not a device. **Recorded open.** |
| a PWA-shell or software-keyboard proof | **none**, and none is claimed. |
| a hosted write beyond the lane | **one**, authorized explicitly: the planted notice, deleted by id afterwards. No migration, no BYOK credit, no signup change, no rollout change, no push work, and no AI call by this work. |

---

## 9. Classification — deliberately deferred

**No requirement is classified in this record.** `2S-CLOSE-001` puts
classification in slice 2S.4, from a generated matrix that *refuses rather than
emitting a partial one*, and `2S-CLOSE-009` forbids discharging a hardware proof
with a document. Eleven of this slice's twenty-two requirements are waiting on a
lane nobody has run and on a device nobody has held; classifying them now would
be the over-claim the whole closeout apparatus exists to refuse.

**A lane that has not been run proves nothing, and a document saying it would
have passed proves less.**

---

## 10. The hosted run — and the seven defects it found

The owner authorized one execution against the hosted project, with a disposable
account and synthetic fixtures. It was run on **2026-08-26**:

```
npm run test:e2e:online -- e2e/online-phase-2s-attention.spec.ts --project=desktop
Running 18 tests using 1 worker
  18 passed (2.7m)
```

**Green means all eighteen ran.** No skip, no retry, no `--grep`. It took three
attempts to get there, and each attempt is the reason this section exists.

### The first attempt proved nothing, and said so

It timed out waiting for the local `webServer`. **No test executed and no
hosted row was written** — confirmed against the database, which was byte-identical
to the pre-run baseline.

### The second attempt reported 13 passed / 5 failed. Twelve of the thirteen were false

`/app` was serving its **error boundary**, and an error page satisfies almost
every measurement this lane makes.

### The defects, in the order they were found

1. **THE PRODUCT WAS BROKEN FOR EVERY OWNER WITH AN UNANSWERED NOTICE.**
   `isOwnerScopedDestination` was exported from `notice-open-control.tsx`, which
   carries `"use client"`. The directive marks the **module**, not the export, so
   `attention-notice-row.tsx` — a Server Component — could not call it:

   > Attempted to call isOwnerScopedDestination() from the server but
   > isOwnerScopedDestination is on the client.

   `/app` fell into its error boundary. **Nothing caught it and nothing could
   have:** jsdom renders a Server Component and a Client Component as the same
   function in the same bundle, so all three hundred of this feature's component
   assertions passed. The boundary exists only when Next draws it.

   The predicate is pure — no hooks, no DOM, no I/O — so the fix is not to move
   the caller but to stop the function claiming a side it does not need. It now
   lives in `destination.ts`, a module with **no directive**, usable from both.
   `notice-open-control.tsx` does **not** re-export it: the first draft of the
   fix did, and a re-export is the same trap left open, because the predicate
   would still be reachable *through a client module*.

   `src/lib/closeout/rsc-boundary-guard.test.ts` is the executable guard this
   repository lacked — a server module may **render** a value imported from a
   client module and may never **call** one. Its mutation control restores the
   old import and it fails by name.

2. **Thirteen passes over an error page — including a scan that skipped itself.**
   axe finds no serious violation on an error page; an error page does not
   scroll sideways; and the menu scan called `test.skip` when it found no
   trigger, so the lane reported a pass for the surface it had most failed to
   measure. Every `visit` now refuses `[data-ux-state="error_recoverable"]` **and**
   the boundary's own heading, read from the copy the component actually renders
   — the first draft guessed *"algo deu errado"*, which appears nowhere in this
   product, and **a detector that cannot fire is the same thing as no detector**.
   The skip is gone; a missing trigger is a failure, which is what it always was.

3. **One surface's selector was applied to all three.** `expectNotices` asked
   `/app/notifications` about `.notice-attention-row`, which that page has never
   rendered — it renders `li.list-row.notification-row`, and **three** rows where
   the attention surface renders two, because the collapse by subject is the
   attention surface's rule and not the history's. Four tests reported *"the page
   is empty"* about a page that was full. Each surface now carries its own
   `rowSelector`, and the menu trigger is taken from **inside** that surface's
   row.

4. **`2S-ATTENTION-006` was a coin toss measuring the wrong object.** It opened
   `.first()` — and all three notices are inserted by one statement, so they
   share a `created_at` and the read orders by `created_at desc` with no
   tiebreaker: which subject led the page was undefined. It then asserted
   `count === before - 1`, which is a claim about the **projection**, not about
   the write. The fixture deliberately gives one subject **two** unanswered
   notices, so marking one of them seen is a completely correct write that leaves
   the row exactly where it was. `expected 1, received 2` was accusing the product
   of being right.

   The test now opens the row whose subject has exactly **one** notice, and reads
   the notices back **from the database** either side of the interaction: exactly
   one moved to `read`, and it is the one the row carried. That read runs at the
   moment the destination URL is on screen and **does not retry**, so it also
   proves the order the control promises — a control that navigated before its
   write finished would be caught there, not tolerated.

5. **The lane declared no describe mode.** `playwright.config.ts` sets
   `fullyParallel: true`, so on twelve cores the eighteen tests went to **six
   workers**; each worker evaluates the describe body of its own, so
   `crypto.randomUUID()` ran six times and the lane created and deleted **six
   disposable accounts** rather than one. It also made the file's own stated
   ordering a fiction, since `2S-ATTENTION-004` clears and re-plants. Now
   `test.describe.configure({ mode: "default" })` — one worker, declaration
   order, and deliberately **not** `"serial"`, whose skip-after-failure would
   turn a finding into a silence.

6. **The fixture indexed an append-only array.** `plantNotices` read `taskIds[0]`
   and `[1]`, so the second planting created two tasks it never referenced and
   hung its notices back on the first two. Nothing failed, which is exactly why
   it survived a run: two hosted rows written for nothing.

7. **The new guard had a blind spot in its own classifier.** It decided a module
   was client code by reading the first non-empty **line**, and three modules
   here open with a docblock and declare the directive after it —
   `deletion-surface.tsx`, `consent-surface.tsx`, `account-state-surface.tsx`.
   All three were filed as **server** modules, which blinds the guard twice: a
   value imported from one of them and called would never be flagged, and the
   three were scanned under a rule that does not apply to them. It reads the
   first **statement** now, from the comment-stripped source, and a fourth
   assertion fails if any module carrying the directive is ever filed as server
   code again.


### An eighth defect, found by CI rather than by the run — and latent on `main`

This branch's first CI failed two assertions in
`notification-row-actions.test.tsx`, and **neither is this branch's doing.**

`2S-ACCESS-002`'s tests typed a date computed by `isoDaysFromToday`, which read
`new Date()` in the **host's** zone, while the component derives its day count in
the **owner's** — `localDateOf(new Date(), timeZone)`, which is where slice 2S.3
already moved it after `LDC-GUARD-001` caught the same mistake in the product.
The two frames agree for twenty-one hours a day and disagree for three. CI ran at
**00:26 UTC**, where São Paulo was still on the previous day, so the test typed
*tomorrow* by its clock and the component read *the day after tomorrow* by the
owner's: `2 dias` where the test wanted `1 dia`.

It was **latent on `main`** — slice 2S.3 merged at 13:35 UTC, outside the window —
and this branch's timing is the only reason it surfaced. The fix states the
test's dates in the owner's zone, through the same `localDateOf`/`addLocalDays`
contract the component walks, and names that zone once so the render and the
arithmetic cannot drift apart.

**Proved rather than assumed, in both directions.** The whole suite was re-run
with `TZ=UTC`, which reproduces CI's condition exactly on this machine — the host
reads 2026-08-27 while São Paulo reads 2026-08-26. The old `isoDaysFromToday`
fails **those two assertions and no others** under it; the new one passes, and so
does everything else: **9 662 assertions, zero failing.**

**A test that reads a different clock than the product is not measuring the
product** — and a suite that only ever runs in one zone cannot tell you which
clock it read.

### Residue, proved after `afterAll` and not before

A snapshot of **all 59 `public` tables** was taken before the run and again after
it. They are **identical, row for row** — including `notifications` (57),
`tasks` (8), `audit_logs` (331), `product_events` (517) and `heartbeat_runs`
(763). `auth.users` is **2**, both real and pre-existing; accounts matching
`codex-2s3-%@example.com` are **0**, as are any matching `%@example.com`. Tasks
titled `Pagar o aluguel` / `Enviar o contrato`: **0**. Notices keyed
`stale:%:2026-01-02`: **0**. `audit_logs` and `product_events` written in the
last three hours: **0**.

The 54 notices titled *Tarefa sem movimento* are the pre-existing `task_stale`
rows of the two real accounts — slice 2S.0's census counted 54 of 57 — and not
residue. **No personal content was read: only counts and predicates over
synthetic values.**

**Nothing else was touched.** No migration (the phase's one migration was spent
by slice 2S.1; hosted parity remains `202608240102`, 102 local = 102 hosted), no
AI call, no BYOK credit, no signup change, no rollout change, and push was not
resumed, repaired or claimed.

---

## 11. The device checkpoint, held — and the account that had nothing to check

`2S-MOBILE-003` was held on **2026-08-27**, on the owner's own iPhone, against the
**deployed production build `6d38edc`** — not a lane, not a preview, not an
emulated viewport. The owner reported **all five named items passing**.

### It could not start, and the reason is worth more than the checkpoint

The owner opened `/app`, found *Precisa de você* holding exactly one row, and
asked where *Mais ações* was. **There was no notice on the surface.** The row they
were looking at was **entry-derived** — *"O MICHAEL PROPÕE … Resolver
sugestões"* — from a capture made two minutes earlier. That section holds more
than one kind of item, and only the notice rows carry *Abrir*, a primary action
and the compact menu.

Measured rather than guessed: of the two real accounts, **all 57 unread notices
belong to the other one**. The owner's account had **zero**, and the checklist in
§7 had been handed over without checking which account would open it.

**The silence was the product working.** The owner's quiet hours are
**22:30 → 07:00** and it was 23:19, so the heartbeat produces nothing by design.
Beyond that, `run_user_heartbeat` writes `task_overdue` only for a task past its
`due_at` — the owner had none — and `task_stale` only for a task with **no**
`due_at` left untouched past a priority-dependent threshold: 0 days urgent, 2
high, **7 normal**, 15 low. Exactly one of the owner's tasks has that shape, its
priority is unset, and it had been idle for under four days. **Nothing was
broken; there was simply nothing worth saying.**

### What it cost, and what it makes this record

The owner was given three routes — sign in to the account that has notices, mark
a task urgent and wait for the morning tick, or have one notice planted — and
**chose the planted notice**, explicitly.

One row was written to the owner's real account: `task_stale`, `unread`, normal
priority, `dedupe_key` `stale:{task}:{local date}` and `action_url`
`/pt-BR/app/work/{task}` — **the exact shape the heartbeat writes**. It pointed at
one of the owner's own tasks, and the body was copied **inside the SQL statement**
so the task's title never left the database.

**So the row was a fixture, and this record says so rather than implying the
product produced it.** What the checkpoint therefore proves is what
`2S-MOBILE-003` asks — *a person, the device, the named list* — over a notice of
the right shape. It does not prove the heartbeat's cadence, which is slice 2S.2's
pgTAP suite's job and is proved there by calling the function.

**Nothing else was written, and the owner touched no control that writes.**
Verified before deletion: the notice was still `unread`, so *Abrir* was never
tapped; `notification_suppressions` was **0**, so the silence panel was previewed
and cancelled rather than confirmed; the subject task was untouched and no
`undo_operations` row appeared. The notice was then deleted by id.

### Residue, itemised rather than asserted

`notifications` is back to **57**, and `tasks`, `notification_suppressions` and
`undo_operations` are unchanged. Of the 59 `public` tables, **50 did not move at
all**. The nine that did are **the owner's own use of their own product**, not
this work:

| table | Δ | what it is |
|---|---|---|
| `entries`, `jobs`, `entry_interpretations`, `entry_embeddings` | +1 each | the capture the owner made at 23:17 and the async pipeline processing it |
| `ai_usage_events` | **+2** | that capture's extraction and embedding — **calls the product made on the owner's own entry** |
| `audit_logs` | +2 | the same pipeline's audit rows |
| `product_events` | +11 | the owner's navigation during the checkpoint |
| `heartbeat_runs` | +8 | four hourly `pg_cron` ticks × two real users |
| `rate_limit_events` | +1 | the owner's session |

The two AI calls are named here deliberately: this session was under a *no AI*
constraint, and it held — those calls belong to the owner's capture, not to the
work.

### What the checkpoint does NOT cover

- **`/app/notifications` was not separately walked on the device.** §7's prose
  named that surface, and the five enumerated items reach `/app` and
  `/app/inbox?view=needs-you` only. The automated lane measured the history page
  at 320px and 375px, but that is a viewport and not a device. **One more pass
  would close it**, and it is recorded as open rather than counted as done.
- **`2S-ACCESS-005` (VoiceOver) stays NOT EXECUTED — OWNER WAIVED.** Nothing in
  this phase may be reported as screen-reader evidence.
- **The heartbeat producing a notice on the owner's own account** has not been
  observed end to end on the device, because the checkpoint used a planted row.

**A checklist handed over without checking whose account will open it is a
checklist about somebody else's data.**
