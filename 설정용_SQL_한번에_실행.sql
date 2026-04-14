-- pgvector + 전시용 RAG 스키마
-- Supabase 대시보드 → SQL Editor → 전체 복사 → Run 한 번에 실행
-- 임베딩: text-embedding-3-small 기본 차원 1536

create extension if not exists vector;

create table if not exists public.wiki_chunks (
  id bigserial primary key,
  doc_id text not null,
  title text not null,
  section_path text,
  content text not null,
  tags text[] default '{}',
  lang text default 'ko',
  metadata jsonb default '{}'::jsonb,
  embedding vector(1536) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.raw_chunks (
  id bigserial primary key,
  doc_id text not null,
  title text,
  section_path text,
  content text not null,
  tags text[] default '{}',
  lang text default 'ko',
  metadata jsonb default '{}'::jsonb,
  embedding vector(1536) not null,
  created_at timestamptz not null default now()
);

create index if not exists wiki_chunks_embedding_idx
  on public.wiki_chunks using hnsw (embedding vector_cosine_ops);

create index if not exists raw_chunks_embedding_idx
  on public.raw_chunks using hnsw (embedding vector_cosine_ops);

create index if not exists wiki_chunks_doc_id_idx on public.wiki_chunks (doc_id);
create index if not exists raw_chunks_doc_id_idx on public.raw_chunks (doc_id);

create table if not exists public.chat_turns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  exhibition_day date not null,
  session_id text not null,
  user_message text not null,
  assistant_message text not null default '',
  outcome text not null check (outcome in ('answered', 'refused', 'low_confidence')),
  gap_candidate boolean not null default false,
  retrieval_debug jsonb not null default '{}'::jsonb,
  review_status text not null default 'pending' check (review_status in ('pending', 'resolved')),
  notes text
);

create index if not exists chat_turns_day_review_idx
  on public.chat_turns (exhibition_day, review_status);
create index if not exists chat_turns_gap_idx
  on public.chat_turns (gap_candidate, exhibition_day);

create or replace function public.match_wiki_chunks (
  query_embedding vector(1536),
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
  query_embedding vector(1536),
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

comment on table public.wiki_chunks is '전시용 정리 위키 청크 (1차 검색)';
comment on table public.raw_chunks is '대화 원문 전처리 청크 (2차 검색)';
comment on table public.chat_turns is '질의 로그 및 일일 gap 후보';
