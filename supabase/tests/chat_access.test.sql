-- Run with `supabase test db` against a local database after applying chat.sql.
-- pgTAP wraps this test in a rollback; it does not create public chat messages.
begin;
select plan(16);

select ok((select relrowsecurity from pg_class where oid = 'public.chat_messages'::regclass), 'chat messages use RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.chat_reports'::regclass), 'chat reports use RLS');
select ok(not has_table_privilege('anon', 'public.chat_messages', 'SELECT'), 'signed-out users cannot read messages');
select ok(not has_table_privilege('anon', 'public.chat_messages', 'INSERT'), 'signed-out users cannot post');
select ok(not has_table_privilege('anon', 'public.chat_reports', 'SELECT'), 'signed-out users cannot read reports');
select ok(not has_table_privilege('anon', 'public.chat_reports', 'INSERT'), 'signed-out users cannot report');
select ok(has_table_privilege('authenticated', 'public.chat_messages', 'SELECT'), 'app users can read messages');
select ok(has_column_privilege('authenticated', 'public.chat_messages', 'kind', 'INSERT'), 'app users can post');
select ok(not has_column_privilege('authenticated', 'public.chat_messages', 'owner', 'INSERT'), 'clients cannot set owner');
select ok(not has_table_privilege('authenticated', 'public.chat_messages', 'UPDATE'), 'clients cannot edit messages');
select ok(not has_table_privilege('authenticated', 'public.chat_messages', 'DELETE'), 'clients cannot delete messages');
select ok(not has_table_privilege('authenticated', 'public.chat_reports', 'SELECT'), 'clients cannot read reports');
select ok(has_column_privilege('authenticated', 'public.chat_reports', 'message_id', 'INSERT'), 'app users can submit reports');
select ok(not has_column_privilege('authenticated', 'public.chat_reports', 'reporter', 'INSERT'), 'clients cannot set reporter');
select ok(exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_messages' and cmd = 'SELECT' and policyname = 'members read recent chat'), 'recent-message read policy exists');
select ok(exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'chat_messages' and cmd = 'INSERT' and policyname = 'members post chat'), 'message post policy exists');

select * from finish();
rollback;
