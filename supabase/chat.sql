-- Open, opt-in Maple Route app chat. Apply manually in the same Supabase project
-- as the Market after reviewing it. Anonymous Supabase users have the
-- authenticated database role. No game identity or game network is used.

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('here', 'map', 'channel', 'world')),
  world text not null check (world ~ '^[a-z0-9 -]{2,30}$'),
  channel int check (channel is null or channel between 1 and 40),
  map_id text check (map_id is null or map_id ~ '^[0-9]{1,12}$'),
  body text not null check (length(body) between 1 and 280 and body !~* '(https?://|www\.|discord\.gg/)'),
  check ((kind = 'world' and channel is null and map_id is null)
      or (kind = 'channel' and channel is not null and map_id is null)
      or (kind = 'map' and channel is null and map_id is not null)
      or (kind = 'here' and channel is not null and map_id is not null))
);
create index if not exists chat_messages_room on public.chat_messages (kind, world, channel, map_id, created_at desc);
create index if not exists chat_messages_owner_recent on public.chat_messages (owner, created_at desc);

create or replace function public.chat_message_guard() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'sign in required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  new.owner := auth.uid(); new.created_at := now(); new.body := btrim(new.body); new.world := lower(btrim(new.world));
  if exists (select 1 from public.chat_messages where owner = auth.uid() and created_at > now() - interval '4 seconds') then raise exception 'slow down before posting again'; end if;
  if (select count(*) from public.chat_messages where owner = auth.uid() and created_at > now() - interval '1 hour') >= 60 then raise exception 'too many messages this hour'; end if;
  if (select count(*) from public.chat_messages where owner = auth.uid() and created_at > now() - interval '1 day') >= 250 then raise exception 'too many messages today'; end if;
  return new;
end $$;
drop trigger if exists chat_message_guard on public.chat_messages;
create trigger chat_message_guard before insert on public.chat_messages for each row execute function public.chat_message_guard();

alter table public.chat_messages enable row level security;
revoke all on public.chat_messages from anon, authenticated;
grant select on public.chat_messages to authenticated;
grant insert (kind, world, channel, map_id, body) on public.chat_messages to authenticated;
drop policy if exists "members read recent chat" on public.chat_messages;
create policy "members read recent chat" on public.chat_messages for select to authenticated
  using (auth.uid() is not null and created_at > now() - interval '7 days');
drop policy if exists "members post chat" on public.chat_messages;
create policy "members post chat" on public.chat_messages for insert to authenticated
  with check (owner = auth.uid());

create table if not exists public.chat_reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null default auth.uid() references auth.users (id) on delete cascade,
  message_id uuid not null references public.chat_messages (id) on delete cascade,
  reason text not null check (reason in ('spam', 'harassment', 'other')),
  created_at timestamptz not null default now(),
  unique (reporter, message_id)
);
create or replace function public.chat_report_guard() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'sign in required'; end if;
  new.reporter := auth.uid(); new.created_at := now();
  if (select count(*) from public.chat_reports where reporter = auth.uid() and created_at > now() - interval '1 day') >= 20 then raise exception 'too many reports today'; end if;
  return new;
end $$;
drop trigger if exists chat_report_guard on public.chat_reports;
create trigger chat_report_guard before insert on public.chat_reports for each row execute function public.chat_report_guard();
alter table public.chat_reports enable row level security;
revoke all on public.chat_reports from anon, authenticated;
grant insert (message_id, reason) on public.chat_reports to authenticated;
drop policy if exists "members report chat" on public.chat_reports;
create policy "members report chat" on public.chat_reports for insert to authenticated
  with check (reporter = auth.uid());

-- Moderators use the Supabase dashboard/service role; clients cannot read reports.
-- For a ban, use an auth-level ban or add a denylist policy before opening widely.
