-- Supabase Database Linter: security hardening
-- Run in SQL Editor on the live project (idempotent).

-- 1) pgvector: move extension out of public (if still in public)
create schema if not exists extensions;

do $$
begin
  if exists (
    select 1
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'vector'
      and n.nspname = 'public'
  ) then
    alter extension vector set schema extensions;
  end if;
end $$;

-- 2) RPC: fixed search_path (mutable search_path linter)
create or replace function public.match_wiki_chunks (
  query_embedding extensions.vector(1536),
  match_threshold float,
  match_count int
)
returns table (
  id bigint,
  doc_id text,
  title text,
  section_path text,
  content text,
  metadata jsonb,
  similarity float
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    w.id,
    w.doc_id,
    w.title,
    w.section_path,
    w.content,
    w.metadata,
    (1 - (w.embedding <=> query_embedding))::float as similarity
  from public.wiki_chunks w
  where (1 - (w.embedding <=> query_embedding)) >= match_threshold
  order by w.embedding <=> query_embedding asc
  limit greatest(match_count, 1);
$$;

create or replace function public.match_raw_chunks (
  query_embedding extensions.vector(1536),
  match_threshold float,
  match_count int
)
returns table (
  id bigint,
  doc_id text,
  title text,
  section_path text,
  content text,
  metadata jsonb,
  similarity float
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    r.id,
    r.doc_id,
    r.title,
    r.section_path,
    r.content,
    r.metadata,
    (1 - (r.embedding <=> query_embedding))::float as similarity
  from public.raw_chunks r
  where (1 - (r.embedding <=> query_embedding)) >= match_threshold
  order by r.embedding <=> query_embedding asc
  limit greatest(match_count, 1);
$$;

-- 3) Data API grants — service_role only (replaces 20260521000000_data_api_grants.sql)
grant select, insert, update, delete on table public.wiki_chunks to service_role;
grant select, insert, update, delete on table public.raw_chunks to service_role;
grant select, insert, update, delete on table public.chat_turns to service_role;
revoke all on table public.wiki_chunks from anon, authenticated;
revoke all on table public.raw_chunks from anon, authenticated;
revoke all on table public.chat_turns from anon, authenticated;

grant usage, select on sequence public.wiki_chunks_id_seq to service_role;
grant usage, select on sequence public.raw_chunks_id_seq to service_role;
revoke all on sequence public.wiki_chunks_id_seq from anon, authenticated;
revoke all on sequence public.raw_chunks_id_seq from anon, authenticated;

grant execute on function public.match_wiki_chunks(extensions.vector, double precision, integer) to service_role;
grant execute on function public.match_raw_chunks(extensions.vector, double precision, integer) to service_role;
revoke execute on function public.match_wiki_chunks(extensions.vector, double precision, integer) from anon, authenticated, public;
revoke execute on function public.match_raw_chunks(extensions.vector, double precision, integer) from anon, authenticated, public;

alter table public.wiki_chunks enable row level security;
alter table public.raw_chunks enable row level security;
alter table public.chat_turns enable row level security;

-- 4) Supabase platform helper: not used by this app — block Data API callers
do $$
declare
  fn record;
begin
  for fn in
    select p.oid,
      pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'rls_auto_enable'
  loop
    execute format(
      'revoke execute on function public.rls_auto_enable(%s) from public, anon, authenticated',
      fn.args
    );
  end loop;
end $$;
