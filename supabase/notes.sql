-- Maple Route quest notes: run once in the SQL Editor (after market.sql, which turns on anonymous sign-in use).
-- Players fill in what the game data leaves open (this week's donation item, a quest's needs and counts,
-- who drops or hands over an item, who takes the hand-in). The app checks every name against the game
-- data; others' notes are used once two players agree. Anyone can read; you can only add or remove your own.

create table if not exists public.quest_notes (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  kind        text not null check (kind in ('week', 'need', 'drop', 'given', 'turnin')),
  quest       text not null default '' check (length(quest) <= 180),
  item        text not null default '' check (length(item) <= 60 and item !~* '(https?:|www\.)'),
  value       text not null default '' check (length(value) <= 60 and value !~* '(https?:|www\.)'),
  count       int check (count is null or count between 1 and 999),
  week        text check (week is null or week ~ '^[0-9]{4}-W[0-9]{2}$')
);
create unique index if not exists quest_notes_once on public.quest_notes (owner, kind, quest, item, value, coalesce(week, ''));
create index if not exists quest_notes_recent on public.quest_notes (created_at desc);

-- At most 30 notes an hour and 300 in all per player; week picks older than 3 weeks are cleared.
create or replace function public.quest_notes_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.owner := auth.uid(); new.created_at := now();
  if (select count(*) from public.quest_notes where owner = auth.uid() and created_at > now() - interval '1 hour') >= 30 then raise exception 'too many notes this hour'; end if;
  if (select count(*) from public.quest_notes where owner = auth.uid()) >= 300 then raise exception 'too many notes (limit 300)'; end if;
  delete from public.quest_notes where kind = 'week' and created_at < now() - interval '21 days';
  return new;
end $$;
drop trigger if exists quest_notes_guard on public.quest_notes;
create trigger quest_notes_guard before insert on public.quest_notes for each row execute function public.quest_notes_guard();

alter table public.quest_notes enable row level security;
grant select on public.quest_notes to anon, authenticated;
grant insert (kind, quest, item, value, count, week), delete on public.quest_notes to authenticated;
drop policy if exists "read notes" on public.quest_notes;
create policy "read notes" on public.quest_notes for select to anon, authenticated using (true);
drop policy if exists "add own notes" on public.quest_notes;
create policy "add own notes" on public.quest_notes for insert to authenticated with check (owner = auth.uid());
drop policy if exists "remove own notes" on public.quest_notes;
create policy "remove own notes" on public.quest_notes for delete to authenticated using (owner = auth.uid());
