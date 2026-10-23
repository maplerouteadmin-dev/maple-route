# Maple Route

A free, second-screen **GPS for MapleStory Classic World**. Share your game window once and Maple Route
follows you from map to map: which portal to take next, where you are on the map, where monsters
spawn, and what to do next for your quests, with optional voice directions.

> **Unofficial fan project.** Not affiliated with, endorsed by, or reviewed by Nexon. Use at your own risk.
> Whether third-party tools are allowed is up to Nexon's Terms of Service; please read them yourself.

## What it does

- **Live GPS**: reads the map name and your dot on the in-game mini map and gives turn-by-turn portal
  directions, including taxis, boats and (optional) return scrolls.
- **Map view and pop-out**: the map with your position, exits, NPCs and monster spawn points; a small
  always-on-top pop-out laid out like the mini map.
- **Quests**: suggestions for your level, step-by-step guiding (talk to the NPC, the best maps to hunt or
  collect, hand-in), Quest Helper counts ticked off, your in-game Available/Completed tabs read.
- **World map, leveling guides, EXP tracker**, a sell-to-shop-or-players check, and more.

## How it reads the game, and what it never does

Maple Route only looks at the picture of the window you share, the same way OBS or Discord screen
sharing does, and reads it **on your computer**.

- It **never** reads or changes game memory or game files.
- It **never** touches the game's network traffic.
- It **never** presses keys or clicks for you, and does not automate anything. You play; it gives directions.
- Nothing from your game is uploaded. Your progress is stored in your own browser.
- The public site counts, anonymously and without cookies ([GoatCounter](https://www.goatcounter.com/)), only that the app was opened and that Live GPS was started, so I know it is used. Turn it off in **Settings → How screen reading works → Don't count my visits**.
- The optional trade-chat price log is **off by default**. When on, it saves adverts (seller, item, price) in your browser only.

## Using it

1. Open **https://maplerouteadmin-dev.github.io/maple-route/** in **Chrome or Edge** on a PC.
2. Press **Start Live GPS** and pick the **MapleStory window** in the share prompt.
3. Choose a destination under **Go to**, or press **Go** on a suggested quest.

Tips: keep the in-game mini map open and uncovered; run the game windowed or borderless.

**First visits are slower.** The first time you open Maple Route, and the first time you enter each map,
it downloads what it needs (the text reader once, then each map's picture). Everything is saved in your
browser, so after that the app and those maps open quickly.

## Data and credits

- Maps, portals, NPCs, monsters, quests and map pictures: [OSMS Data Explorer](https://osmsdataexplorer.com/)
  (loaded from their site in your browser, not copied into this project). Game art © NEXON.
- Quest steps, drops and shops: [MapleClassic Wiki](https://mapleclassic.wiki/) contributors,
  licensed [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
- Taxi fares: MapleClassic Wiki. Text recognition: [Tesseract.js](https://github.com/naptha/tesseract.js) (Apache-2.0).

Because the wiki content is non-commercial, Maple Route is and stays free: no ads, no paid features.

## Feedback

Bugs and ideas are welcome in [Issues](https://github.com/maplerouteadmin-dev/maple-route/issues) and [Discussions](https://github.com/maplerouteadmin-dev/maple-route/discussions). For a misread map, a
screenshot of the top-left mini map helps the most (crop out any names).

## License

The code is released under the [MIT License](LICENSE). Game names, art and data belong to their owners
(see above). Developer notes are in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
