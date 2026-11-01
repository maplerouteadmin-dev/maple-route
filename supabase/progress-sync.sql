-- Maple Route: sync a player's quest plan between their own devices (PC and Steam Deck).
-- Run once in the Supabase SQL editor of the Market project. Safe to run again.
--
-- A device makes a random sync code (about 100 bits) and the player types it on their other device.
-- Only a SHA-256 hash of the code is stored, so the table never holds the code itself. The table has
-- no policies and no grants: clients reach it only through the two functions below, which need the
-- full code, so nobody can list or guess other players' rows.

create table if not exists public.progress_sync (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  data jsonb not null check (octet_length(data::text) <= 300000),
  updated_at timestamptz not null default now()
);
alter table public.progress_sync enable row level security;
revoke all on public.progress_sync from anon, authenticated;

-- Read the saved plan for a code (no row = nothing saved yet).
create or replace function public.sync_get(code text)
returns table (data jsonb, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.data, s.updated_at from public.progress_sync s
  where length(code) between 20 and 64 and s.code_hash = encode(sha256(convert_to(code, 'UTF8')), 'hex');
$$;

-- Save the plan for a code. `base` is the updated_at this device last saw: when another device saved
-- since then, nothing is written and the newer copy comes back (that device then takes it).
create or replace function public.sync_put(code text, payload jsonb, base timestamptz default null)
returns table (data jsonb, updated_at timestamptz, saved boolean)
language plpgsql security definer set search_path = public as $$
declare
  h text;
  existing public.progress_sync%rowtype;
begin
  if length(code) not between 20 and 64 then raise exception 'invalid sync code'; end if;
  if octet_length(payload::text) > 300000 then raise exception 'plan too large'; end if;
  h := encode(sha256(convert_to(code, 'UTF8')), 'hex');
  select * into existing from public.progress_sync s where s.code_hash = h for update;
  if found and base is not null and existing.updated_at > base then
    return query select existing.data, existing.updated_at, false;
    return;
  end if;
  insert into public.progress_sync as s (code_hash, data, updated_at) values (h, payload, now())
    on conflict (code_hash) do update set data = excluded.data, updated_at = now();
  return query select s.data, s.updated_at, true from public.progress_sync s where s.code_hash = h;
end;
$$;

revoke all on function public.sync_get(text) from public;
revoke all on function public.sync_put(text, jsonb, timestamptz) from public;
grant execute on function public.sync_get(text) to anon, authenticated;
grant execute on function public.sync_put(text, jsonb, timestamptz) to anon, authenticated;
