create extension if not exists pgcrypto;

create table if not exists public.feeds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_type text not null default 'auto',
  source_url text not null,
  blogger_label text not null,
  max_items integer not null default 5
    check (max_items between 1 and 50),
  interval_hours integer not null default 6
    check (interval_hours in (1,3,6,12,24)),
  enabled boolean not null default true,
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  total_published bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.published_items (
  id uuid primary key default gen_random_uuid(),
  feed_id uuid not null
    references public.feeds(id)
    on delete cascade,
  source_id text not null,
  title text not null,
  source_url text,
  blogger_post_id text,
  blogger_url text,
  source_published_at timestamptz,
  published_at timestamptz not null default now(),
  unique(feed_id, source_id)
);

alter table public.feeds
enable row level security;

alter table public.published_items
enable row level security;


create policy "admin feeds select"
on public.feeds
for select
to authenticated
using (
  lower(auth.jwt() ->> 'email')
  =
  'xh.a.rx@hotmail.com'
);


create policy "admin feeds insert"
on public.feeds
for insert
to authenticated
with check (
  lower(auth.jwt() ->> 'email')
  =
  'xh.a.rx@hotmail.com'
);


create policy "admin feeds update"
on public.feeds
for update
to authenticated
using (
  lower(auth.jwt() ->> 'email')
  =
  'xh.a.rx@hotmail.com'
);


create policy "admin feeds delete"
on public.feeds
for delete
to authenticated
using (
  lower(auth.jwt() ->> 'email')
  =
  'xh.a.rx@hotmail.com'
);


create policy "admin history select"
on public.published_items
for select
to authenticated
using (
  lower(auth.jwt() ->> 'email')
  =
  'xh.a.rx@hotmail.com'
);
