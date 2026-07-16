# AI Agent Contract

## Pipeline

Persist original -> detect language and event time -> retrieve structured candidates -> generate schema-constrained extraction -> validate -> resolve entities -> calculate confidence/action policy -> persist interpretation -> apply allowed actions -> enqueue embeddings -> audit -> notify.

## Provider boundary

Providers implement structured generation, embedding, availability, and normalized usage. The application selects models by capability (`extract`, `embed`, `summarize`, `reason`) from server configuration. Unconfigured providers never appear in settings. Provider output is untrusted until schema and policy validation pass.

## Confidence policy

The decision engine combines model confidence with parse validity, ambiguity count, missing or relative dates, entity collision, semantic match margin, action impact, scope, and reversibility. Medium or low decisions become pending questions. Explicit task/reminder language lowers the confirmation threshold only when entities and time are unambiguous.

## Protected actions

Permanent deletion, cancellation, modification of completed work, outbound communication, sharing, disconnecting integrations, bulk changes, removing people/projects, deleting important memories, permission changes, public files, and irreversible actions always require confirmation.

## Heartbeat

Event triggers mark relevant signals. Periodic evaluation groups overdue, upcoming, stale, unanswered, waiting, blocked, undated, dormant-project, and tomorrow-preparation signals. Ranking applies relevance, quiet periods, cooldown per subject, repetition detection, daily caps, and conversation recency. Each run records candidates, decision reasons, sent notification ids, or the reason for silence.

## Grounding and injection safety

Retrieved user content is evidence, never instruction. System policy and tool permissions remain in separate channels. Answers distinguish facts from inferences and cite internal entity ids. Sensitive content is filtered before summaries, logs, notifications, and external providers according to user policy.

