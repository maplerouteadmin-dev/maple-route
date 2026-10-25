# Marketplace setup

The Market tab works in **practice mode** (listings stay in this browser) until a Supabase project is
connected. To make listings shared between all players:

1. Sign up at <https://supabase.com> with the project's own (pseudonymous) email, and create a project
   (free plan, any region near your players). Note its **Project URL** and **anon public key**
   (Project Settings → API).
2. **Authentication → Sign In / Providers**: turn on **Allow anonymous sign-ins**. Players never make an
   account; each browser gets an anonymous id that owns the listings it posts.
3. **SQL Editor**: paste and run [`supabase/market.sql`](../supabase/market.sql). It creates the
   `listings` table and its rules:
   - anyone can read live listings; only the poster can remove theirs; nobody can edit (remove and post
     again);
   - listings expire after 7 days (hidden from everyone but the poster, who can relist or remove
     them); at most 20 live listings per player;
   - character names must look like game names; notes cannot contain links or real-money payment words.
4. Put the URL and key in `src/marketstore.js` (`MARKET_URL`, `MARKET_KEY`). The anon key is meant to be
   public; the table rules above are what protect the data.
5. Optional: **Authentication → Attack Protection** → turn on CAPTCHA if spam shows up, and the cleanup
   line at the end of `market.sql` as a daily cron.

What players see and agree to: mesos only (real-money trading is against the game's rules), the
seller's character name and channel are public, contact happens in game (`/find` + whisper).
Reported listings arrive as GitHub issues labelled `listing`; remove one in **Table Editor → listings**.

## Keeping it running

- **Pausing:** Supabase pauses a free project after about a week without activity. The public repo's
  **Keep the Market awake** workflow (Actions tab) reads one listing every day to prevent that. GitHub
  switches scheduled workflows off after 60 days without a commit; if that happens, open the Actions tab
  and press **Enable workflow**. If the project ever does pause, **Restore** it from the Supabase dashboard.
- **Spam:**
  1. First: **Authentication → Rate Limits** and lower *anonymous sign-ins per hour* (per IP). Each new
     anonymous player needs one sign-in, and the 20-live-listings limit is per player, so this caps how
     fast one person can flood the Market. No app change needed.
  2. Remove spam in **Table Editor → listings** (offers on a listing go with it). To clear everything one
     player posted, copy the `owner` of one of their listings and run in the SQL Editor:
     `delete from public.listings where owner = '<owner id>';`
  3. Last resort, CAPTCHA (**Authentication → Attack Protection**): the app must first send a CAPTCHA
     answer when it signs in, so turning it on alone stops new players from using the Market. Ask for the
     app change (a Cloudflare Turnstile or hCaptcha widget) before switching it on.
- **Reports** arrive as GitHub issues labelled `listing` (from a listing's Report link).

