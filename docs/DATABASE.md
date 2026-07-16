# Database Design

## Conventions

All user-owned tables carry `user_id uuid not null`, timestamps are `timestamptz`, ids are UUIDs, mutable tables carry `updated_at`, and soft deletion is used where retention or undo requires it. Original entry content is append-only. JSON is reserved for versioned provider payloads and undo snapshots, not core relationships.

## Entity groups

- Identity: `profiles`, `agent_preferences`, `provider_configs`.
- Knowledge: `contexts`, `organizations`, `projects`, `people`, temporal relationship tables, `topics`, `tags`, `entity_tags`.
- Capture: `entries`, `entry_interpretations`, `entry_entities`, `attachments`, `entity_attachments`.
- Work: `tasks`, `task_dependencies`, task relationship tables, `reminders`, `pending_questions`.
- Agent: `memories`, `conversations`, `conversation_messages`, `summaries`, `notifications`.
- Control plane: `agent_actions`, `audit_logs`, `undo_operations`, `heartbeat_runs`, `jobs`, integration and webhook tables.

## Temporal and semantic rules

`entries.created_at` is ingestion time and `entries.occurred_at` is event time. Backdated entries invalidate overlapping summaries. Temporal associations use `valid_from` and `valid_to`. Embeddings are stored with source type/id, model, dimensions, content hash, and sensitivity.

## Index strategy

Every owned table starts with a `user_id` index; hot access uses compound indexes such as `(user_id, status, due_at)`, `(user_id, occurred_at desc)`, `(user_id, available_at)` for pending jobs, and partial indexes for unread notifications and active tasks. Full-text GIN and pgvector HNSW indexes support hybrid retrieval.

## RLS

RLS is enabled and forced on every owned table. Explicit policies exist for select, insert, update, and delete using `auth.uid() = user_id`; insert/update include `with check`. Relationship rows also carry `user_id` so authorization never depends solely on joins. Storage object paths begin with the authenticated user UUID.

The initial migration implements Phase 1 identity tables. Later phase migrations add one vertical slice at a time, including their policies, indexes, functions, and RLS tests.

