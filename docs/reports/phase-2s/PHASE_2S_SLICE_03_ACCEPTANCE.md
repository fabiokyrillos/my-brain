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
- **Hosted writes: none by me.** The rendered lane this slice writes **plants
  rows on the hosted project when it is run**, and it has **not been run** — see
  §7, which is the whole of the owner checkpoint.
- **AI calls: none. BYOK credit spent: none. Push: not resumed, not repaired,
  not claimed. Signup unchanged. Rollout unchanged.**

**This record stops at the owner's `2S-MOBILE-003` checkpoint**, and everything
below the line marked §7 is what remains.

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

The two surfaces are `/app` and `/app/notifications`. **Both are behind a
session.** `e2e/phase-2o-mobile-accessibility.spec.ts` proves the rendered floor
in CI and reaches only the **public** routes, precisely because those are the
ones reachable without one — its own header says so.

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
| **the rendered authenticated lane** | **NOT RUN** — §7 |

---

## 7. THE OWNER CHECKPOINT — what is not done, and what it needs

`2S-MOBILE-003`: *"The owner validates this phase's surfaces on their own
device. A person with the device, on a named list of items. **No automated lane
substitutes**, including an emulated WebKit project."*
`2S-CLOSE-009`: *"A hardware proof is never discharged by a document."*

**Nothing below has been performed, and no part of this record claims it was.**

| item | state | why it needs the owner |
|---|---|---|
| `e2e/online-phase-2s-attention.spec.ts` | **written, never executed** | it needs the hosted project's credentials, and running it **writes to production**: it creates a disposable account, plants a task and three notices, and deletes the account afterwards |
| `2S-ATTENTION-001` · `-003` · `-004` · `-005` · `-006` | **awaiting that lane** | each names the rendered page |
| `2S-ACCESS-004` (axe) | **awaiting that lane** | axe on the real routes, menu closed and open |
| `2S-MOBILE-001` · `-002` · `-006` · `-007` | **awaiting that lane** | the rendered page at a phone viewport |
| `2S-MOBILE-003` | **awaiting the owner, on their device** | no lane substitutes |
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
| any rendered-page proof | **not performed.** §7. |
| a screen-reader run | **not performed**, and waived. The announcement contract is asserted in the accessibility tree, which is not the same thing. |
| `2S-MOBILE-003` | **the owner's, on their device.** |
| a hosted write by me | **none.** The lane writes when run; it has not been run. |

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
