# Phase 2P — the owner's real-device checkpoint, and what it found

**The owner executed the iPhone checkpoint on 2026-08-20.** This records the
result verbatim, the four defects it produced, and what was done about each.

**Phase 2P is not closed by this record**, and the roadmap successor is neither
started nor planned.

---

## 1. The result, as the owner reported it

| Step | Result |
|---|---|
| 1 – 6 | **APPROVED** on a real iPhone |
| 7 (Relações and the monthly calendar) | **REJECTED** |
| VoiceOver steps 8 – 11 | **NOT EXECUTED — owner waived hardware validation** |

**The VoiceOver waiver is recorded exactly as the owner framed it and is not
rounded in either direction.** It is *not* a pass: no screen-reader evidence
exists, and `2P-ACCESS-005` does not become `built` because a run was waived.
It is also no longer a *blocker*: the owner has decided it is not part of their
use and has released the phase from waiting on it. `2P-ACCESS-005` therefore
moves from `undelivered` to **`not-built-by-rule`**, on this decision, and the
rule is cited in the matrix rather than assumed.

ADR-122 Decision 6 made hardware and VoiceOver the closeout gate. The owner may
release their own gate; nobody else may, and no automated run may be cited as
having satisfied it.

---

## 2. Four defects, each traced to a cause rather than a symptom

### 2.1 The calendar had no page container at all

**Reported:** *"filtros estranhos e pouco claros; elementos e textos muito
próximos das bordas; espaçamento e hierarquia visual ruins; aparência geral de
interface inacabada."*

**Cause.** `CalendarView` rendered `<section className="calendar">` straight into
`<main>`. Every other route in the product wraps in `.content-page`, which
supplies `max-width`, `padding: 58px var(--gutter) 130px` and the mobile
override. Measured before the fix: `getComputedStyle(main).paddingLeft` was
**`0px`**, the title and description sat at **x = 0** on both viewports, and at
1280 px the month grid and the reminders button ran **past the right edge**.

That single omission is the whole of "too close to the edges", the horizontal
overflow, and the content sitting behind the bottom bar.

**Also fixed, in the same surface:**

- **`.calendar-header` had no CSS rule anywhere.** Its `<h1>` inherited body
  size and rendered *smaller than the range label beside the arrows* — the page
  read as if it had no title. `stylesheet-class-coverage.test.ts` had been
  counting this element as unstyled the whole time; a debt counter records that
  something is owed and does not decide what is worth paying first.
- **The control band was thirteen identical pills across five rows, 286 px tall
  on a phone** — over 40% of the viewport before any calendar. It is now a grid
  with two fixed rows, and both chip families show the label they already
  carried as `aria-label`: **Formato** and **O que mostrar**.
- **The reminders link left the band.** A link to another page had been sitting
  among *previous period*, *today* and *next period*, wearing the same pill.
- **The month grid** gained the border, radius and surface fill every other
  block in the product has.
- A stray vertical rule beside the reminders link — a separator that outlived
  the row it separated.

### 2.2 Lembretes depended on Trabalho

**Reported:** reachable only via Trabalho → Calendário → *Todos os lembretes*,
and *"lembretes podem ser pessoais"*.

### 2.3 Revisões was absent from mobile navigation

**Reported:** found only through global search.

**One cause for both.** Slice 2P.5 retired `Mais` from the mobile bar, replacing
one **generic** path to every `more` destination with a set of **specific** ones,
recorded as a census in `capabilities.ts`. Two of those specific paths are
reachable and **not discoverable**: Hoje's link to Revisões is in the *last* of
seven sections, roughly fourteen screens down on a phone, and Lembretes lived
three hops away inside a control band.

**Both census rows were true.** `mobile-reachability-guard.test.ts` proves from
**source text** that each link exists and is unconditional — and a source-text
guard cannot see how far down a page an element sits, how many navigations
precede it, or whether anything names it. **A link that exists is not a link
that can be found**, and that distinction only exists on a rendered page.

**The fix.** Hoje gains a labelled row — *Ir para* — offering **Calendário ·
Lembretes · Revisões**, built from the navigation registry's own hrefs and
labels rather than from literals. One tap from a bar slot, on both viewports.

**A recorded principle is overridden here, deliberately and in the open.**
`capabilities.ts` refuses *"putting a permanent control on the cockpit to satisfy
a census"*. That refusal is right and does not cover this: the driver is not a
census, it is a person who could not find two primary destinations on their own
device. **Arranging the product around its bookkeeping and arranging it around
its owner are different things**, and only the first was refused.

The mobile bar is untouched — still five slots, odd, capture at the midpoint.
Nothing about the data moved: a reminder is still a reminder, with no
relationship to a task or a project.

### 2.4 The Home card compressed a title to one word per line

**Cause: a stale selector list, and the fix that never arrived.**
`operations.css` establishes `container-type` on a list of class names, and that
list read `.list-stack, .dashboard-recent-list`. **`.dashboard-recent-list` no
longer exists anywhere in `src/`** — the Hoje rewrite replaced it with
`.home-list`. So the container query written to stop exactly this defect —
its own comment says *"the reason the owner saw one word per line"* — reached
Registros and never reached Hoje.

And Hoje is where it bites hardest: the closing sections sit in
`.today-columns`, `minmax(0, 1.5fr) minmax(0, 1fr)`, so **both** columns fall
under the query's 700 px breakpoint. Measured at 1920 × 1080: the title got a
**187 px** track and wrapped 94 characters over four lines.

`e2e/layout-contracts.spec.ts` mirrored the same dead classes, so its density
assertions had been measuring a page the product stopped rendering. Repairing
the mirror reproduced the defect immediately.

`home-mirror-guard.test.ts` now **derives** the containment list from the
components and fails in both directions — a dead name in the list, or a live
stack without containment.

---

## 3. A defect in slice 2P.8's own tests

`2P-MOBILE-001` and `-004` navigated to `/app/calendar?o=month`. **The page's
query parameter is `orientation`;** `o` is the key inside the serialized
return-position payload. So `?o=month` fell back to the default and those
assertions measured the **day** view while their names said month.

Everything they asserted was true of what they measured. The label was wrong,
which is the more dangerous of the two: a green run reads as coverage of a
surface nobody exercised. Corrected here, with an assertion that the requested
orientation is the one marked current — the check that would have caught it.

---

## 4. Two probe defects of my own, measured before blaming the product

| Probe reported | What it actually was |
|---|---|
| the calendar title sits 0 px from the edge on `day` and `week`, but not `month` | the subtree was still in **App Router's streaming placeholder** — an unclassed `<div>` under `<body>`, outside `.app-frame`, every ancestor measuring width 0. `month` finished streaming first. Fixed by waiting for real layout, which `toBeVisible` requires |
| Lembretes and Revisões are still several screens down | the destination row was placed **after** the onboarding guide, which is seven steps tall — the same defect moved a few hundred pixels. Moved above it |

---

## 5. Evidence

| Gate | Result |
|---|---|
| `npm run typecheck` | 0 errors |
| `npm run lint` | clean outside gitignored `.worktrees/`; only the pre-existing `costs/page.tsx` warning |
| `npm test` | **8692 passed, 0 failed tests**; 3 failed *files* are the recorded Windows shebang baseline |
| `npm run build` | passes |
| exact CI foundation command | **383 passed, 5 skipped** |
| `e2e/online-phase-2p-device-findings.spec.ts` | **21 passing** across desktop, Pixel 7 and WebKit iPhone |
| `e2e/online-phase-2p-closeout.spec.ts` | **24 passing** after the parameter correction |
| `e2e/calendar.spec.ts` + `e2e/layout-contracts.spec.ts` | **106 passing** on desktop and mobile |
| migrations | **zero**; 99 local = 99 hosted, parity `202608190099` |

Every defect above failed a test before it was fixed, and the mirror guard was
proved to fail in both directions.

---

## 6. Requirement classification

Two classifications move, and each says it is adjudicating so the generator
resolves it rather than reporting a silent conflict. **No requirement is
invented and no new phase is created**: this is a correction inside Phase 2P.

| Requirement | Class | Evidence |
|---|---|---|
| `2P-ACCESS-005` | not-built-by-rule | **Re-classified** from `undelivered` by the owner's waiver of 2026-08-20: *"NOT EXECUTED — owner waived hardware validation"*, on the ground that a screen reader is not part of their use. ADR-122 Decision 6 made this the closeout gate and the owner has released their own gate. **No VoiceOver evidence exists and none is claimed** — the rule records a decision not to run it, never a run. Destination: the owner, if their use ever changes |
| `2P-CALENDAR-005` | **built** | **Re-classified** from `baseline, extended`. Slice 2P.7 recorded the reflow lane as sufficient; the owner's real-device run **rejected step 7**, and the measurement behind it was wrong in a way no lane had checked — the page had no container, `paddingLeft` was `0px`, and at 1280 px the grid and the reminders button ran past the right edge, which is the requirement's own *"clipped actions"*. Now built: `.content-page` wrapper, labelled control band, contained month grid, proved on three browser lanes |

### What is deliberately **not** re-classified

- **The Home "Precisa de você" card is not a Phase 2P requirement's subject.**
  It is a live defect on a surface Phase 2J and 2O built, found during 2P's
  closeout and fixed here. Attaching it to a 2P requirement to make the
  bookkeeping tidy would be the invention the owner forbade; recording it in 2P's
  records as a defect fixed during 2P is the accurate alternative.
- **Lembretes and Revisões discoverability** likewise has no `2P-NAV` requirement
  to move. It is recorded as a correction to the navigation census slice 2P.5
  produced, in §2.2–2.3 above, and `mobile-reachability-guard.test.ts` keeps its
  own claims — which were true — while the new lane adds the one they could not
  make.
- `2P-MOBILE-004` keeps its class. Its assertions were true; §3 records that one
  of them was measuring the wrong orientation and is now measuring the right one.

---

## 7. What the owner still has to check

The corrections need a second pass on the device. The procedure is
`PHASE_2P_OWNER_DEVICE_CHECKLIST_ROUND_TWO.md`.

**Not re-opened, and not claimed:** VoiceOver stays NOT EXECUTED by the owner's
waiver; no migration was created; signup, rollout, grants, RLS, retention and
authority are untouched; push HTTP 403 was not resumed; no automation was
enabled; and the roadmap successor is neither started nor planned.
