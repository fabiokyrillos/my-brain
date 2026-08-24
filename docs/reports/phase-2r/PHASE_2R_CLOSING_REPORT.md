# Phase 2R — closing report

**Rotina: o que se repete.** Reminders can now repeat, and nothing else in the
product learned to repeat with them.

> **THE PHASE IS NOT CLOSED BY THIS DOCUMENT.** `2R-CLOSE-012` reserves closure
> for an **owner decision recorded as an ADR, after a device checkpoint**, and
> says in terms that a green pipeline is not that. Everything below is ready for
> that decision. Nothing below performs it.

## 1. What the phase delivered

| | |
|---|---|
| requirements | **73 declared · 73 classified · 0 unclassified** |
| classes | 51 `built` · 17 `baseline` · 2 `partial` · 3 `not-built-by-rule` · **0 `undelivered`** |
| migrations | **1 allocated · 1 spent · 1 applied.** 101 local = 101 hosted, parity `202608230101` |
| slices | six, plus two corrective rounds inside 2R.3 |
| owner device checkpoints | **three runs of `2R-MOBILE-003`**, plus the phase's own closing checkpoint, still owed |
| AI calls | none. BYOK credit spent: none |

A reminder can repeat daily, weekly on any set of weekdays, monthly by date,
monthly by ordinal weekday, or yearly. **Exactly one live occurrence exists at a
time for each active series**, materialised by a trigger when its predecessor
completes, so the hourly
heartbeat — its per-user lock, quiet hours, the daily cap and the 24-hour
cooldown — is **unchanged rather than re-implemented**. Every edit asks which
scope it means and defaults to the narrower one. Every write goes through a
`SECURITY DEFINER` RPC; `authenticated` holds `select` on `reminder_series` and
nothing else.

## 2. The five findings worth carrying out of this phase

**Postgres's own `AT TIME ZONE` disagrees with two of the three signed
daylight-saving cases, in opposite directions.** Measured on the deployed
database *before* the migration was written. A migration built on the native
operator would have fired at the wrong time at every transition, silently, and
would have read as obviously correct in review.

**A defect reported as visual was a wrong write.** The second device checkpoint
reported that weekday ticks disappeared when the preview was refreshed. The
preview was computed from the `FormData` captured at submit time and was right;
the save was computed from the DOM React's post-action form reset had emptied,
and would have written **one day where the modal showed three**.

**No modal in this product had ever locked the page behind it, and no backdrop
had ever closed one.** Both belonged to the shared dialog and neither existed —
a census found three horizontal-scroll containers and nothing that touched the
document. Six `ConfirmDialog` consumers and the command palette were all
affected; the reminder modal was simply where the owner noticed.

**Five requirements had taken credit for work nobody did.** The closeout
generator compared delivered classes against declared kinds for the first time
and found `2R-FOUNDATION-001` … `-004` and `-006` filed as `built` when they are
declared `baseline`. The contract had stated the rule since planning — *"baseline
may never be recorded as `built`"* — and **no code had ever read it**. It
survived five slices, three device checkpoints and every green CI run.

**A failing browser test can be accusing the harness.** A scroll-lock journey
failed and drew two speculative product changes, both reverted. `locator.click()`
scrolls its target into view, so Playwright had returned the page to the top
before the lock engaged; the probe that ended it read `body.style.top` as `0px`.
The product needed neither change.

## 3. Inherited remainders — reproduced, none absorbed

`2R-CLOSE-011` requires the audit's §7 list with **no item dropped**:

- **`2P-ACCESS-005`** — **NOT EXECUTED — OWNER WAIVED.** No part of this phase
  may ever be reported as screen-reader evidence, and `2R-ACCESS-005` is
  classified `not-built-by-rule` for exactly that reason.
- **`2P-ATTENTION-008`** — the back-navigation half stays open, mechanism proved.
- **`RG-DEP-3`** — **cannot be closed by writing a file.**
- **`2P-CHAT-007-JOURNEY`** — unspendable.
- **`ADR-055`** — expires **2026-10-27**.

## 4. This phase's own remainders — none discharged

| Remainder | State | Destination |
|---|---|---|
| `2R-TZ-SECOND-AUTHORITY` | eight inline zone sites, and no CHECK on `profiles.timezone` | routed by ADR-134; slice 2R.4 *used* the missing constraint to force a failure, which is not fixing it |
| `2R-UNDO-LEDGER-NOT-CLOSED` | measured, not repaired — 1 of 20 handlers | a later initiative |
| `2R-OCCURRENCE-CANCEL-IRREVERSIBLE` | needs DDL this phase's budget did not have | a later initiative with a migration |
| `2R-AXE-MANUAL-LANE` | axe runs only in the manual lane behind auth | narrowed by the rendered-page CI assertion on public surfaces, not closed |
| `2R-RECURRENCE-LANE-UNRUNNABLE` | slice 2R.3's authenticated acceptance spec cannot execute in the development environment, and opens the composer by the *save* button's label | operations |
| `2R-DRAWER-NOT-LOCKED` | `.ux-detail` declares `aria-modal` and does not lock the page | a design decision for the owner |
| `2R-TASK-RECURRENCE` | recurring **tasks** are out by `OD-2R-6` | priced at +6 to +9 days and a further migration |
| `OD-2R-9`'s two defects | a search that cannot be linked or returned to; the *Precisa de você* filter lost on back navigation | a separate small initiative |
| the interval gap | *every N days* is not expressible; the refusal is still pinned | `OD-2R-2`'s closed set |
| push HTTP 403 | not resumed, not repaired — and now **guarded against being claimed** | operations |

## 5. What is proved where

- **In CI, every run:** the whole migration chain from an empty database, the
  pgTAP suites including recurrence, series scope and delivery, `db lint`, the
  unit suite, the production build, and the foundation journeys on desktop and
  Pixel 7.
- **In a real browser, manually:** the authenticated journeys, including the
  second checkpoint's three findings on desktop, Pixel 7 and iPhone 15 — the last
  on WebKit.
- **On the owner's own hardware:** `2R-MOBILE-003`, three runs, approved at the
  third.
- **Nowhere by automation, and named rather than implied:** the phase's closing
  checkpoint, the axe pass behind auth, and anything about push on a device.

## 6. What the phase deliberately did not do

Recurring **tasks** (`OD-2R-6`). `RRULE` (`OD-2R-2`, refused by name because its
failure mode is silent). More than one materialised occurrence at a time
(`OD-2R-3`). A second migration of any kind (`OD-2R-7`). Any change to quiet
hours, the daily cap, the 24-hour cooldown or the heartbeat. Any AI call. Any
push repair. **Phase 2S is not started, not planned and not named as active.**

## 7. What closing requires

1. the owner runs the phase's closing device checkpoint;
2. the owner records the decision as an **ADR**;
3. only then is Phase 2R closed.

`2R-CLOSE-012` exists so that a green pipeline cannot stand in for any of those
three, and this report performs none of them.
