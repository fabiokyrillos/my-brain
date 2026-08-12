# Phase 2M — slice 2M.5 acceptance record

**Closeout. Zero migrations.** Budget closes at `3 allocated · 3 spent`, all
three non-transferable; a fourth was a stop condition and none was created.
Hosted parity read live and read-only on 2026-08-12: **`202608120092` across 92
migrations, local = remote on every row**. Signup closed. Rollout gate untouched
at **25 pass · 3 fail · 2 owner-signature**.

Executed under **ADR-107**, which amended OD-2M-5's closeout gate so that real
push delivery and Android validation no longer block this slice or the phase.
**That amendment is governance and not a success claim.** Push is implemented and
hosted; it fails on the owner's real iPhone with `HTTP 403` from Apple Web Push;
it has never been executed on Android.

---

## 1. The two surfaces that had never rendered

The slice's declared work was closeout. The first thing it did was execute the
authenticated review journey slice 2M.3 said it owed — and that journey found
that **`/app/reviews` and `/app/calendar/plan` had never worked at all**.

Both pages handed a plain arrow function to a `"use client"` component:

```tsx
scopeHref={(value) => `/${locale}/app/reviews?scope=${value}`}
dayHref={(value) => `/${locale}/app/calendar/plan?date=${value}`}
```

React cannot serialize a function into the RSC payload, so both renders threw and
both routes answered with their error boundary. Measured in a real browser
against the deployment on 2026-08-12, with `/pt-BR/app/calendar` beside them as a
control:

| route | deployed, before this slice |
|---|---|
| `/pt-BR/app/reviews` | **error boundary** |
| `/pt-BR/app/calendar/plan` | **error boundary** |
| `/pt-BR/app/calendar` | renders |

**Nothing in the repository could have caught it.** A component test mounts the
client component directly and hands it a function, which is entirely valid in
that context — `planner-view.test.tsx` does exactly that and is correct. Both
surfaces' browser lanes compose them with `setContent`, which never runs a server
render. The boundary only exists when a real server renders a real page, and
until this slice no test did.

Both were classified **built** in slices 2M.2 and 2M.3 on evidence that could not
see the boundary. They are re-classified **built** below, in this slice, on
evidence that can — and the earlier rows are left in place rather than rewritten,
because the history is the contract working.

**The repair is data, not a workaround.** `scopeHref` was deleted outright — the
view derives `${reviewsHref}?scope=${scope}` from a prop it already had — and
`dayHref` became `dayHrefBase`, the string the closure was closing over.

`src/lib/closeout/client-boundary-serializability-guard.test.ts` is the
structural half: for every `<ClientComponent>` rendered by a server module under
`src/app/`, no prop may be a function literal and no prop may reference a
function the file declares, unless it is an inline Server Action. Its first
version scanned whole files and immediately failed on
`app/reminders/page.tsx`, which hands two local formatters to a **server**
component — legal, shipped, and proved working. **A guard that fails on correct
code is a guard somebody weakens**, so it resolves the receiving element instead.
57 client elements are checked; a mutation control proves each shape fires.

---

## 2. The journey that found it

`e2e/online-day-review.spec.ts` — the remainder slice 2M.3 named in words: *"a
successful carry-forward, the row leaving the list, and the undo."*

Executed against the hosted database on 2026-08-12: **20 passed** across
`online-day-review.spec.ts` and `online-calendar.spec.ts`, on **desktop and
Pixel 7**, in **both locales**, with zero fixture residue. Re-run after the focus
assertions were added: **6 passed**.

It proves, in one journey so no half can pass alone: the carry-forward reaches
`apply_task_command`; the intention moves to the next day **read back in the
account's own zone**; the row leaves the day it was carried out of, which is the
server re-running its query and not a state update; an `audit_logs` row exists
with `actor = user` and `action_type = task_command_applied`; the undo is offered
**outside the row that disappears**; and the undo puts the intention back.

`online-calendar.spec.ts` gained one deliberately shallow case — *the planner
renders at all* — because that is the claim that turned out to be false.

---

## 3. `2M-TIME-007`, and the four surfaces it found

`src/lib/closeout/phase-2m-fixed-offset-guard.test.ts` names eight surfaces and
refuses three hazards in each: a fixed day length, the host's offset, and the
host's zone — including `Intl.DateTimeFormat` with no `timeZone`, read by
brace-depth so a multi-line options object is read whole. Comments are stripped
first, so the page that *documents* the defect is not read as committing it.

It found **four surfaces that still render an instant in the host's zone** — the
same defect slice 2M.3 fixed on the notification list:
`entry-review.tsx`, `inbox-item.tsx`, `needs-attention-item.tsx` and
`technical-details.tsx`, all under `src/features/daily-cycle/`.

They are **recorded rather than repaired**. The repair threads the owner's zone
through two routes, `home-view.tsx`, `needs-attention-list.tsx` and roughly
twenty-seven component call sites — a product change inside a closing commit,
which is how a phase's last change becomes its riskiest. The exemption is
enumerated, its length is asserted, and **each entry is asserted to still carry
the defect**, so the day one is repaired the guard fails until the name is
removed. An exemption that outlives its defect is how a guard's reach shrinks by
accident.

Destination: `docs/initiatives/push-hardware-validation/` §4.

---

## 4. The hardware record, stated in the five states

| line | state |
|---|---|
| `H-4` permission after an explicit gesture, real iPhone | **executed and proved** (run 1) |
| `H-5` real push delivery, real iPhone | **FAILED** — `unauthorized`, `HTTP 403`, twice, the second with `subject: "operational"`; no notification arrived |
| iOS foreground / background / lock screen | **not started** — each assumes delivery works |
| tap destination, deep link | **not started** — same |
| revocation, quiet hours, cap and cooldown observed on a device | **not started** — same |
| Android Chrome, installed PWA | **NOT EXECUTED** — the owner has no Android device |
| VoiceOver / TalkBack | **not executed** |
| `2L-MOBILE-008`, `2L-ACCESS-008` | **still open**, re-stated rather than absorbed |

The deployed sender's configuration self-check, read by the owner at no cost to a
device, answered `subject: "operational"`, `publicKey: "p256_point"`,
`privateKey: "p256_scalar"`, `pair: "consistent"`. **A consistent pair eliminates
a key mismatch and explains nothing.** No root cause for the 403 is asserted
anywhere in this repository, and none is asserted here.

**No emulated run is recorded as satisfying any line above**, and no further push
was sent.

---

## 5. Classification

| `2M-CAL-010` | **built** | The applied case is executed against the hosted database: reschedule, `audit_logs` with `actor=user` and `action_type=task_command_applied`, the undo offered where the operation happened, and the date put back — `online-calendar.spec.ts`, 20 passed on desktop and Pixel 7 in both locales |
| `2M-ACCESS-003` | **built** | Focus restoration proved on an authenticated route, which is what slice 2M.1 said it could not reach: the outcome region is focused when the round settles, and focus is still somewhere deliberate after the undo removes the button that was pressed |
| `2M-REVIEW-003` | **built** | Re-proved on evidence that can see the server render. Carry-forward reaches `apply_task_command` through `applyTaskDetailCommand`; the earlier row was true of the code and could not see that the page never rendered |
| `2M-REVIEW-005` | **built** | The outcome is truthful and undoable, executed end to end: the intention moves, the row leaves the day, the undo puts it back — read back in the account's own zone rather than in the runner's |
| `2M-PLAN-004` | **built** | The planner renders at all, proved in a real browser against the hosted database. It had answered with its error boundary since slice 2M.2 shipped it |
| `2M-TIME-007` | **partial** | The guard names eight surfaces and refuses a fixed day length, the host's offset and the host's zone, with mutation controls for each. **Remainder:** four `daily-cycle` surfaces still format an instant with no `timeZone`, enumerated in the guard with their length asserted and each asserted to still carry the defect. **Destination:** `docs/initiatives/push-hardware-validation/` §4 |
| `2M-RECUR-004` | **not-built-by-rule** | OD-2M-7, signed in ADR-105, put recurrence outside this phase with its own separately authorized initiative. The family closes by rule rather than as a partial, and nothing in this phase implements or half-implements it |
| `2M-METRICS-001` | **built** | Migration `202608110090` landed the vocabulary in slice 2M.1 **before any producer existed**, and `phase-2m-telemetry-guard.test.ts` fails the build on a producer naming an event the deployed vocabulary does not admit |
| `2M-METRICS-002` | **built** | One migration widened the event-name CHECK, `private.validate_product_event_properties` and the surface CHECK declaring `calendar` as its own surface; its assertions prove no pre-existing name or surface was lost and every value through the real write path |
| `2M-METRICS-004` | **built** | The property whitelist is the mechanism: no key can hold a title, a description, a name, a chosen date or time, review text, a payload, an endpoint or a subscription, and free-form properties are refused outright |
| `2M-METRICS-005` | **built** | The three measurement questions were stated in the PRD before any producer was written, and every event this phase added answers one of them; an event answering none was not created |
| `2M-METRICS-006` | **built** | Six of six events carry a question, a producer, a writer, a consumer, a test, a negative control and a proof of writability on the deployed project. The budget closes at `3 allocated · 3 spent` and the generator reads the count from `supabase/migrations/` rather than from a sentence |
| `2M-DEVICE-001` | **built** | The lines that cannot be verified in an emulated viewport were named individually in `PHASE_2M_SLICE_04B_ACCEPTANCE.md` §6 **before** the hardware run, and no other requirement claims real-device evidence |
| `2M-DEVICE-002` | **built** | The blocks-slice and blocks-closeout lists exist and are different. ADR-107 amends which gate the closeout list blocks, dated and layered over OD-2M-5 rather than rewriting it |
| `2M-DEVICE-003` | **built** | Checklists exist for iOS Safari and for Android Chrome, naming the OS version, the browser, the exact steps and the expected observation for each item |
| `2M-DEVICE-004` | **partial** | Recorded honestly: `H-5` **FAILED** with `HTTP 403` on a named device and date, Android **NOT EXECUTED**, and no emulated run recorded as satisfying either. **Remainder:** the device evidence itself — delivery, foreground, background, lock screen, tap destination, revocation, and the controls observed on a device. **Destination:** `docs/initiatives/push-hardware-validation/` §3 |
| `2M-DEVICE-005` | **partial** | `2L-MOBILE-008` and `2L-ACCESS-008` are re-stated as still open rather than absorbed; the owner-run session they needed did not happen. **Remainder:** both, unchanged. **Destination:** `docs/initiatives/push-hardware-validation/` §3.5 |
| `2M-ACCESS-007` | **partial** | A real screen reader is owner-run and was not run. **Remainder:** VoiceOver on iOS and TalkBack on Android over the notification surface and the five consent states. **Destination:** `docs/initiatives/push-hardware-validation/` §3.4 |
| `2M-CLOSE-001` | **built** | Every declared requirement is classified exactly once from the slice records by `scripts/generate-phase-2m-traceability.mjs`, and `phase-2m-declarations.test.ts` now asserts the committed matrix is byte-identical to what the generator produces, so it cannot be typed |
| `2M-CLOSE-002` | **built** | Every `partial` above carries a real remainder and a destination that is a section of a real document; the generator refuses a vacuous remainder by pattern and refuses a `partial` naming no destination |
| `2M-CLOSE-003` | **built** | `3 allocated · 3 spent`, reconciled against the three files actually present under `supabase/migrations/`; a fourth would fail the generator rather than be absorbed |
| `2M-CLOSE-004` | **built** | Hosted parity read live and read-only on 2026-08-12: `202608120092` across 92 migrations, local = remote on every row, no pending migration |
| `2M-CLOSE-005` | **built** | Every residual leaving this phase has a named destination in `docs/initiatives/push-hardware-validation/`, which is a directory rather than a sentence, and none was closed by writing a document |
| `2M-CLOSE-006` | **built** | The roadmap successor is re-audited against the product as it now stands and **not started**: no successor artifact, no successor requirement, no successor ADR, and the phase-start guard is not retargeted |

---

## 6. Gates

| gate | result |
|---|---|
| `npm run lint` | zero errors |
| `npm run typecheck` | zero errors |
| `CI=1 npm test` | see the closing report — 3 files unparsed on Windows, the known shebang baseline, green in CI |
| `npm run build` | green |
| `deno check` both entrypoints, `deno test supabase/functions/` | green |
| `git diff --check` | clean |
| `npm run test:e2e:online` (day review + calendar) | **20 passed**, desktop and Pixel 7, both locales |
| `npm run verify:edge-parity` | green |
| `npm run rollout:verify` | 25 pass · 3 fail · 2 owner-signature — signup must not open |
| traceability, `--complete` | 94 declared, 94 classified |

---

## 7. What is not proved

- **That push delivers to any device.** It does not on the only device it has
  been tried on.
- **Anything at all about Android.**
- **Anything a real screen reader would report.**
- **The four `daily-cycle` surfaces' timezone rendering**, which is a live defect
  recorded with a destination rather than repaired.
