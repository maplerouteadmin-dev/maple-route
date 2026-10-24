-- Maple Route marketplace offers: run once in the SQL Editor after market.sql.
-- Sellers choose whether a listing takes offers and the lowest one they will consider; buyers offer
-- a price; the seller accepts or declines. The trade itself still happens in game, in mesos.

-- Offer settings on a listing, the only columns its owner may change after posting.
alter table public.listings add column if not exists offers_allowed boolean not null default true;
alter table public.listings add column if not exists min_offer bigint check (min_offer is null or min_offer between 1 and 10000000000);
grant update (offers_allowed, min_offer) on public.listings to authenticated;
drop policy if exists "owner changes offer settings" on public.listings;
create policy "owner changes offer settings" on public.listings for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

create table if not exists public.offers (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings (id) on delete cascade,
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  price       bigint not null check (price between 1 and 10000000000),
  quantity    int not null default 1 check (quantity between 1 and 9999),
  ign         text not null check (ign ~ '^[A-Za-z0-9]{4,12}$'),
  note        text not null default '' check (length(note) <= 120
                and note !~* '(https?:|www\.|discord\.gg|paypal|venmo|cash ?app|zelle|crypto|real money|\$\s?[0-9]|[0-9]\s?\$|\musd\M|dollars?)'),
  status      text not null default 'open' check (status in ('open', 'accepted', 'declined'))
);
create index if not exists offers_listing on public.offers (listing_id);
create index if not exists offers_owner on public.offers (owner);

-- New offers: only on a live selling listing that takes offers, at or above its lowest offer, not
-- your own; one open offer per listing per player (a new one replaces it); at most 30 open offers each.
create or replace function public.offers_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare l public.listings;
begin
  select * into l from public.listings where id = new.listing_id;
  if l.id is null or l.expires_at <= now() or l.side <> 'sell' then raise exception 'listing is not open'; end if;
  if not l.offers_allowed then raise exception 'the seller is not taking offers'; end if;
  if l.min_offer is not null and new.price < l.min_offer then raise exception 'offer below the seller''s lowest offer'; end if;
  if l.owner = auth.uid() then raise exception 'cannot offer on your own listing'; end if;
  new.owner := auth.uid(); new.created_at := now(); new.status := 'open';
  delete from public.offers where listing_id = new.listing_id and owner = auth.uid() and status = 'open';
  if (select count(*) from public.offers where owner = auth.uid() and status = 'open') >= 30 then raise exception 'too many open offers (limit 30)'; end if;
  return new;
end $$;
drop trigger if exists offers_guard on public.offers;
create trigger offers_guard before insert on public.offers for each row execute function public.offers_guard();

alter table public.offers enable row level security;

-- An offer is seen by the buyer who made it and the seller it was made to; nobody else.
drop policy if exists "see own offers" on public.offers;
create policy "see own offers" on public.offers for select to authenticated using (
  owner = auth.uid() or exists (select 1 from public.listings l where l.id = listing_id and l.owner = auth.uid()));
drop policy if exists "make offers" on public.offers;
create policy "make offers" on public.offers for insert to authenticated with check (owner = auth.uid());
-- The buyer withdraws, the seller clears: either side may delete.
drop policy if exists "remove offers" on public.offers;
create policy "remove offers" on public.offers for delete to authenticated using (
  owner = auth.uid() or exists (select 1 from public.listings l where l.id = listing_id and l.owner = auth.uid()));
-- Only the seller answers (accepted / declined), and only the status.
revoke update on public.offers from anon, authenticated;
grant update (status) on public.offers to authenticated;
drop policy if exists "seller answers offers" on public.offers;
create policy "seller answers offers" on public.offers for update to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and l.owner = auth.uid()))
  with check (status in ('accepted', 'declined'));
revoke all on public.offers from anon;
