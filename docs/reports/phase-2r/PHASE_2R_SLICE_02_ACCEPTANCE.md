# Phase 2R — Slice 2R.2 acceptance record

**This one, or all of them: scope, cancellation, and an undo that spends once.**

**This record is late, and that is the first thing it should say.** Slice 2R.2
merged as `8c13c7be963889f6afadd9f145b9f3cd2b1ceadc` with CI green 3/3 and no
acceptance record beside it. The traceability contract requires five — *"the
five slice acceptance records under `docs/reports/phase-2r/`"* — and says
classifications come from them rather than from a PR body. The classification
below is the same one PR #295 carried; what was missing was the file the
generator reads, and this is it.

- **Authorization:** ADR-133 (implementation, slices 2R.0 … 2R.5).
- **Requirements:** `2R-SERIES-001` … `-009`, `2R-TIME-005` … `-007`
  (12 here; **31 of 73 cumulatively**).
- **Migrations: none created.** 101 before, 101 after. Parity `202608230101`
  untouched. Budget stays **1 allocated · 1 spent · 1 created**.
- **Baseline:** `main` `406191dc1aa92cbc98b8b57724c10437e6edabad`, CI green 3/3
  on that exact merge SHA.
- **Merged:** `8c13c7be963889f6afadd9f145b9f3cd2b1ceadc`, **CI green 3/3 on the
  merge SHA** and on the head `2043250` before it.
- **Hosted writes: none.** Every hosted interaction in this slice ran inside a
  transaction that ended in `rollback`.
- **AI calls: none. BYOK credit spent: none.**

---

## 1. The re-audit that came before the code

`2R-UNDO-LEDGER-NOT-CLOSED` entered this slice as a **reading**. It leaves as a
measurement, taken against the deployed database with three controls:

| control | result |
|---|---|
| **positive** — the first undo | succeeds, `affected: 1`, and the ledger row stays `available` |
| **negative** — an immediate replay | refused, `55P03`. The staleness guard is real, so the defect is not "there is no guard" |
| **repetition** — apply the same command again under a new key, then re-spend the **first** undo | **succeeds.** Two `reminder_command_undone` audit rows, both ledger rows still open, and one operation's compensation spent on another operation's change |

A census bounds it: of **twenty** registered action types, **exactly one** fails
to close its row — `apply_reminder_command_v1`. Both 2R handlers close theirs and
reach the router's idempotent branch on the second press.

**That is why this was not a stop condition.** Slice 2R.2 consumes the
already-correct path and offers no undo through the defective one. Repairing the
Phase 2P handler is DDL on a deployed `SECURITY DEFINER` body, and
`revoke insert, update, delete on public.undo_operations from authenticated`
closes the Server-Action alternative — so it stays a named remainder rather than
a quietly widened migration budget.

## 2. The defect the pgTAP rehearsal found

There is no local Docker, so the suite could not be run here. §119's rule — *a
rehearsal that never calls the front door proves neither the code nor the file* —
was answered by transforming all **26** assertions mechanically out of the file
and running them against real Postgres inside a rolled-back transaction.

It found three things:

1. a `\gset` idiom **no other suite in this directory uses**, removed before it
   could fail from empty the way 2R.1's helpers did;
2. assertion 25 expecting `22023` where `Series not found` raises `P0002`;
3. **`undo_operation` on a cancelled occurrence does not restore it — it raises
   `23505`.**

The third is new: **`2R-OCCURRENCE-CANCEL-IRREVERSIBLE`**. Cancelling an attached
occurrence materialises the replacement, the replacement takes the one live slot
`reminders_one_live_occurrence_per_series` permits, and the cancelled row can no
longer be reactivated — **not by the ledger undo and not by the `restore`
command**. This suite's first draft asserted the opposite, in prose, with total
confidence.

Bounded in both directions by execution: the same `restore` **succeeds** on a
detached occurrence (the materialisation trigger skips it) and on an ended series
(the trigger returns early). Attached-and-active is the whole of the failure.

It made a shipped sentence false — `cancelConfirmBody` promises *"pode ser
reativado depois"*. Repaired in code, no migration:

- the surface withholds `Reativar` on exactly that shape, computed from a second
  owner-scoped query because the replacement is usually **not** on the same page
  as the row it replaced;
- the confirmation names the consequence before it asks — `2R-SERIES-008`;
- `23505` on that constraint gets its own sentence, matched on the constraint
  **name** rather than the SQLSTATE, because the table has other unique indexes.

## 3. What the surface does

- Offers *Somente esta ocorrência* and *Esta e as futuras*, narrower
  pre-selected (`OD-2R-4`). **A pre-selection is not a mutation**: three cases
  assert that opening the panel, changing the answer and closing it again write
  nothing.
- Submits a **word from a closed set**; `commandForScope` is the only place it
  becomes a command name, so a label cannot be wired to the wrong command.
- Reports the scope the **database applied**, driven apart from the requested one
  in a test.
- Keeps the undo offer **above the list**: ending a series cancels the live
  occurrence, so the row carrying the control is gone after revalidation — and
  the button would go with it.
- Shows the detached badge, which is what makes `2R-SERIES-004` observable rather
  than merely true.

## 4. Evidence

- `supabase/tests/phase_2r_series_scope.sql` — **26 assertions**, four sections,
  each undo pressed twice with the ledger read in between. Passed on its **first
  real CI run**, from an empty database.
- `series-controls.test.tsx` (17 at merge), `series-actions.test.ts` (14), plus
  new cases in `projection`, `lifecycle`, `outcomes` and `reminder-list`.
- `e2e/online-phase-2r-series.spec.ts` — eight authenticated journeys. The series
  is seeded through `create_reminder_series_v1` with the **owner's own token**,
  never the service role, because the creation control was slice 2R.3's.
  **Manual lane.**
- **Six mutation controls**, each verified to have landed before the run.

## 5. The methodological finding

**Three mutation controls "passed" and proved nothing.** The first attempt
rewrote the files with LF-delimited patterns; the worktree is CRLF, so none of
the three replacements matched and all three tests kept passing against
unmodified source. Re-run per line with the mutation's arrival verified first,
all six fired.

*A mutation control that does not assert the mutation landed is a control of
nothing.*

## 6. Classification

| Requirement | Class | Evidence |
|---|---|---|
| `2R-SERIES-001` | **built** | §3 — both scopes offered, narrower pre-selected, three no-write cases |
| `2R-SERIES-002` | **built** | pgTAP §8 (2R.1 suite) — the rule is unchanged after a detach |
| `2R-SERIES-003` | **built** | pgTAP §8 — the rule moves and earlier occurrences keep their values |
| `2R-SERIES-004` | **built** | pgTAP §8, plus the badge that makes it observable on screen |
| `2R-SERIES-005` | **built** | pgTAP §8 — ended, with every past occurrence still present |
| `2R-SERIES-006` | **built** | `phase_2r_series_scope.sql` §1 — six assertions, the series still active and the next one materialised |
| `2R-SERIES-007` | **built** | `phase_2r_series_scope.sql` §2 — pressed twice, `status = 'undone'`, second press idempotent with `affected: 0` |
| `2R-SERIES-008` | **built** | §2 — occurrence cancellation names its consequence before it asks, and is offered no undo it cannot honour |
| `2R-SERIES-009` | **built** | §3 — the applied scope is read from the RPC, driven apart from the request in a test |
| `2R-TIME-005` | **baseline** | the second surface reads the page's one zone-bound formatter; no second authority added |
| `2R-TIME-006` | **baseline** | no browser zone is read; the wall clock crosses the boundary and the database resolves it |
| `2R-TIME-007` | **built** | no instant is computed client-side; `2R-SERIES-*` instants are the RPC's |

**Twelve classified here; 31 of 73 cumulatively.**

## 7. What this slice deliberately did not do

No migration. No change to the heartbeat, quiet hours, the daily cap, the
24-hour cooldown or the per-user lock. No recurring tasks and no `RRULE`. No AI
call and no BYOK credit. No creation surface — that is slice 2R.3. Signup stays
closed and the rollout gate is untouched. `2P-ACCESS-005` stays **NOT EXECUTED —
OWNER WAIVED**.

**One stop condition was evaluated and not reached.** The plan says an operation
found to have no real undo becomes an explicit confirmation under
`2R-SERIES-008`, reported rather than absorbed. That is exactly what happened to
occurrence cancellation, and §2 is the report.

## 8. Remainders carried

- **`2R-OCCURRENCE-CANCEL-IRREVERSIBLE`** — *new*. Needs DDL, so a future phase's
  migration. Pinned in both directions in `phase_2r_series_scope.sql` §3.
- **`2R-UNDO-LEDGER-NOT-CLOSED`** — measured, not repaired. Exactly 1 of 20
  handlers. Pinned on the detached case, which is the one where the undo actually
  succeeds.
- **`2R-TZ-SECOND-AUTHORITY`** — routed by ADR-134.
- **`2R-TASK-RECURRENCE`** — out by `OD-2R-6`.
- **`OD-2R-9`'s two defects**; **the interval gap**, refusal still pinned.
- Unchanged: `2P-ACCESS-005`, `2P-ATTENTION-008`, `RG-DEP-3`,
  `2P-CHAT-007-JOURNEY`, ADR-055 expiring 2026-10-27.
