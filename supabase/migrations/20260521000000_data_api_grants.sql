-- Supabase Data API: explicit grants for public schema (May/Oct 2026 rollout)
-- This app uses supabase-js + service_role on the server only (Vercel / ingest scripts).
-- anon/authenticated are not granted — chunks and chat logs must not be client-readable.

-- Tables
grant select, insert, update, delete on table public.wiki_chunks to service_role;
grant select, insert, update, delete on table public.raw_chunks to service_role;
grant select, insert, update, delete on table public.chat_turns to service_role;

revoke all on table public.wiki_chunks from anon, authenticated;
revoke all on table public.raw_chunks from anon, authenticated;
revoke all on table public.chat_turns from anon, authenticated;

-- bigserial sequences (ingest inserts)
grant usage, select on sequence public.wiki_chunks_id_seq to service_role;
grant usage, select on sequence public.raw_chunks_id_seq to service_role;

revoke all on sequence public.wiki_chunks_id_seq from anon, authenticated;
revoke all on sequence public.raw_chunks_id_seq from anon, authenticated;

-- Vector search RPCs
grant execute on function public.match_wiki_chunks(vector, double precision, integer) to service_role;
grant execute on function public.match_raw_chunks(vector, double precision, integer) to service_role;

revoke execute on function public.match_wiki_chunks(vector, double precision, integer) from anon, authenticated;
revoke execute on function public.match_raw_chunks(vector, double precision, integer) from anon, authenticated;

-- Defense in depth: RLS on, no policies for anon/authenticated (service_role bypasses RLS)
alter table public.wiki_chunks enable row level security;
alter table public.raw_chunks enable row level security;
alter table public.chat_turns enable row level security;
