-- Run with `supabase test db` against a local database after applying map-reports.sql.
begin;
select plan(10);
select ok((select relrowsecurity from pg_class where oid = 'public.map_reports'::regclass), 'map reports use RLS');
select ok(not has_table_privilege('anon', 'public.map_reports', 'SELECT'), 'signed-out users cannot read reports');
select ok(not has_table_privilege('anon', 'public.map_reports', 'INSERT'), 'signed-out users cannot send reports');
select ok(not has_table_privilege('authenticated', 'public.map_reports', 'SELECT'), 'players cannot read inbox');
select ok(not has_table_privilege('authenticated', 'public.map_reports', 'UPDATE'), 'players cannot change status');
select ok(not has_table_privilege('authenticated', 'public.map_reports', 'DELETE'), 'players cannot remove reports');
select ok(has_column_privilege('authenticated', 'public.map_reports', 'map_name', 'INSERT'), 'players can send a map name');
select ok(not has_column_privilege('authenticated', 'public.map_reports', 'owner', 'INSERT'), 'players cannot claim another owner');
select ok(not has_column_privilege('authenticated', 'public.map_reports', 'status', 'INSERT'), 'players cannot set status');
select ok(exists(select 1 from pg_policies where schemaname = 'public' and tablename = 'map_reports' and cmd = 'INSERT' and policyname = 'members send map reports'), 'insert policy exists');
select * from finish();
rollback;
