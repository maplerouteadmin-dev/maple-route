# Changelog

## 1.0.11

- The voice says map numbers as numbers: "Ant Tunnel 1", not "Ant Tunnel eye" (every map name ending in a Roman numeral).

## 1.0.10

- More room for the quest checklist on the Live GPS page: Choose destination sits at the end of the directions, the card title, map legend and extra spacing are gone, the top menu stays on one line, and the map gives up a little more height.

## 1.0.9

- The Report button moved to the top menu, right of Settings.

## 1.0.8

- Separate switches for taxis (Regular Cabs and Phil) and the VIP taxi (10,000 mesos to Ant Tunnel Park), on the Live card and in the route options. The VIP taxi is off unless you turn it on.

## 1.0.7

- "Guide a quest · Do all quests together" sits in the header next to Choose destination, and also lists quests your Available tab offers (marked not started).
- Missing a quest? Search it in My quest plan: it says if it was marked finished or left out of the plan, and adding it brings it back.

## 1.0.6

- Live GPS page fits the window again: the map sits right under the buttons (Choose destination moved above them) and is a little shorter, and your quests and checklist scroll in their own box below the map.
- The detailed map render is on by default; its switch moved to Settings → Map.

## 1.0.5

- Live GPS page: the directions (destination, next move, Start/Stop and the Voice/Taxis/scroll switches) sit at the top as the map's header; your quests, checklist and EXP are in a card below the map.

## 1.0.4

- Your ticks always win over screen reading: Quest Helper counts are shown as hints but never tick a step, finish a quest or bring back a hand-in you ticked. Ticking a hand-in (e.g. Donating to Kerning City) now always takes the quest off your plan, with Undo.
- Quests list every item they need, joining the game files with the wiki's required-item list (Luke the Security Guy's Salad, the job qualification tests' Dark Marble), and the steps include any need the wiki guide left out.
- Guiding one quest uses the same buy / hunt / hand-in plan as Do all quests together, just for that quest.
- The plan shows each quest's remaining steps in order under Quest progress, with Route to NPC links.

## 1.0.3

- Untick anything you ticked by mistake: an **Undo** link appears at the top of the plan right after a tick, the plan's Done list says "untick to undo", and the new **Ticked by hand** card on the Quests page lists every hand tick for any quest (planned, started or still to start) with an untick.

## 1.0.2

- Do all quests together: started, crafted and handed-in steps you tick can be unticked again (listed under Done), in case of a slip.
- Hunting plans never pick a map no portal leads into (Pig Town, an unused map full of Ribbon Pigs); Pig's Ribbon now goes to a map you can reach.

## 1.0.1

- Maps with no in-game mini map (the subway, shops, houses): the pop-out no longer keeps the last map's size with a tiny picture in it; it sizes to the map and small maps fill it.
- On those maps the Live card says plainly that your spot cannot be seen there (the game shows no mini map), and the directions still work.

## 1.0.0

The first full release of Maple Route, a free, unofficial second-screen companion for MapleStory
Classic World. It reads only the game window you share, on your own PC.

### Live GPS
- Reads the map name and your position from the in-game mini map, usually within a second of a portal.
- Turn-by-turn portal directions, with taxis, boats and (optionally) return scrolls.
- Map view with your position, exits, NPCs, monster spawns, and a clear line to where you go next.
- Pop-out window that sizes itself to sit over the in-game mini map.
- Optional voice: directions, monsters at your destination or on every map, quest steps.

### Quests
- Suggestions for your level; reading your in-game Available and Completed tabs. A quest line like
  "Winston's Fossil Dig-up" can be started with one press, and Live GPS guides you through it.
- Step-by-step guiding with Quest Helper counts ticked off automatically.
- Hunting trips that end at the hand-in, one map or several, on maps with enough monsters alive at once.
- **Do all quests together**: one numbered checklist for every quest you are doing or can start (picking
  each up, hunting, buying, crafting, handing in), in the order that walks the fewest maps. Quests come
  from your Quest Helper, your In Progress and Available tabs, or **My quest plan** (add them by name);
  leave any out with ×.
- Quest counts come from the game data, and Quest Helper lines show the game's item names even when the
  screen reading is garbled.
- Shop-bought quest items (a Salad for the Omok quest…) with the nearest shop you can use; set **My
  citizenship** and town hall shops are used when your grade allows.
- Weekly donation quests (Donating to Henesys / Kerning City): this week's item from your Quest Helper,
  your pick, or other players' reports.
- **Fill in a quest**: tell the app what the game data leaves out (this week's item, what a quest needs
  and how many, who drops or hands over an item, who takes the hand-in). Your notes count for you at
  once; other players' are used once two agree.
- Item sources from the MapleClassic Wiki, the game's crafting recipes (jewels, ingots, screws…) and the
  game's own quest text, labelled "best guess" where they are guesses.

### Market
- List items you are selling or looking for, from every tradeable item in the game files (cash items
  too) or as a custom item; equipment shows its real stats against the clean item and its slots left.
- Search and filters: category, equipment or weapon type, job, level, stats, slots left, scroll success,
  price, sorting.
- Offers: sellers set a lowest offer or a fixed price; buyers offer, sellers accept or decline.
- A 🔔 on the Market tab for offers waiting, answers to your offers and expiring listings.
- Listings last 7 days; you can relist your expired ones.
- Trade-chat prices from your own screen, grouped by item, next to the live listings; open an item for
  every advert and Copy /find to reach the player.
- Maple Route is only a noticeboard: trades happen in game, in mesos, between players.

### Also
- World map (click a map, monster or NPC for details), leveling guide, EXP tracker, crafting recipes
  and where to craft them.
- Report a problem or a drop: a pre-filled GitHub issue you check and submit yourself.
- Separate progress per character.

### Still marked Untested
- Read item from game screen (fills a listing from an item tooltip).
- Shop or players? (compares what an NPC shop pays with players' asking prices).
