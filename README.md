# Maple Route

A free, second-screen **GPS for MapleStory Classic World**. Share your game window once and Maple Route
follows you from map to map: which portal to take next, where you are on the map, where monsters
spawn, and what to do next for your quests, with optional voice directions. It also has a **player
market**: list items with their real stats, find what you need, and make offers, then trade in game.

The Quests tab has an early **character quest journey preview** based on your saved level, job or planned job, and confirmed quest completions. It shows eligible quests and can pass one to Live GPS; a full automatic all-quest route is still in progress.

### ▶ Open the app: **https://maplerouteadmin-dev.github.io/maple-route/**

Nothing to install. Use Chrome or Edge on a Windows PC.

> [!WARNING]
> **Unofficial fan project. Use at your own risk.**
> Maple Route is not made, endorsed or reviewed by Nexon. It only looks at the picture of the window you
> share (like OBS or Discord screen sharing) and never touches the game itself. Whether third-party tools
> are allowed is decided by Nexon's Terms of Service, which can change. Read them yourself and decide for
> your own account. The authors accept no responsibility for any action taken on your account.
>
> **Built with AI.** Maple Route was created by **maplerouteadmin-dev** and "vibe coded": the idea,
> design and testing are theirs, and the code was written by AI coding assistants. See
> [How this was made](#how-this-was-made).

## Contents

- [What it does](#what-it-does)
- [What it never does](#what-it-never-does)
- [Setup](#setup)
- [Steam Deck (beta)](#steam-deck-beta)
- [PC couch mode](#pc-couch-mode)
- [Using it](#using-it)
- [How it works](#how-it-works)
- [Troubleshooting](#troubleshooting)
- [Privacy](#privacy)
- [Run it on your own PC (optional)](#run-it-on-your-own-pc-optional)
- [How this was made](#how-this-was-made)
- [Data and credits](#data-and-credits)
- [Feedback](#feedback)

## PC couch mode

The Windows desktop-shortcut app can put the full Maple Route interface on a phone while the PC reads the game screen.

1. Open Maple Route on the PC and press **Start live GPS**. Choose the MapleStory window in the browser's sharing picker.
2. Press **Couch mode · phone**, then **Share with phone**. Scan the QR code using a phone on the same Wi-Fi.
3. Use the phone for directions, routes, quests, and settings. **Stop reading** on the phone stops the PC reader. Turn phone sharing off on the PC to end the session and invalidate its link.

The PC must remain on with Maple Route open. The phone never receives game screenshots, and it cannot start a new screen share: the browser requires that action on the PC. Anyone with the current QR link can control Maple Route until sharing is turned off. This mode is available in the local desktop-shortcut app, not the hosted website.

## Steam Deck (beta)

Play in **Gaming Mode** with a small Maple Route map over the game and the full app on your phone. This is a
**beta**: it has been tested on one Steam Deck with MapleStory Classic World running through Proton.

**Set it up once (about two minutes):**

1. Switch the Deck to **Desktop Mode** (Steam button → Power → Switch to Desktop).
2. Download **`Maple-Route-…-linux-x86_64.AppImage`** from the
   [latest release](https://github.com/maplerouteadmin-dev/maple-route/releases) (it is in the release's
   *Assets*).
3. In the Downloads folder, right-click the file → **Properties → Permissions → Is executable**, then
   double-click it.
4. Maple Route asks **"Use Maple Route in Gaming Mode?"** → press **Set up Gaming Mode**. That is all
   (no terminal, no admin password).
5. Go back to **Gaming Mode** and start MapleStory as usual.

**Playing:**

- While MapleStory is open, a small box appears in the **bottom-left corner** of the game. The first time
  it shows a **QR code**: scan it with your phone (on the same Wi-Fi as the Deck) and press
  **Start reading**. From then on Maple Route reads the game by itself whenever MapleStory is open.
- The box then shows the map around you, your dot, the next exit and the route line, plus what to do on
  the map you are on, and your EXP/hour. Move it to another corner from your phone; switch on
  **Pop-out: EXP only** for a small strip with just EXP/hour and no map.
- Your phone has the whole app: directions, the map, **Do all quests together** with its checklist,
  **Next step ✓**, map/GPS reporting, and every setting. Bookmark the page; the link keeps working on your Wi-Fi.
- **Stop** on your phone stops reading until you press Start again. When you close MapleStory, the box
  goes away and reading stops.

If the GPS stays on the wrong map, tap **Report map** on the phone. Enter the name shown in MapleStory
and what happened. The report goes to a private administrator inbox, without screenshots or chat.
See [map report setup and review](docs/MAP_REPORTS.md).

**Voice:** natural voices from [Piper](https://github.com/rhasspy/piper), running on the Deck (no internet while
you play). It downloads once in the background, about 90 MB, the first time Maple Route runs; pick another voice
in Settings → Voice. Until it's ready, the basic built-in voice (`espeak-ng`) speaks.

**How it reads the game:** in Gaming Mode it reads the Deck's screen the same way Steam's own game
recording does. It never reads game memory, never presses anything, and never touches the game or its
connection. The phone page only works on your home network and needs the secret in its link.

**To remove it:** open the AppImage in Desktop Mode → menu **Maple Route → Remove Gaming Mode service**.

In Desktop Mode you can also just use the AppImage as a normal window: press **Start live GPS** and pick
the MapleStory window. Details and what was tested:
[Steam Deck notes](docs/STEAM_DECK.md).

## What it does

- **Live GPS**: reads the map name and your dot on the in-game mini map and gives turn-by-turn portal
  directions ("Take the portal on the right, to Henesys Hunting Ground I"), including taxis, boats and
  (optional) return scrolls.
- **Map view**: the map with your position, exits, NPCs and how many of each monster spawn where. Click it
  for details: a monster (stats, drops, better maps), an NPC (quests, what they sell) or the map itself.
- **Pop-out window**: a small always-on-top window laid out like the mini map, to sit over a corner of
  the game.
- **Quests**: suggestions for your level, step-by-step guiding (talk to the NPC, the best maps to hunt or
  collect, hand-in), Quest Helper counts ticked off automatically, your in-game Available, In Progress and Completed
  tabs read. **Do all quests together** plans every quest you're doing, and the ones your Available tab
  offers, or that you add by name, as one numbered checklist: pick up each quest, hunt (each map chosen for
  what's still needed), buy what shops sell, hand in. Tick what's done and the trip plans again.
- **Market**: buy and sell listings for any tradeable item, with real stats, slots left, filters, offers,
  a 🔔 for anything that needs you, and trade-chat prices. Trades happen in game, in mesos.
- **Report a map/GPS problem**: name the real map and send a short report to the private admin inbox. Drop reports still open a pre-filled GitHub issue.
- **Voice**: optional spoken directions, monsters at your destination, quest steps. You pick what it says.
- **More**: world map, leveling guide, EXP-per-hour tracker, crafting recipes and where to craft, a
  "sell to shop or players?" check, and separate progress per character.

Parts marked **Untested** in the app (the shop-or-players check, reading an item from the game screen)
have not been checked in real play yet. Double-check what they tell you,
and please report anything wrong.

## What it never does

- It **never** reads or changes game memory or game files.
- It **never** touches the game's network traffic.
- It **never** presses keys or clicks for you, and does not automate anything. You play; it gives directions.
- Nothing from your game is uploaded. The picture is read on your PC and your progress stays in your browser.

## Setup

**You need:** a Windows PC, **Chrome or Edge** (other browsers can't share a window), and MapleStory
Classic World running. A second monitor is nice but not required.

1. **In the game:**
   - Run it **windowed** or **borderless** (exclusive full screen can't be shared).
   - Keep the **mini map open** (top-left) and not covered by other in-game windows.
   - Optional: keep the **Quest Helper** open so quest counts are ticked off for you.
2. **Open the app:** https://maplerouteadmin-dev.github.io/maple-route/
3. Press **Start Live GPS**. In the browser's share prompt choose the **Window** tab, pick
   **MapleStory**, and press **Share**.
   - Share the **window**, not the whole screen: then the pop-out or other windows can sit over the
     game without blocking what the app reads.
   - Don't pick a browser tab: the app will tell you and stop.
4. Walk into any portal (or just wait a second). The Live GPS card shows the map you're on and your dot
   appears on the map.

**The first time is slower.** The first visit downloads the text reader once, and each map's picture is
downloaded the first time you enter that map. Everything is saved in your browser, so after that it is
quick.

## Using it

- **Go somewhere:** open **Go to**, pick a map, an NPC, a monster or an item, and press **Go**. Live GPS
  then tells you which portal to take on every map. **Cancel** on the Live GPS card clears it.
- **Quests:** in **Go to** or **Quests**, press **Go** on a suggested quest (or **Guide me**). The app walks
  you through it: the NPC to talk to, the best maps to hunt or collect on (planned as one trip that ends at
  the hand-in), then the hand-in. Crafted items (jewels, ingots, screws…) use the game's own recipes:
  hunt the ingredients, then stop at the crafter (Chrishrama in Sleepywood for jewels, Silas Irons in
  Perion for ingots…). Drop data comes from the MapleClassic Wiki; where it has none, the monsters named
  in the game's quest text are used and marked "best guess" (drop tables live on Nexon's servers, so no
  site has official ones).
  - In game, press **Q** and open the **Available** or **Completed** tab: the app reads them so its
    suggestions match what the game offers you.
- **All quests at once:** tick **Plan all my quests together** under "Where to hunt" for one trip that
  covers every quest you're doing, then each hand-in, nearest first.
- **Market:** list items you're selling or looking for: pick from every item in the game (equipment starts
  at its clean stats for you to edit, plus upgrade slots left) or type a custom item, browse other players' listings with filters (category, equipment or weapon type, job, level, stats,
  slots left, scroll success, price), make or take **offers** (sellers can set a lowest offer or fixed price),
  and **Copy /find** to reach the seller in game. A 🔔 on the Market tab shows offers waiting, answers to
  your offers and listings that expired or end soon. Only tradeable items can be listed. **Read item from game
  screen** (Untested) fills a listing from the item tooltip you hover. Maple Route is only
  a noticeboard: we never take, hold or ask for your mesos or items. Every trade is settled **in game, in
  mesos**, between the two players. Never pay outside the game (real-money trading is against the game's
  rules), and check the item in the trade window before accepting.
- **Travel options:** the **Taxis** switch on the Live GPS card, plus **Nearest town scroll** and **Town
  scrolls**, change how routes and hop counts are worked out.
- **Voice:** **Settings → Voice** picks the voice, the speed, and what is said out loud (directions,
  monsters at the destination or on every map, arrival, NPCs, quests, warnings).
- **Pop-out window:** press **Pop-out window** on the Live GPS card for a small always-on-top view.
- **Characters:** the app notices your character name and offers to keep separate progress for each.
- **Backups:** progress lives in this browser only. **Settings → Download progress backup** saves a file
  you can restore on another PC or browser.

## How it works

1. **Screen sharing.** The browser's standard screen-share (the same feature video calls use) gives the
   page a live picture of the MapleStory window. The app looks at a frame a few times a second.
2. **Which map am I on?** It finds the mini map's pale-blue title strip in the top-left corner and reads
   the map name with [Tesseract](https://github.com/naptha/tesseract.js) text recognition, running in
   your browser. When the text is unclear, it compares the mini map picture against the neighbouring
   maps instead.
3. **Where am I?** It finds your gold dot and the teal portal rings on the mini map and lines them up
   with the map's known portal positions to place you on the map.
4. **Where next?** Portals, NPCs and monsters come from public game data
   ([OSMS Data Explorer](https://osmsdataexplorer.com/)). The app works out the shortest route through
   portals (plus taxis, boats and scrolls if you allow them) and words each step.
5. **Optional extras** read other corners of the same picture: the Quest Helper panel, the EXP bar and
   level, the quest window when you open it, and trade chat (prices, off by default).

Everything above runs on your PC inside the browser tab. Close the tab or press **Stop** and it stops
looking.

## Troubleshooting

| Problem | Try |
| --- | --- |
| "Can't see your mini map" | Open the mini map in game, make sure nothing covers it, and share the **MapleStory window**, not a browser tab. |
| Wrong or no map name | Walk through a portal or wait a few seconds. If one map is always misread, please report it (see Feedback). |
| The share stopped (game restarted, window closed) | Press **Reconnect** on the Live GPS card and pick the MapleStory window again. Your route is kept. |
| A map picture is blank or slow | The picture is still downloading (the data site may be busy). It retries by itself and is saved once loaded. |
| No voice | Check **Settings → Voice** (press **Test voice**) and that the browser tab isn't muted. Edge has the most natural voices. |
| Share prompt has no MapleStory window | Run the game windowed or borderless, and use Chrome or Edge. |

## Privacy

- Screenshots and OCR text stay on your device.
- If you send a map report, its typed map name and description, Maple Route's believed map, app version and platform go to a private administrator inbox. No screenshot or raw OCR text is attached automatically. Reports use a separate anonymous account; see [map report privacy and review](docs/MAP_REPORTS.md).
- Progress, settings and saved map pictures are stored in your browser (clearing site data removes them).
- The public site counts, anonymously and without cookies ([GoatCounter](https://www.goatcounter.com/)),
  only two things: that the app was opened and that Live GPS was started. No game data, map names or
  player names. Turn it off in **Settings → How screen reading works → Don't count my visits**.
- The optional trade-chat price log is **off by default**. When on, it saves adverts (seller, item,
  price) in your browser only.

## Run it on your own PC (optional)

You don't need this; the website works on its own. If you'd rather run your own copy, install
[Node.js](https://nodejs.org/) 22 or newer, then:

```bash
git clone https://github.com/maplerouteadmin-dev/maple-route.git
cd maple-route
npm ci
npm run build
node scripts/serve.mjs 5174
```

Open http://127.0.0.1:5174 in Chrome or Edge. Your own copy also keeps downloaded map pictures in
`%LOCALAPPDATA%\MapleRoute\cache`. Developer notes are in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## How this was made

Maple Route was created by **maplerouteadmin-dev**, a Classic World player who wanted a GPS for the game.
It is **vibe coded**: they came up with the idea, designed every feature, set the safety rules, played
with it in live game sessions, tracked down what went wrong and decided how it should work. The code
itself was written by AI coding assistants (OpenAI Codex, then Anthropic's Claude Code) from their
direction.

What that means for you:

- The code has **not** been reviewed line by line by an experienced developer. Expect bugs and rough edges.
- It is checked by an automated test suite (run on every update) and by real play on Classic World, on only a
  couple of screen sizes so far. Other resolutions and maps may be read less reliably.
- The safety rules above (screen picture only: no memory, no network, no inputs) were set by the creator
  and are kept deliberately. The code is open, so anyone can check them.

## Data and credits

- Maps, portals, NPCs, monsters, quests and map pictures: [OSMS Data Explorer](https://osmsdataexplorer.com/)
  (loaded from their site in your browser, not copied into this project). Game art © NEXON.
- Quest steps, drops and shops: [MapleClassic Wiki](https://mapleclassic.wiki/) contributors,
  licensed [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
- Taxi fares: MapleClassic Wiki. Text recognition: [Tesseract.js](https://github.com/naptha/tesseract.js) (Apache-2.0).

Because the wiki content is non-commercial, Maple Route is and stays free: no ads, no paid features.
MapleStory is a trademark of NEXON. This project is not affiliated with NEXON.

- **Voices on the Steam Deck:** [Piper](https://github.com/rhasspy/piper) (MIT) with voices from
  [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices): Kristin (public domain), Joe (CC0),
  Alba (CC BY 4.0) and Northern English Male (CC BY-SA 4.0). Downloaded on the Deck, not bundled.

## Feedback

Bugs and ideas are welcome in [Issues](https://github.com/maplerouteadmin-dev/maple-route/issues) and
[Discussions](https://github.com/maplerouteadmin-dev/maple-route/discussions). For a wrong or stuck map,
use **Report map** on your phone or **Report** in the app: enter the map shown in MapleStory and what
went wrong. That sends a short report to the private administrator inbox, without a screenshot or chat.
**Copy mini map picture** is optional and stays on your clipboard until you choose to share it.
**Saw a drop?** The separate drop button still opens a GitHub issue for you to review and submit;
player reports help improve drop data that is not in the game files.

## License

The code is released under the [MIT License](LICENSE). Game names, art and data belong to their owners
(see above).
