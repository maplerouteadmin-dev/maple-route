-- Maple Route marketplace: run once in the Supabase project's SQL editor.
-- Also in the dashboard: Authentication → Sign In / Providers → turn on "Allow anonymous sign-ins".
-- Anyone can read live listings; a listing belongs to the (anonymous) user who posted it, and only
-- they can remove it. Listings expire after 7 days; at most 20 live listings per user.

create table if not exists public.listings (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  side        text not null check (side in ('sell', 'buy')),
  item_id     text not null check (length(item_id) between 1 and 20),
  item_name   text not null check (length(item_name) between 1 and 160),
  price       bigint not null check (price between 1 and 10000000000),
  quantity    int not null default 1 check (quantity between 1 and 9999),
  stats       jsonb check (stats is null or (jsonb_typeof(stats) = 'object' and length(stats::text) <= 600)),
  slots_left  int check (slots_left between 0 and 20),
  scrolled    int check (scrolled between 0 and 20),
  ign         text not null check (ign ~ '^[A-Za-z0-9]{4,12}$'),
  channel     int check (channel between 1 and 40),
  note        text not null default '' check (length(note) <= 200
                and note !~* '(https?:|www\.|discord\.gg|paypal|venmo|cash ?app|zelle|crypto|real money|\$\s?[0-9]|[0-9]\s?\$|\musd\M|dollars?)')
);

create index if not exists listings_live on public.listings (expires_at desc, item_id);

-- Nobody can push expiry beyond 7 days or post for someone else.
create or replace function public.listings_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.owner := auth.uid();
  new.created_at := now();
  if new.expires_at > now() + interval '7 days' or new.expires_at <= now() then new.expires_at := now() + interval '7 days'; end if;
  if (select count(*) from public.listings where owner = auth.uid() and expires_at > now()) >= 20 then
    raise exception 'too many live listings (limit 20)';
  end if;
  return new;
end $$;
drop trigger if exists listings_guard on public.listings;
create trigger listings_guard before insert on public.listings for each row execute function public.listings_guard();

alter table public.listings enable row level security;

drop policy if exists "read live listings" on public.listings;
create policy "read live listings" on public.listings for select using (expires_at > now());

drop policy if exists "post own listings" on public.listings;
create policy "post own listings" on public.listings for insert to authenticated with check (owner = auth.uid());

drop policy if exists "remove own listings" on public.listings;
create policy "remove own listings" on public.listings for delete to authenticated using (owner = auth.uid());

-- No updates at all: change = remove and post again (keeps the 7-day expiry honest).
revoke update on public.listings from anon, authenticated;

-- Optional housekeeping (Database → Cron, or run by hand): delete listings expired over a week ago.
-- delete from public.listings where expires_at < now() - interval '7 days';
