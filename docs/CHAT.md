# Maple Route chat (open opt-in beta)

The Chat tab is a separate app-to-app service. It never reads, filters, or writes MapleStory chat, game memory, game input, or game network traffic. Players manually choose their world and channel; Here and Map use the map already known to Live GPS. Room membership is not proof that another player is actually in that world, channel, or map. No game account or character name is sent. Opening Chat creates a separate anonymous Supabase identity, distinct from Market, and sends room queries to the shared service.

## Access and privacy

Review `supabase/chat.sql` and apply it manually to the same Supabase project as Market. The app does not apply SQL. Rooms are **filters, not private access boundaries**: any signed-in app account can query another room. Never post personal information. To check grants and RLS policies on a local Supabase database, apply `chat.sql` there and run `supabase test db` (`supabase/tests/chat_access.test.sql`).

On the live beta, a signed-out REST request was denied for both messages and reports. One throwaway anonymous account could read messages but could not read reports, submit an explicit owner value, or delete messages. These are partial checks, not proof that all rules are correct; no public test message was posted. The local database policy suite and a two-account room/limit test are still required before claiming full verification.

This is an open beta, not an invite system. Any Maple Route user who opens Chat can post. A pseudonymous ID is displayed, but messages are public to other app users in that room. Messages are visible to clients for seven days; an administrator should also schedule a physical purge after the retention period. The app polls only while Chat is open.

## Report review and incident response

The Maple Route project owner is responsible for reviewing chat reports in the Supabase dashboard **daily while posting is enabled**. `supabase/chat-operations.sql` contains the owner-only report query, an emergency posting pause, and a seven-day physical-retention job to schedule after Supabase Cron is enabled. The review process is not automated: if daily review cannot be maintained, pause posting with the documented `REVOKE INSERT` command. For a substantiated report, remove the message with administrator access, block or ban the account where possible, and record the action outside the public chat. Reporters hide the reported message on their own device immediately.

Do not run owner-only SQL from a client or publish service-role credentials. Test the pause and retention job in a non-production database before applying them live. Anonymous accounts can be recreated, so an account ban is not a complete anti-spam solution. Enable a compatible CAPTCHA for anonymous sign-ins before widening chat beyond beta; this also requires a client challenge flow and a dashboard setting, not only a database change.

## Minimum safety controls

The database limits posting to one message per four seconds, 60/hour, and 250/day per anonymous account. Messages are 280 characters maximum and links are blocked. Users can locally mute words, hide repeated text, block a pseudonymous sender, and report a message. Reports are only readable by the database administrator, who must check them periodically. Anonymous users can recreate identities, so these limits are not robust anti-abuse protection. For a wider launch, add server-side bans, stronger rate limits, a moderation queue, and a clear retention/privacy policy. If abuse becomes unmanageable, disable posting by revoking `INSERT` on `public.chat_messages` from `authenticated` while preserving read access.

Public changes to the database must still be reviewed and tested before applying them live.
