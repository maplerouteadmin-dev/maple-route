# Maple Route chat (open opt-in beta)

The Chat tab is a separate app-to-app service. It never reads, filters, or writes MapleStory chat, game memory, game input, or game network traffic. Players manually choose their world and channel; Here and Map use the map already known to Live GPS. Room membership is not proof that another player is actually in that world, channel, or map. No game account or character name is sent. Opening Chat creates a separate anonymous Supabase identity, distinct from Market, and sends room queries to the shared service.

## Before enabling it

Review `supabase/chat.sql` and apply it manually to the same Supabase project as Market. The SQL has not been applied by the app. Do not publish the client until this is done and tested with two independent anonymous accounts. Check that an unauthenticated request cannot read or post, a user cannot forge the owner or timestamp, and a user cannot read reports. Test the 4-second, hourly, and daily post limits. Verify Here, Map, Channel, and World rooms do not leak into one another.

This is an open beta, not an invite system. Any Maple Route user who opens Chat can post. A pseudonymous ID is displayed, but messages are public to other app users in that room. Messages are visible to clients for seven days; an administrator should also schedule a physical purge after the retention period. The app polls only while Chat is open.

## Minimum safety controls

The database limits posting to one message per four seconds, 60/hour, and 250/day per anonymous account. Messages are 280 characters maximum and links are blocked. Users can locally mute words, hide repeated text, block a pseudonymous sender, and report a message. Reports are only readable by the database administrator, who must check them periodically. Anonymous users can recreate identities, so these limits are not robust anti-abuse protection. For a wider launch, add server-side bans, stronger rate limits, a moderation queue, and a clear retention/privacy policy. If abuse becomes unmanageable, disable posting by revoking `INSERT` on `public.chat_messages` from `authenticated` while preserving read access.

No release, push, or live database migration should happen before review.
