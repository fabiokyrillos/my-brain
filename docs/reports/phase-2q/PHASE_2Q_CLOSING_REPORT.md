# Phase 2Q — Closing report

**Evidence: the record behind the claim. Closed 2026-08-21 by owner validation on
their own device.**

The phase existed for one sentence the owner wrote: *"se a revisão disser que eu
concluí a tarefa X, deve existir um link para a tarefa X real."* **They have now
confirmed it, on their own device, with a review their own credential paid for.**

- **Authorization:** ADR-126 (planning) → ADR-127 (eight decisions signed) →
  ADR-128 (implementation) → ADR-129 (one premise corrected, append-only) →
  **ADR-130 (closure)**.
- **Requirements:** **42 declared · 42 classified · 0 unclassified.**
- **Migrations:** **1 allocated · 1 spent · 1 applied.** Parity `202608210100`,
  **100 local = 100 hosted**.
- **The agent made no AI call at any point.** The single call in this phase was
  the owner's, at checkpoint item 1.

---

## 1. The owner's checkpoint — eight items, all approved

Recorded explicitly, in the owner's own terms:

| # | Item | Verdict |
|---:|---|---|
| 1 | A new review generated, **with its sources** | **approved** |
| 2 | The task link **opened the correct task** | **approved** |
| 3 | The record link **opened the correct record** | **approved** |
| 4 | A historical review **showed the correct message** | **approved** |
| 5 | A removed source **degraded with no broken link** | **approved** |
| 6 | **No preview, title, excerpt or reveal button appeared** | **approved** |
| 7 | Mobile layout | **approved** |
| 8 | Contrast in Safari, dark mode | **approved** |

### `2P-REVIEW-CITATIONS` is DELIVERED

Open since Phase 2P. ADR-125 Decision 4 set the bar precisely: it is delivered
when a review **on the owner's own device** offers a working link to a real
record — and *"a 'Fontes' section without canonical links in it is still not
delivery"*.

**Items 1, 2 and 3 are that bar, met.** It is delivered **by real owner
validation**, not by an agent run and not by a green pipeline.

---

## 2. The evidence the owner's run produced, which no agent run could

The real producer's end-to-end proof was **UNSPENDABLE** for the agent
throughout — a paid call against the owner's BYOK credential, forbidden by
ADR-128 Decision 5. The owner's checkpoint spent it, and the artifact it left on
the deployed database was then read **for shape only**: no title, no content, no
identifier of any cited record.

| Property of the owner's real review | Value | What it proves, at the real boundary |
|---|---|---|
| Envelope version | `2026-08-09.1` | the producer writes the contract's envelope |
| Declared reach | **`["entry","task"]`** | `REVIEW_REACH`, **not chat's** — the two callers really did stay separate |
| Evidence state | `evidenced` | retrieval found material, recorded as a fact rather than as a count |
| Cited type | **`task`** | **`2Q-CITE-007` at the real boundary**: a task is stored **as a task**, by the real producer. This is the exact defect the phase existed to prevent |
| Reference key set | **`id, sourceId, support, type`** | **`2Q-CITE-006` at the real boundary**: exactly four identifier fields, **no content-bearing key** |
| Reviews with an envelope / without | 1 / 1 | **`2Q-CITE-008` observed in production**: the pre-phase review carries `[]` and is not retroactively described as having found nothing |

**The agent still made no AI call.** It read the shape of what the owner's call
produced, which is a different act and is recorded as such.

---

## 3. What was built, slice by slice

| Slice | Merge SHA | CI | What changed |
|---|---|---|---|
| 2Q.0 | `e3a3668` | 3/3 | the five findings re-proved, **two by executing the defect** |
| 2Q.1 | `c7c8db0` | 3/3 | **the one migration**; `generateReview` stops calling a task a memory and stops discarding the references |
| — | `553b538` | 3/3 | the deployment record; **parity `202608210100`** |
| 2Q.2 | `57e812a` | 3/3 | **the slice the owner asked for** — the `(type, id)` gate, the content-free source list, the link that lands |
| 2Q.3 | `a67a34c` | 3/3 | removed / unreadable / foreign / never-existed as **one asserted equality** |
| 2Q.4 | `198591c` | 3/3 | the lane defect corrected; **CI widened to WebKit** |
| 2Q.5 | `e64e2c1` | 3/3 | 42/42 classified, generated or refused |
| §112 | `4c3f49c` | 3/3 | the durable handoff record |

**Every SHA is an ancestor of `main`, and CI is green 3/3 on each — verified
here, not carried forward.**

---

## 4. The matrix

**42 declared · 42 classified · 0 unclassified.** Regenerated at closeout,
**byte-identical** to the merged file — the generator is deterministic and no
count was edited by hand.

| Class | Count |
|---|---:|
| `built` | 36 |
| `baseline` | 6 |
| `partial` | **0** |
| `not-built-by-rule` | **0** |
| `undelivered` | **0** |

The six `baseline` rows — `2Q-CITE-005`, `2Q-LINK-003`, `2Q-LINK-005`,
`2Q-TRUST-005`, `2Q-ACCESS-002`, `2Q-ACCESS-003` — are properties that **already
held** and were re-proved. `2Q-ACCESS-002` and `-003` are `baseline` because
ADR-129 Decision 7 says so: the surfaces were already correct and **no product
fix was made**; `built` would claim a change that did not happen.

---

## 5. Threats, dispositioned again at closeout

All twelve **CLOSED**; `PHASE_2Q_THREAT_DISPOSITION.md` carries the control and
the test for each. Re-checked here against the owner's own artifact:

| Threat | Re-confirmation at closeout |
|---|---|
| **T-4** — the envelope becomes a content store | the owner's real review carries **exactly four keys**, none content-bearing |
| **T-10** — the feature ships and silently does nothing | the owner's real review cites a **`task`**, and item 2 opened the correct task |
| **T-7 / T-7b / T-7c** — content, shape-disclosure, reveal control | **item 6: no preview, title, excerpt or reveal button appeared** |
| **T-1 / T-2 / T-3** — fabricated, name-matched, wrong-surface links | items 2 and 3 opened the **correct** objects |
| **T-5 / T-6 / T-8 / T-9** | item 5: a removed source **degraded with no broken link** |

**Three residuals, named and not absorbed:** the destination page still renders
its own content under its own rules (intended); the dark scan on real routes
stays a later initiative; and `2P-ACCESS-005` stays waived — below.

**The seven inherited properties are re-proved unweakened**, including
`sensitivity-convergence.test.ts` with its reviews file list **byte-pinned** and
deliberately **not** widened.

---

## 6. What is NOT closed, stated so it cannot be absorbed

| Item | Status | Why it stays open |
|---|---|---|
| **`2P-ACCESS-005` (VoiceOver)** | **WAIVED, NOT PASSED** | Item 8 approved **contrast in Safari**, which is not a screen-reader test. Nothing in this phase — including a lane that now runs on WebKit — is screen-reader evidence, and the waiver **does not move** |
| **`2P-ATTENTION-008`'s back-navigation half** | open, and **narrower than Phase 2P recorded** | slice 2Q.0 re-audited it: refresh **is** proved in a browser; back navigation is proved nowhere. Phase 2Q did **not** discharge it. Destination: the owner |
| **`RG-DEP-3`** | open | a rollout matter, and **it cannot be closed by writing a file**. This report does not |
| **Push HTTP 403** | not resumed | external and hardware |
| **`2P-CHAT-007-JOURNEY`** | unspendable | unchanged by this phase |
| **`2P-AUTONOMY-005/-006/-007/-008`** | `not-built-by-rule` | ADR-123 Decision 3's fail-closed set, untouched |
| **`2P-REMINDER-RECURRENCE`, `2P-CALENDAR-MONTH-TELEMETRY`** | refused by name | by the decisions that refused them |
| **The dark scan on real routes** | a later initiative | ADR-129 rejected it for slice 2Q.4 on size. The more robust shape, at the owner's discretion |
| **The four automation review flows** | out | `OD-2Q-8`, a separate initiative |

**Nothing above is silently absorbed, and nothing above is closed by this
report.**

---

## 7. Unchanged, confirmed at closeout

| Property | Verified |
|---|---|
| Signup | **closed** |
| Rollout gate | **25 pass · 3 fail · 2 owner-signature** |
| Migrations | **100 local = 100 hosted**, parity `202608210100`, read live |
| Phase 2Q migrations in the tree | **exactly one** |
| `summaries` policies | **3**, unchanged |
| `summaries` columns | **15** — the fourteen plus the allocated one |
| Hosted residue | **zero**, two-sided: planted (4 markers), removed (all 0), probes proved still able to see |
| Orphan profiles | **0** |
| Automation categories | all six `suggest_only`, no automatic writer |
| Successor phase | **not started, not planned, no directory, no requirement namespace** — named only inside the A13 detector, which is where it belongs |

---

## 8. What this phase taught, kept because it is the useful part

Three findings changed what was built, and every one was found by a control
rather than by reading:

1. **`OD-2Q-5` option C removed a consumer a signed sentence assumed.** ADR-127
   Decision 1 named `resolve-sources.ts`; Decision 5 of the **same ADR** made that
   module structurally unusable here. The vocabulary is shared exactly as signed;
   only the renderer is not.
2. **`2Q-TRUST-005` was satisfiable by nothing happening** — a requirement can
   pass vacuously while its observable says a check *is applied*.
3. **`A11Y-WEBKIT-DARK-CONTRAST` was a defect of the test lane, not the
   product** — and the premise it rested on had been **signed**. Reproducing
   first, as the decision required, is the only reason it was caught before a
   product colour was changed to satisfy a broken fixture.

And six mistakes of mine, each caught by a control and each recorded rather than
tidied away: three wrong intermediate conclusions during 2Q.4; a fixture that
**leaked onto the hosted project** because a teardown guard keyed on a variable
assigned too late; a control that was **true of two blanks**; a count the
generator corrected; an authority guard tripping on its own explanation **four
times**; and an **orphan server answering for the real one** — a trap this
repository had already recorded.

Two things a control found that no plan predicted: `markdown.test.ts` had
**encoded the defect as a passing test**, and the traceability generator **could
not see a family containing digits** — exactly the failure Phase 2K paid for.

---

## 9. Gates at closeout

`lint` clean · `typecheck` clean · `npm test` **0 failed tests** · `build`
succeeds · the accessibility lane green on **three** projects, now including
WebKit in CI · the online suite green on three lanes · zero open PRs · `main`
local = `origin/main` · worktree clean.

**Phase 2Q is closed. The successor is not started.**
