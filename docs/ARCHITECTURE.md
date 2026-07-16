# Architecture

## Runtime topology

```text
Browser/PWA -> Next.js App Router -> Supabase Auth/Postgres/Storage
                         |                    |
                         +-> AI gateway       +-> Cron -> Edge workers
                                  |                       |
                                  +-> configured provider +-> jobs/outbox
```

Next.js is the authenticated backend-for-frontend. Direct browser access to Supabase is allowed only through RLS-safe operations. Privileged work is performed in server-only modules or Edge Functions. Postgres is the source of truth; internal notifications and integrations use durable outbox/job records instead of best-effort side effects.

## Modules

- Identity: sessions, profiles, preferences, tenant isolation.
- Capture: immutable entries, attachments, origins, event time.
- Interpretation: structured extraction, confidence, candidate actions, questions.
- Work: tasks, subtasks, dependencies, waiting, reminders, priority.
- Knowledge: people, organizations, projects, contexts, topics, tags, temporal relationships.
- Memory and retrieval: durable memories, embeddings, hybrid search, internal citations.
- Agent: conversation, action policy, heartbeat, summaries, notification decisions.
- Platform: jobs, idempotency, audit, undo, observability, integrations.

## Data flow

Capture commits the original before enqueueing interpretation. Workers claim jobs atomically, validate structured AI output, match entities, calculate action policy, persist interpretation and safe automatic actions in a transaction, and create questions for ambiguity. Embeddings and downstream summaries are separate idempotent jobs. UI progress is driven by persisted job state.

## AI portability

`AIProvider` exposes structured generation, embeddings, health, and usage metadata. Capability-based routing selects only configured providers/models. Model ids are server configuration, never trusted client input. Deterministic policies remain outside providers.

## Asynchrony and reliability

Jobs use `available_at`, leases, attempt count, exponential backoff with jitter, maximum attempts, idempotency keys, and dead-letter state. Webhook events have provider/event unique keys. Heartbeats have per-user/window idempotency keys and record both sent and silent outcomes.

## Deployment

Vercel hosts Next.js. Supabase hosts Postgres, Auth, Storage, Cron, and Edge Functions. Local development uses Supabase CLI and `.env.local`. Migrations are promoted in order; generated database types are checked into source.

