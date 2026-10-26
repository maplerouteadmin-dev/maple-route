-- Owner-only examples for the Supabase SQL Editor. Do not run these from the app.
-- Review recent reports, including the message and room. Reports never have a client SELECT grant.
select r.id, r.created_at, r.reason, r.reporter, m.id as message_id,
       m.created_at as message_created_at, m.owner as message_owner,
       m.kind, m.world, m.channel, m.map_id, m.body
from public.chat_reports r
join public.chat_messages m on m.id = r.message_id
order by r.created_at desc
limit 100;

-- If spam or abuse cannot be reviewed promptly, pause posting while keeping old messages readable:
-- revoke insert on public.chat_messages from authenticated;
-- When ready to reopen, restore only the five client-written columns:
-- grant insert (kind, world, channel, map_id, body) on public.chat_messages to authenticated;

-- After enabling Supabase Cron in the dashboard, schedule physical seven-day retention once.
-- Confirm the scheduled job appears and succeeds in Cron > Jobs / History.
-- select cron.schedule('maple-route-chat-retention', '0 4 * * *',
--   $$delete from public.chat_messages where created_at < now() - interval '7 days'$$);
