create extension if not exists vector with schema extensions;

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_entry_id uuid references public.entries(id) on delete set null,
  person_id uuid references public.people(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  kind text not null default 'fact' check (kind in ('preference','relationship','responsibility','rule','recurring_info','professional_context','habit','restriction','goal','fact')),
  content text not null check (char_length(content) between 1 and 4000),
  confidence numeric(4,3) not null default 1 check (confidence between 0 and 1),
  important boolean not null default false,
  sensitivity text not null default 'normal' check (sensitivity in ('normal','private','highly_sensitive')),
  valid_from timestamptz,
  valid_until timestamptz,
  embedding extensions.vector(1536),
  embedding_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index memories_user_updated_idx on public.memories (user_id, updated_at desc);
create index memories_user_person_idx on public.memories (user_id, person_id);
create index memories_embedding_idx on public.memories using hnsw (embedding extensions.vector_cosine_ops);
create trigger memories_updated_at before update on public.memories for each row execute function public.set_updated_at();

create table public.entry_embeddings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete cascade,
  content text not null,
  embedding extensions.vector(1536) not null,
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  created_at timestamptz not null default now(),
  unique (entry_id)
);
create index entry_embeddings_user_idx on public.entry_embeddings (user_id, created_at desc);
create index entry_embeddings_vector_idx on public.entry_embeddings using hnsw (embedding extensions.vector_cosine_ops);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 240),
  locale text not null default 'pt-BR' check (locale in ('pt-BR','en')),
  sensitivity text not null default 'normal' check (sensitivity in ('normal','private','highly_sensitive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index conversations_user_updated_idx on public.conversations (user_id, updated_at desc);
create trigger conversations_updated_at before update on public.conversations for each row execute function public.set_updated_at();

create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null check (char_length(content) between 1 and 12000),
  citations jsonb not null default '[]'::jsonb,
  model text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  created_at timestamptz not null default now()
);
create index conversation_messages_user_conversation_idx on public.conversation_messages (user_id, conversation_id, created_at);

do $$
declare table_name text;
begin
  foreach table_name in array array['memories','entry_embeddings','conversations','conversation_messages'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', table_name || '_select_own', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', table_name || '_insert_own', table_name);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', table_name || '_update_own', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', table_name || '_delete_own', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('revoke all on public.%I from anon', table_name);
  end loop;
end;
$$;

create or replace function public.match_internal_knowledge(
  p_query_embedding extensions.vector(1536),
  p_match_count integer default 8
)
returns table (
  source_type text,
  source_id uuid,
  content text,
  similarity double precision,
  occurred_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select matches.source_type, matches.source_id, matches.content, matches.similarity, matches.occurred_at
  from (
    select
      'entry'::text as source_type,
      public.entries.id as source_id,
      public.entry_embeddings.content,
      1 - (public.entry_embeddings.embedding operator(extensions.<=>) p_query_embedding) as similarity,
      public.entries.occurred_at
    from public.entry_embeddings
    join public.entries on public.entries.id = public.entry_embeddings.entry_id
    where public.entry_embeddings.user_id = (select auth.uid())
    union all
    select
      'memory'::text,
      public.memories.id,
      public.memories.content,
      1 - (public.memories.embedding operator(extensions.<=>) p_query_embedding),
      coalesce(public.memories.valid_from, public.memories.created_at)
    from public.memories
    where public.memories.user_id = (select auth.uid()) and public.memories.embedding is not null
  ) matches
  order by matches.similarity desc
  limit least(greatest(coalesce(p_match_count, 8), 1), 20);
$$;

grant execute on function public.match_internal_knowledge(extensions.vector, integer) to authenticated;
revoke all on function public.match_internal_knowledge(extensions.vector, integer) from anon;
