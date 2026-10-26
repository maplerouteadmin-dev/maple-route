-- Maple Route map/GPS reports. Apply in the project SQL Editor after review.
-- Players can insert only; only dashboard administrators can read the inbox.
create table if not exists public.map_reports (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  map_name text not null check (length(map_name) between 2 and 120),
  observed_map text not null default '' check (length(observed_map) <= 120),
  description text not null check (length(description) between 5 and 500),
  version text not null default '' check (length(version) <= 40),
  platform text not null check (platform in ('deck', 'web')),
  status text not null default 'new' check (status in ('new', 'reviewing', 'fixed', 'not_reproducible'))
);
create index if not exists map_reports_recent on public.map_reports (created_at desc);
create index if not exists map_reports_owner_recent on public.map_reports (owner, created_at desc);

create or replace function public.map_report_guard() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'sign in required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 10));
  new.owner := auth.uid(); new.created_at := now(); new.status := 'new';
  new.map_name := btrim(new.map_name); new.observed_map := btrim(new.observed_map);
  new.description := btrim(new.description);
  if exists (select 1 from public.map_reports where owner = auth.uid() and created_at > now() - interval '1 minute') then
    raise exception 'slow down before reporting again';
  end if;
  if (select count(*) from public.map_reports where owner = auth.uid() and created_at > now() - interval '1 day') >= 5 then
    raise exception 'too many reports today';
  end if;
  return new;
end $$;
drop trigger if exists map_report_guard on public.map_reports;
create trigger map_report_guard before insert on public.map_reports for each row execute function public.map_report_guard();

alter table public.map_reports enable row level security;
revoke all on public.map_reports from anon, authenticated;
grant insert (map_name, observed_map, description, version, platform) on public.map_reports to authenticated;
drop policy if exists "members send map reports" on public.map_reports;
create policy "members send map reports" on public.map_reports for insert to authenticated
  with check (owner = auth.uid());

-- In the Supabase dashboard, administrators can review reports with:
-- select id, created_at, map_name, observed_map, description, version, platform, status
-- from public.map_reports order by created_at desc limit 100;
-- Mark one reviewed with an administrator-only SQL update, never a client grant.
