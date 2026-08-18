# Phase 2P — Current Experience Audit

**Status:** planning evidence only. **No product implementation.**

**Audited baseline:** `main` `27f9f77`; worktree clean; 97 local and hosted
migrations at `202608160097`, read live on 2026-08-18.

## Findings

1. **Today is text-only.** `HomeDashboard` mounts `QuickCaptureForm` directly.
2. **Capture asks for a modality first.** `UnifiedCapture` renders Write, File
   and Speak as tabs even though text is already the natural default.
3. **The desired voice workflow mostly exists.** `VoiceComposer` already does
   record → transcribe → editable draft → more typing/recording → explicit send,
   with no durable audio. Its placement, not its core lifecycle, is wrong.
4. **Needs You has a known lifecycle defect.** Branch
   `codex/fix-needs-attention-confirmation` contains migration 098 and a proposed
   correction, but it is absent from `main` and hosted parity. It must be
   re-audited, not blindly merged.
5. **Conversation has two failures.** The owner sees the generic application
   boundary, and navigation deliberately places Chat under Brain/More rather
   than among primary destinations.
6. **Person-company editing is nested.** The owner opens the entity editor and
   then a second company flow instead of editing the displayed association.
7. **Memory creation is an inline one-line operation.** It gives little space or
   context for a durable statement.
8. **Relations is list-first by old contract.** The drawing follows the full
   list and there is no view choice.
9. **Calendar and Reminders are functionally mature but visually dense.** The
   reminder creation form competes with the page heading and list.
10. **Notifications combines governance and history.** The exact split the
    owner requested is not represented in information architecture.
11. **Settings is one long form.** Existing operational consumers are real, but
    the page makes unrelated decisions compete in one scroll.
12. **Raw confidence exists in interpretation data but is not an authorization
    contract.** A universal 90% rule would be uncalibrated and would collide
    with identity and inferred-relation residuals.

## Current assets to reuse

- One entry writer, one attachment writer and one transcription action.
- Editable transcript and no-durable-audio guard.
- Draft restoration without stored idempotency authority.
- Existing confirmation, task/person resolution and undo machinery.
- Existing notification consent, preferences and history readers.
- Existing owner-scoped entity associations and relation text equivalent.
- Existing calendar timezone and reminder lifecycle contracts.

## Existing residuals kept separate

- Apple Web Push HTTP 403 and Android NOT EXECUTED.
- `2N-RELATION-TRIGGER`, `2N-IDENTITY-EXTRACTION`, `2N-FILES-WRITER`.
- Retention sweeps unscheduled; SMTP and restore drill; legal and monitoring signatures.
- Four inherited touch-target exceptions, 49 uncovered elements and the unexecuted screen-reader session.

These may constrain Phase 2P, but the planning package does not silently claim
or close them.
