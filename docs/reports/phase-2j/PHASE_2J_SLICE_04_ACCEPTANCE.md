# Phase 2J.4 — Voice and reviewable transcription: acceptance

**Slice:** `2J.4` · **Status:** closed · **Migrations:** 1 (`202608080085`)

Every row below cites the artifact that proves it. A row without a resolving
citation is a refusal in `generate-phase-2j-traceability.mjs`, not a warning.

| Requirement | Class | Evidence |
| --- | --- | --- |
| `2J-VOICE-001` | **built** | Record, transcribe, edit, confirm are four separate steps in `voice-composer.tsx`; nothing is captured before confirmation. |
| `2J-VOICE-002` | **built** | `openAiGate` -- the same gate chat and extraction use. No credential refuses with the configure-AI affordance and queues nothing. |
| `2J-VOICE-003` | **built** | `transcribeAudio` is on the `AIProvider` interface; authorization, confirmation and the write stay outside it. |
| `2J-VOICE-004` | **built** | `TRANSCRIPTION_MODEL_ID` is a pinned constant, checked against the SDK's own `AudioModel` union by `transcription-contract.test.ts`. No `agent_preferences` column. |
| `2J-VOICE-005` | **built** | Every call records to `ai_usage_events` with its own `transcription` operation (migration `202608080085`). Events land `unpriced` -- no audio pricing row exists and the table is per-token -- which is a state `record_ai_usage` already models (ADR-096). |
| `2J-VOICE-006` | **built** | Recording state and elapsed duration are always visible while recording. |
| `2J-VOICE-007` | **built** | Pause, resume, finish and cancel are all offered and asserted. |
| `2J-VOICE-008` | **built** | Cancel stops the tracks and drops the chunks immediately; `voice-composer.test.tsx` asserts the track was stopped and nothing was sent. |
| `2J-VOICE-009` | **built** | Permission denial is a first-class state with copy and a way forward, not a toast. Permission is requested on record, never on page load. |
| `2J-VOICE-010` | **built** | An explicit transcribing state is rendered. |
| `2J-VOICE-011` | **built** | A transcription failure preserves the existing draft; asserted directly, and the copy says so. |
| `2J-VOICE-012` | **built** | The transcript is an editable textarea; a second segment appends rather than replaces, and typed text survives. |
| `2J-VOICE-013` | **built** | **No durable audio.** `no-durable-audio-guard.test.ts` re-derives the absence from `database.types.ts`, the storage configuration and the source tree on every run -- Phase 2I's `2I-LIB-004` shape -- so a future migration adding an audio column breaks the guard. |
| `2J-VOICE-014` | **partial** | **Delivered:** the container is read from the recorder rather than assumed, `MediaRecorder.isTypeSupported` picks it, the size ceiling is enforced client-side *and* server-side, and the accepted-type list is closed. **Missing:** G-2J.4b's measurement on real iOS Safari and Android Chrome -- the plan states explicitly that describing the contract does not discharge the gate. **Destination:** owner measurement on real hardware; named in `PHASE_2J_REPORT.md`. |
| `2J-VOICE-015` | **built** | Nothing recorded becomes a task, memory or entry without confirmation; the transcript is never interpreted before capture. |

