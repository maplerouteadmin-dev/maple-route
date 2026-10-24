# Maple Route

A free, second-screen **GPS for MapleStory Classic World**. Share your game window once and Maple Route
follows you from map to map: which portal to take next, where you are on the map, where monsters
spawn, and what to do next for your quests, with optional voice directions.

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
- [Using it](#using-it)
- [How it works](#how-it-works)
- [Troubleshooting](#troubleshooting)
- [Privacy](#privacy)
- [Run it on your own PC (optional)](#run-it-on-your-own-pc-optional)
- [How this was made](#how-this-was-made)
- [Data and credits](#data-and-credits)
- [Feedback](#feedback)

## What it does

- **Live GPS**: reads the map name and your dot on the in-game mini map and gives turn-by-turn portal
  directions ("Take the portal on the right, to Henesys Hunting Ground I"), including taxis, boats and
  (optional) return scrolls.
- **Map view**: the map with your position, exits, NPCs and how many of each monster spawn where.
- **Pop-out window**: a small always-on-top window laid out like the mini map, to sit over a corner of
  the game.
- **Quests**: suggestions for your level, step-by-step guiding (talk to the NPC, the best maps to hunt or
  collect, hand-in), Quest Helper counts ticked off automatically, your in-game Available and Completed
  tabs read.
- **Voice**: optional spoken directions, monsters at your destination, quest steps. You pick what it says.
- **More**: world map, leveling guide, EXP-per-hour tracker, a "sell to shop or players?" check, and
  separate progress per character.

Parts marked **Untested** in the app (trade-chat prices, the shop-or-players check, reading the in-game
quest window) have not been checked in real play yet. Double-check what they tell you,
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
- **Market:** list items you're selling or looking for (equipment shows its real stats and upgrade slots
  left), browse other players' listings, and **Copy /find** to reach the seller in game. Maple Route is only
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

- Nothing read from your screen leaves your PC.
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

## Feedback

Bugs and ideas are welcome in [Issues](https://github.com/maplerouteadmin-dev/maple-route/issues) and
[Discussions](https://github.com/maplerouteadmin-dev/maple-route/discussions). The easiest way is
**Settings → Report a problem or a drop** (or **Report** on the Live GPS card): it opens an issue already
filled in with what the app saw (map names, its last mini map reads, your screen size; never chat or
player names), and **Copy mini map picture** puts the mini map on your clipboard to paste in. Nothing is
sent until you press Submit on GitHub. **Saw a drop?** Report it there too: drop tables aren't in the
game files, so player reports are how the drop data improves.

## License

The code is released under the [MIT License](LICENSE). Game names, art and data belong to their owners
(see above).
