# Phase 2O — Slice 2O.7 acceptance record

**Mobile activation and accessibility** — `2O-MOBILE-001` … `-005`,
`2O-ACCESS-001` … `-006`. Eleven requirements, **zero migrations**, on top of
`a58af08` with CI green on all three job families.

**10 built · 1 partial · 0 undelivered.** The `partial` is `2O-ACCESS-006`, and
it is `partial` for the one reason ADR-118 Decision 8 permits: **the
screen-reader session was not executed.**

**98 of 116 delivered.** Slices 2O.0 – 2O.7; one remains.

---

## 1. The re-audit, re-run — §84's four findings, and a fifth it did not have

ADR-118 Decision 1 makes the per-slice re-audit **the** control this phase
relies on, and §82, §83 and §84 all exist because a recorded finding was wrong.
This time three of four reproduced, one reproduced only halfway, and the
half that did not is the one that mattered.

### 1.1 `2O-MOBILE-003`'s object was not repaired — the *assertion* was

§84 records that ADR-116 restated the requirement as *"the 21px target at
`online-memories.spec.ts:85` **is fixed**"* and that against the tree the line
now reads `toBeGreaterThanOrEqual(44)`, so *"either an earlier slice repaired it
or the line moved"*.

**Neither.** `git log -S` shows no commit ever wrote `toBeGreaterThanOrEqual(21)`
into that file: `36ec2ad` introduced the assertion **already at 44**, over a
product that measured 21. The test states the requirement; it does not satisfy
it. Running it against the hosted project returned **`21.59375`**, reproduced
unchanged since 2N.3.

**The lesson is small and it cost nothing only because the run was cheap: an
assertion naming the right number is not evidence the product meets it.** §84's
finding was a reasonable reading of the line and would have closed the phase's
one admitted residual by looking at a test.

### 1.2 The remaining three reproduced exactly

- **`2O-ACCESS-001` is extension.** `e2e/accessibility.spec.ts` is 73 KB, runs
  axe in light and dark and already carries a control proving the dark run is
  dark. `axe-core` is a declared dependency. Nothing was rebuilt.
- **`2O-ACCESS-004` is largely satisfied.** `account-data-strip.tsx:63` renders
  `<span aria-current="page">` and `account-centre.test.tsx:143` asserts it. It
  is re-asserted on the rendered page and was not rebuilt.
- **`viewport.themeColor` is media-only**, two entries at `layout.tsx:63-66`.

### 1.3 The finding §84 did not have: the activation blind spot has two halves

§84 named three controls invisible to `2O-ACTIVATION-005` direction B and gave
the reason: they are `<button>` elements with no `name` attribute. That is true
and it is **the second reason**, not the only one.

`centreControlSources()` was **one level deep**. It read the components
`settings/page.tsx` mounts directly, and `ExportControl` and `GlobalSignOut` are
children of `PrivacySection` — so **their files were never opened at all**.
Repairing only the extractor would have left them invisible for a different
reason, and the guard would have looked fixed.

---

## 2. What shipped

### 2.1 A lane that renders the product instead of mirroring it

Four Playwright lanes in this repository build a fixture: they read
`src/app/*.css` off disk, inline it into a bare document and assert over
hand-written markup. §85 found `settings-extended.css` missing from one of them,
so the notifications and BYOK surfaces had been measured against the user-agent
default for as long as assertions had existed over them — the failure mode where
the lane reports green for the one reason it must never report green.

`2O-ACCESS-005` says contrast is verified **on the rendered page**, and
`2O-MOBILE-001` is a property of the artifact that ships. So slice 2O.7 adds two
lanes that drive the production build over real routes:

| Lane | Surfaces | Runs |
|---|---|---|
| `e2e/phase-2o-mobile-accessibility.spec.ts` | 9 public, both locales | **CI, every push** |
| `e2e/online-phase-2o-mobile-accessibility.spec.ts` | 10 authenticated, both locales | hosted, by hand |

Neither carries a `STYLESHEETS` array. A stylesheet dropped from `globals.css`
fails them rather than passing quietly. The first is added to the CI journey
command, which is what keeps the half that *can* gate, gating.

**76 tests on the public lane, 19 on the authenticated lane, desktop and mobile
projects, both locales, light and dark.**

### 2.2 The product defects they found

Every one was found by measuring a rendered page. None is visible to
TypeScript, to the linter, to a unit test, or to a fixture lane.

| Defect | Surface | Cause |
|---|---|---|
| The **entire mobile layout was dead** | Ajustes | `@media(max-width:600px)` sat at line 5, above most of the file. Specificity ties resolve by source order, so slice 2O.3's `.appearance-options{grid-template-columns:repeat(3,1fr)}` written at line 33 silently won. Three radio cards stayed in three columns at 320px and the page scrolled sideways by 53px. Both media blocks moved to the end; **not one declaration changed**. |
| **No focus indicator at all** on seven controls | onboarding path | `outline: var(--focus-ring)` — and `--focus-ring` is a **colour**, not an outline shorthand. `outline` given only a colour leaves `outline-style` at `none`. Valid CSS that paints nothing, with `:focus-visible` matching correctly the whole time. |
| **No focus indicator** on the composer | cockpit | `.capture-card textarea:focus{outline:0}` with no `:focus-visible` counterpart. The product's primary input. |
| Contrast failure in **both** themes | cockpit | `.onboarding-step[data-state="satisfied"]{opacity:.72}` — opacity composites the whole subtree, dragging a token that passes AA everywhere else below 4.5:1. |
| Contrast failure in dark | cockpit | `.capture-actions span` at `--text-muted` on `--background-elevated`. |
| **Eleven targets below 44px** | login, Ajustes, IA, custos, cockpit, memórias | login's three auxiliary links (25px); four model selects (42); *Ver custos de IA* (17); the quiet-hours checkbox (42); three appearance radios (16); **`Gerar exportação` and `Sair de todos os dispositivos` (22px, with no CSS rule at all)**; *Abrir revisões* (24); *Ajustar modelos* (37); the capture button (40); **a memory row's title (21.59)**. |

`2O-MOBILE-003`'s cause was not a number. The memory title is an inline `<a>`
wrapping a block `<strong>`, so the anchor's own box is one line of text while
the row around it is comfortably tall — everything looked right and the thing a
thumb has to hit was half the minimum. Both branches are repaired, masked and
unmasked, because `ProtectedContent` substitutes its own anchor and a fix
covering one leaves every sensitive memory short.

### 2.3 `viewport.themeColor` — the residual slices 2O.3 and 2O.4 both routed here

The framework offers two `media`-keyed tags and no request-scoped shape, and it
could not: the choice lives in `localStorage` and the server has never seen it.
So the canvas obeyed an explicit choice while the status bar kept obeying the
operating system.

The served HTML settles the mechanism: **Next emits both metas above the
pre-paint script**, so the script can read them. It adds **one** tag with no
`media`, first in `<head>` — the specification says the browser uses the
earliest matching one — with the colour **read off** whichever of Next's two
names the chosen scheme. It invents no colour, edits neither of the framework's
tags, does nothing for `system`, and is idempotent, so `AppearanceControl` calls
the same path for a change with no reload.

**The risk it carries is asserted rather than reasoned about**: a browser test
proves no hydration error and that the tag survives hydration. Had it not, the
mechanism would have been recorded as impossible rather than shipped.

### 2.4 `2O-MOBILE-004` and the owner's BYOK decision

**Install as an app** is a new section in Ajustes: a Server Component, three
platforms with the gesture each browser actually uses, and **no control** —
`beforeinstallprompt` is Chromium-only and a button built on it is absent
exactly when a reader needs it. It renders no control, so it needs no capability
row. It states, on the surface, that **installing does not turn on alerts**,
because without that sentence a reader concludes installing is the missing step
for push — the claim `OD-2O-11` forbids.

The owner minted **`Chave removida` / `Key removed`**. `CredentialStatus` has
four members and the panel rendered three sentences, so a key the account had
and deleted said the same words as a key never entered — a distinction carried
only by `data-status`, legible to a stylesheet and to a test and to nobody using
the product. The three ternaries became a `Record<CredentialStatus, string>`, so
a fifth status fails the typecheck instead of inheriting the last branch.
Storage, encryption, the write path and the state transitions are untouched.

### 2.5 `2O-ACTIVATION-005`'s predicate, repaired without touching the product

**No `name` was added to any button.** The guard now walks the centre's mount
tree **transitively** and classifies every operable element into a **total and
closed** taxonomy, each kind owing something real:

| Kind | Recognised by | Obligation |
|---|---|---|
| `persistent` | a non-hidden `name` on `input`/`select`/`textarea` | a registry row governs it |
| `destructive` | `danger` in its class, or a `window.confirm` guarding its form | an explicit confirmation exists |
| `submit` | `type="submit"` | its enclosing form binds an `action` |
| `client-action` | `type="button"` with `onClick` | the handler is bound in the file |
| `navigation` | `Link`/`a` with `href` | the destination is non-empty |

**An element matching no kind fails**, which is what separates a taxonomy from
an exemption list. Every kind is proved to exist in the real tree, so no branch
is dead code, and each has a planted fixture in both directions.

### 2.6 A new guard for §85's recurring defect

`stylesheet-class-coverage.test.ts` asks the precise question §85's finding
raises — **not** *"does every class have a rule?"* (61 do not, and most are
harmless) but *"is there an element whose **every** class matches nothing?"*
That is the shape of what the owner saw.

**Forty-nine**, across twenty-odd surfaces and six phases. Recorded as a ratchet
with a planted control: a new one fails on the commit that adds it. They are
**not** repaired here — measured on the rendered page they pass contrast, reflow
and target size; they are plain, not broken, and styling them is a redesign this
slice was told not to do.

---

## 3. Five defects in my own lane, each found by running it

1. **Signing in on every navigation** — ten surfaces × eighteen tests, and the
   hosted project answered `429 over_request_rate_limit`. Four tests failed for a
   reason with nothing to do with the product, while reporting it as a product
   failure.
2. **`addInitScript` re-runs on every navigation**, so the dark control stored
   `dark`, reloaded, had `light` written straight back, and reported that light
   and dark rendered the same canvas — **the control failing against a correct
   product**.
3. **`.account-data-strip` is a filename, not a class.** The component emits
   `.data-ai-tabs`. §84's finding table cited the file, and reading a class off a
   filename sent an assertion looking for an element that has never existed.
4. **`getComputedStyle` after a Tab is not a reading of a composite field.**
   `type="time"` and `type="date"` focus a segment inside their own shadow tree;
   a direct probe showed the host's `:focus` rule painting a correct 2px ring
   while the loop read `outline-style: none`.
5. **Measuring inside the entrance animation.** `.panel`, `.capture-card` and
   every cost card have a 220ms `rise` with `animation-fill-mode: both`, so
   before it runs they hold `opacity: 0`. Axe composites against what is
   painted and reported the whole cost summary as `color-contrast 1.66`, naming
   foreground colours (`#c6c3c0`) that appear in no stylesheet and no token.
   Reading the computed style settled it: `["0.305","0","0","0"]` immediately
   after load, `["1","1","1","1"]` two seconds later.

The fifth is the one to carry. **A contrast scan that runs before a page has
finished arriving measures a frame nobody sees**, and it fails loudly here only
because these surfaces animate — on a page with no entrance it would have
passed, quietly, for the wrong reason. Both lanes now wait on
`document.getAnimations()` rather than on a clock, so a slower entrance cannot
rot the wait in the direction that passes.

And one defect in the guard: the obvious JSX-comment pattern
`{\s*/\*[\s\S]*?\*/\s*\}` matches the opening half of **any** `{` followed by a
doc comment, and ran on to the next `*/}` far below — swallowing **7,804
characters** of `settings-form.tsx` including the only `<form>` in it, so a
correct submit button was reported as reaching no Server Action. Removing plain
block comments handles both shapes. A fixture with that exact structure is
planted.

---

## 4. What is carried, with destinations

- **`2O-ACCESS-006` closes `partial` — the screen-reader session is `NOT
  EXECUTED`.** `docs/reports/phase-2o/PHASE_2O_SCREEN_READER_SCRIPT.md` is a
  twenty-minute VoiceOver script naming the exact screens and sentences, with
  the device table to fill in. **Under ADR-118 Decision 8 it may never be
  promoted to a pass by documentation, an emulator, an automated scan, or
  inference from one** — and the nineteen-surface axe coverage this slice ships
  is precisely such an inference. → **owner**, or 2O.8's closeout records it as
  not executed and closes nothing else.
- **Four target exceptions, each with a liveness check that fails when the
  finding stops reproducing.** `legal/*`'s two links (18px) and the shell's
  `skip-link` (39px) and `palette-trigger` (38px). `git diff 57beb06..a58af08`
  proves Phase 2O touched none of them, and ADR-116 Decision 2 spends the
  phase's one licence to change a surface it did not create on `2O-MOBILE-003`.
  → **owner**, as four named residuals.
- **Forty-nine elements no stylesheet reaches**, eight of them slice 2O.5's
  privacy block — `privacy-census`, `privacy-retention`, `privacy-withheld`,
  `privacy-unenforced`, `privacy-unreadable`, `privacy-retained-fields`,
  `privacy-census-nosurface`, `privacy-consent`. The same finding §85 made about
  notifications and BYOK, on a third surface this phase built. → **owner**.
- **`2O-NOTIFY-005`'s third bound still has no object** → owner, unchanged.
- **`2O-ONBOARD-003`** stays `partial`, untouched.
- **`defaultAgentPreferences.tone`** still says `direct` against a column
  defaulting to `informal`.
- **`embedding_model`** untouched (ADR-117 Decision 4). CSP unchanged. Signup
  closed. Rollout gate **25 · 3 · 2**. **M2 unspent and unallocated.** A13 not
  retargeted.
- Every Phase 2N residual `OD-2O-11` declined stays unclaimed; push still fails
  with **HTTP 403 on a real iPhone** and has **never been executed on Android**;
  ADR-055 neither satisfied nor superseded, expiring **2026-10-27**. **No
  retention sweep scheduled.**

---

## 5. Classification

| Requirement | Verdict | Evidence |
|---|---|---|
| `2O-MOBILE-001` | **built** | 320 / 375 / 414 / 1280px and 200% zoom, 19 surfaces, both locales, zero horizontal scroll |
| `2O-MOBILE-002` | **built** | 44×44 measured on the rendered page; eleven repaired; four exceptions, each with a liveness check |
| `2O-MOBILE-003` | **built** | 21.59px reproduced against the hosted project, repaired in both branches, re-measured |
| `2O-MOBILE-004` | **built** | `InstallSection` in Ajustes, three platforms, no control, the alerts refusal stated |
| `2O-MOBILE-005` | **built** | desktop and mobile projects, both locales; a planted 900px divergence asserted to fail the mobile lane |
| `2O-ACCESS-001` | **built** | axe over 19 rendered surfaces, light and dark, with a control that fails if a dark run renders light |
| `2O-ACCESS-002` | **built** | computed accessible names, focus indicators driven by real Tab presses, keyboard path through login |
| `2O-ACCESS-003` | **built** | every toned region carries words; four `CredentialStatus` values now carry four sentences |
| `2O-ACCESS-004` | **built** | one `aria-current="page"`, rendered as a `span`; zero `role="tablist"` on any surface this phase built |
| `2O-ACCESS-005` | **built** | `color-contrast` on the rendered page, both themes, after animations settle |
| `2O-ACCESS-006` | **partial** | **NOT EXECUTED.** Script delivered; ADR-118 Decision 8 permits no other outcome |
