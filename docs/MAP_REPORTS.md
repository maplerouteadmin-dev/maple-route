# Map/GPS report inbox

Players can report the map shown in MapleStory and explain what Live GPS got wrong from the app or its phone page. The form sends the typed map name and description, the map Maple Route currently believes, the app version and platform. It does **not** send a screenshot, character name, chat, raw OCR text, route, or game process data. Do not enter personal information in the description.

The report inbox uses its own anonymous Supabase identity, separate from Chat and Market. Review `supabase/map-reports.sql` and apply it in the Maple Route project SQL Editor. Run `supabase test db` against a local database first; `supabase/tests/map_reports_access.test.sql` checks that players can insert but cannot read, change or delete reports. The app cannot create the table itself. Until the migration is applied, the form will say reporting is not set up.

The project administrator should review new reports at least weekly while the form is enabled. In the SQL Editor:

```sql
select id, created_at, map_name, observed_map, description, version, platform, status
from public.map_reports
where status in ('new', 'reviewing')
order by created_at desc
limit 100;
```

First reproduce with a private minimap crop if needed, then fix recognition or map data and mark the report `fixed` (or `not_reproducible`) with an administrator-only update. Never publish the reporter's description or screenshot without reviewing it for names or personal information. Keep the inbox for no more than 90 days unless a report is actively being worked on; export anonymized issue details before deletion if needed. Anonymous account limits slow repeat posts but do not prevent determined spam; pause client inserts if the inbox is abused.

The first known case to investigate is **West Street Corner of Perion**, where GPS may stay on the prior Perion map. This is an observation from the player, not yet a confirmed reproduction or fix.
