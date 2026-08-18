# Phase 2P — Slice 2P.3 acceptance record

**Capture becomes one composer on both surfaces, and it does so over two forms
rather than one action that branches — because the easy version of this slice is
a third write path with a friendly name.**

- **Authorization:** ADR-122 (2026-08-18), slices 2P.0 … 2P.8. Owner-confirmed
  order (§91): 2P.2 → **2P.3** → 2P.1 at the first safe boundary. 2P.4 must
  never precede this slice.
- **Requirements:** `2P-CAPTURE-001` … `-010` (10 of 87; **24 of 87
  cumulative**).
- **Migrations:** **none created, none spent.** 97 local = 97 hosted, parity
  `202608160097`, unchanged. The one deployed-vocabulary consequence this slice
  had to handle was re-wired without schema — §6.
- **Baseline:** `main` `f37dce42` (slice 2P.2's merge `099cd57` plus the §91
  handoff merge `f37dce42`), worktree clean, no open PR, **CI green on the exact
  merge SHAs** `099cd57` and `f37dce42`, rollout gate 25 pass · 3 fail · 2
  owner-signature, signup closed.
- **No provider call was made and no BYOK credential was spent** by any part of
  this slice, including its browser proof — §7 explains what that cost the
  proof and what was done instead.

---

## 1. Re-audit against `f37dce42`, before editing

§91 recorded a re-audit against `099cd57`. `f37dce42` adds only the handoff
document, so every finding still described the tree it was written against and
none had to be re-executed. Confirmed rather than assumed: the delta between the
two commits is one markdown file.

| Requirement | State before | Evidence |
|---|---|---|
| `-001` one contract on both surfaces | **not built** | Today mounted `QuickCaptureForm`; Capture mounted `CaptureModeReporter` → `UnifiedCapture` |
| `-002` text ready, no mode choice first | **partial** | `useState<CaptureMode>("text")` opened on text, but a three-tab `role="tablist"` with an `Escrever` tab rendered above it |
| `-003` attachment at the left, existing path | **not built** | `UploadForm` was a standalone form with its own label, input and submit |
| `-004` microphone beside send | **not built** | the microphone was a tab |
| `-005` drag, drop and paste | **not built at all** | zero `onDrop`, `onPaste`, `dragover` or `DataTransfer` under `src/features` |
| `-006` transcript at the composition boundary | **baseline** | `VoiceComposer` had record → transcribe → editable draft, but the draft was **its own second textarea** |
| `-007` edit, type more, record again, discard | **baseline** | same component |
| `-008` only explicit send creates an entry | **baseline** | held by `capture-write-path-guard.test.ts` |
| `-009` audio memory-only, discarded four ways | **baseline** | `no-durable-audio-guard.test.ts` |
| `-010` draft stores no key, audio, bytes or replay authority | **baseline for text** | `composer-draft.ts`, one consumer |

**One finding the re-audit had understated.** `-006` and `-007` were recorded as
"baseline, needs re-proof". They were not baseline. `VoiceComposer` owned a
*separate* draft textarea, so a transcript could never join a sentence the owner
had already begun — "at the current composition boundary" was unreachable by
construction, not merely unproven. That is why this slice made the microphone
smaller rather than moving it.

---

## 2. The architectural constraint, and what it decided

One `<form>` has one action, and there are **two write paths that must stay
separate** (`T-1`): `captureEntry` → `capture_entry_async` creates an entry the
worker interprets; `uploadAttachment` → the `process_attachment` job stores and
analyses a file. Different idempotency, different retries, different failure
shapes.

So the composer is **one visual surface over two form elements**, joined by
HTML's `form="…"` attribute:

- the entry `<form>` owns the textarea and the send button;
- a **sibling** `<form>` owns the upload;
- the file input sits physically inside the composer's action row and carries
  `form={attachmentFormId}`, so it belongs to the sibling;
- the chip's **Enviar arquivo** button does the same.

The rejected alternative is the one that would have passed review: a single
action that inspects the FormData and branches on whether a file is present.
That is the *"third write path with a friendly name"* the plan names as a stop
condition, and it would have been invisible in a diff.

The constraint is asserted structurally rather than described:

- `composer.test.tsx` — `fileInput.form !== textarea.form`, plus a behavioural
  test that clicking **Enviar arquivo** calls the attachment action **and never
  calls the entry action**.
- `capture-write-path-guard.test.ts` — retargeted from `unified-capture.tsx` to
  `composer.tsx` with **no assertion weakened**, and given one more: the file
  must contain exactly two `<form` elements and exactly two
  `form={attachmentFormId}` references. A refactor that "simplifies" the sibling
  form away fails there.
- `online-phase-2p-composer.spec.ts` — the same property read off the **rendered
  page**, on both surfaces, in a real browser.

---

## 3. What shipped

| File | Change |
|---|---|
| `src/features/capture/composer.tsx` | **new.** The surface. Replaces `quick-capture-form.tsx`, `unified-capture.tsx` and `capture-mode-reporter.tsx`. |
| `src/features/capture/composer-copy.ts` | **new.** Typed copy module, both locales (ADR-036 shape). |
| `src/features/capture/composer.test.tsx` | **new.** 35 rendered-contract tests. |
| `src/features/capture/voice-composer.tsx` | rewritten as a **control**: records, transcribes, calls `onTranscript`. No draft, no form, no `captureAction`. |
| `src/features/capture/voice-composer.test.tsx` | rewritten at the new seam. |
| `e2e/online-phase-2p-composer.spec.ts` | **new.** The authenticated browser lane — §7. |
| `src/app/[locale]/app/capture/page.tsx` | mounts `Composer` with all three actions. |
| `src/features/shell/home-dashboard.tsx` | same component, `captureSource="home"`. |
| `src/features/product-analytics/interaction-events.tsx` | `recordCaptureModeSelected` gains `captureSource` — §6. |
| `src/app/experience.css`, `src/app/globals.css` | tab stylesheet out, composer stylesheet in — §5. |
| three guards | retargeted, none weakened — §4. |
| deleted | `unified-capture.tsx(+test)`, `capture-mode-reporter.tsx`, `quick-capture-form.tsx(+test)`. |

### The transcript now lands at the caret

`insertTranscript` splits the field at the remembered boundary, adds a leading
space only where one is missing, restores the caret after the insertion and
writes the result to the draft.

The caret is **remembered on `select`/`change`, not read at insertion time.**
`selectionStart` survives blur, so reading it live would usually work — and
would read `0` on a field that was never focused, which is exactly a draft
restored from a previous visit. Inserting a transcript at position 0 of text the
owner wrote yesterday looks like corruption. `null` means "no boundary was
placed" and the transcript goes to the end.

### Drag, drop and paste fill the same input the picker fills

A dropped or pasted file is validated, then written into the **file input
itself** via `DataTransfer`. Nothing downstream knows it happened: same input,
same form, same action, same server checks. There is no second upload path, only
a second way to fill the first one. A browser that exposes a drop but no
constructible `DataTransfer` gets an explicit sentence rather than a silent
no-op — the requirement's own words are "where the browser exposes them".

Only files are intercepted on paste; a text paste is left entirely to the
browser, which is the overwhelmingly common case.

### One rule, asked by all three routes

`rejectionFor(file)` is the single predicate, and it reads
`ATTACHMENT_LIMITS.mimeAllowlist` — **the same constant `uploadAttachment`
enforces**. The picker's `accept` attribute is derived from that constant too,
rather than being the hand-written string the standalone upload form carried.
A client check is a courtesy and the server check is the control; sharing one
list is what stops them drifting.

---

## 4. Guards retargeted, and one dead attribute removed

Three guards named files this slice renamed. Each was **retargeted, never
loosened**, and each carries the reason in the file:

1. `capture-write-path-guard.test.ts` — surface block now reads `composer.tsx`,
   with two assertions added (§2).
2. `phase-2p-foundation-guard.test.ts` — slice 2P.0 wrote this census and left
   the message *"move it … and say so in the slice record"*. This is that
   passage, made consciously: the pinned draft consumer moves from
   `quick-capture-form.tsx` to `composer.tsx`. The property — two mounting
   surfaces, one draft store, one consumer, text only — is unchanged and still
   passes.
3. `stylesheet-class-coverage.test.ts` — the liveness check **failed, named the
   new number, and refused to let the debt be recorded as larger than it is**.
   `RECORDED_UNSTYLED` 49 → **45**. Four elements left the census; none was
   styled in order to move the number.

**One dead attribute removed.** The file input carried `required`, inherited
from the standalone upload form whose submit button was always on screen with
nothing chosen. In the composer the only control that submits that form is
rendered *by* a chosen file, so the attribute could never fire for anyone —
while still blocking submission whenever the browser and the element disagree
about what the input holds. `uploadAttachment` refuses an absent or empty file
on arrival, which is the control that matters.

---

## 5. A defect found in passing, and repaired

`.capture-draft-note` and `.capture-draft-discard` — the draft notice and its
discard button, shipped in slice 2O.3 — had **no rule anywhere in
`src/app/*.css`**. An unstyled paragraph with an inline button, inside the
capture card, since 2O.3. This is the third instance of the shape first recorded
when Notificações and BYOK were found to have classes and no stylesheet.

Repaired here rather than logged, because this slice moves both elements into
the new composer and shipping them still unstyled would have been shipping them
knowingly. It is two of the four elements that left the unstyled census in §4.

Two cascade traps were also fixed, and both would have been silent:

- `.capture-actions span` styled *every* span in the action row. The mic and the
  attachment control carry their accessible names in `sr-only` spans, and that
  selector (0-1-1) outranks `.sr-only` (0-1-0) — it would have made the
  screen-reader-only text **visible**. Replaced with `.composer-hint`.
- `.capture-actions button` painted every button in the row as the primary
  action. Narrowed to `.capture-actions button[type=submit]`, which is send and
  only send.

---

## 6. `capture_mode_selected` keeps a producer, with no migration

The tablist was this deployed event's **only** producer. Deleting it without
re-wiring would have left a deployed vocabulary value with nothing writing to it
— the mirror of the defect recorded as *"a producer with no consumer is
invisible"*.

Two things moved, neither needing schema:

**The producer.** `attachment` fires when a file is actually chosen (picker,
drop or paste alike), `voice` when recording starts, `text` when the owner
begins writing — once per modality per composer mount. All three deployed values
keep a writer, and each now fires when the owner genuinely engages that
modality. This is a **better** signal than the tabs gave: `text` was the initial
panel and `onModeChange` only fired on a *change*, so `text` was recorded only
when the owner returned to it from somewhere else.

**The surface.** It was hardcoded `capture`, because tabs existed only there.
The composer also mounts on Today, so the surface is now derived from
`captureSource` exactly as `recordCaptureStarted` already derives it. Both values
are in the deployed `product_events_surface_check`. Leaving it hardcoded would
have filed every cockpit capture under the wrong surface, which is worse than
not recording it at all.

Read live before relying on any of it: the `captureMode` key whitelist is
`array['captureMode']`, the enum is `array['text','attachment','voice']`, and
`product_events_surface_check` contains both `home` and `capture`. **Nothing in
the deployed contract had to change.**

---

## 7. Verification

| Gate | Result |
|---|---|
| `npm run lint` | **zero errors, zero new warnings** from this change. The only remaining findings are in a gitignored local worktree (`.worktrees/`, absent in CI) and one pre-existing `costs/page.tsx` warning from slice 2O.6. |
| `npm run typecheck` | **clean** |
| `npm test` | **8350 passed**, 3 failed *files* / **0 failed tests** — the known Windows-local shebang-parse baseline, green in CI |
| `npm run build` | **passes** |
| CI journey lane, run locally | `foundation`, `task-command`, `accessibility`, `calendar`, `daily-surfaces`, `phase-2o-mobile-accessibility`, desktop **and** mobile — **369 passed, 5 skipped** |
| authenticated browser lane | **8 passed** (desktop + mobile) against `next start` over hosted Supabase |

### The browser lane exists because nothing else could see this

`Composer` is a Client Component that now receives **three** Server Actions from
**two** Server Components, one of which previously imported one. A bad RSC
boundary there fails no `tsc`, no `vitest` and no `next build` — it fails at
request time with a blank surface. That defect has shipped twice in this
project. The CI journey lane cannot catch it either: every spec it runs is
unauthenticated or renders its own fixture markup, and both mounting surfaces
are behind a session.

The lane proves, on the rendered page, in both viewports:

1. both surfaces render a composer **and** its field — asserted **present before
   anything is asserted absent**, so a blank page fails instead of passing every
   absence check;
2. no `tablist` and no `tab` survives;
3. the attachment control and the microphone are both there;
4. `fileInput.form !== textarea.form` — `T-1`, in the browser;
5. the two surfaces hold **separate** drafts, and a draft survives navigation
   away and back, and the discard control clears it through a reload;
6. choosing a file sends **no `multipart/form-data` request**, and removing it
   sends none either;
7. **no serious or critical axe violation** on either surface — the scan that
   jsdom cannot perform, on a slice that rewrote a stylesheet and added two
   icon-only controls.

**The first draft of (6) was wrong and is worth recording.** It asserted "no
POST at all" and failed — because every Server Action is a POST to the current
route, and the composer legitimately makes one the moment a file is chosen:
that is §6's re-wired modality event. The narrowed detector separates "the owner
picked a file" from "the file left the browser" by content type, and the POST
that broke the first draft is now the **liveness control** proving the listener
is attached and that the re-wiring reaches the server from a real page.

### Limits, stated

- **jsdom has no `DataTransfer` and no assignable `input.files`.** Both were
  measured, not assumed — `Object.setPrototypeOf` onto `FileList.prototype` is
  rejected too. The unit tests shim both, and what they prove is the composer's
  **decision**: which files it accepts, which it refuses, and that an accepted
  one is handed to the attachment input rather than the entry form. That the
  browser then submits that input is the platform's contract.
- **The recording controls are not axe-scanned.** They are a transient second
  state of the same row, and reaching them needs a microphone permission this
  lane cannot grant.
- **`MediaRecorder` and `getUserMedia` are faked** in both unit lanes, as they
  were in Phase 2J. Gate `G-2J.4b` still requires real-device measurement and is
  **not** discharged here.
- **No capture was sent on the hosted stack.** A capture enqueues
  `interpret_entry`, the worker calls the provider, and that is BYOK spend on an
  unauthorized proof. So the lane reads: no entry, no attachment, no job, and
  therefore **no residue to clean**.

---

## 8. Threats dispositioned

| Threat | Disposition |
|---|---|
| `T-1` — unified composer creates a second entry writer | **closed by construction.** Two form owners, both actions injected as props, the entry-writer census unchanged at one caller, and the two-form shape now pinned by a guard and by the browser lane. |
| `T-4` — a restored draft carries authority to replay a send | **unchanged and re-proved.** The draft is text only: no idempotency key, no audio, no file bytes, no filename. The key is minted per mount and rotated after every success. |
| audio durability | **unchanged.** `no-durable-audio-guard.test.ts` passes; the microphone still releases its tracks on success, cancel, failure and unmount, and now holds even less, since it no longer owns a draft. |
| content in telemetry | **unchanged.** `capture_mode_selected` still carries one closed enum member, asserted by a test that uploads a file with a distinctive name and checks it appears in no emitted payload. |

---

## 9. Where this stops

**Every one of `2P-CAPTURE-001` … `-010` is delivered.** No requirement in this
family is partial, and this slice opens **no new remainder**.

The two remainders already open stay exactly where §90 and §91 left them and are
**not** absorbed here: `2P-CHAT-004-MOBILE` (slice 2P.5) and
`2P-CHAT-007-JOURNEY` (slice 2P.8, with the owner's one-turn BYOK
authorization).

**Cumulative: 24 of 87 requirements, zero migrations spent.**

**Next is slice 2P.1**, at this boundary, using the replacement-migration
authorization recorded in §91 — beginning with the five-defect write-up of
`202608170098` and the corrected contract, **before any SQL is written**. 2P.4
remains sequenced after this slice, as ADR-122 Decision 1 requires.

This section deliberately does not name what comes after Phase 2P.
