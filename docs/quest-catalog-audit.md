# Quest catalog reconciliation audit

## Quest-start item audit (2026-10-26)

The current public game-file catalog has 343 quest records (310 after weekly rotations are grouped). Fifty-five quests have `start_items`; 54 of those also repeat the supplied item in `requirements_list`. Without distinguishing the two fields, the route planner treats those handovers as things to farm. Roger's Apple is one documented tutorial exception: Roger gives it on acceptance, but the export omits `start_items` for that quest.

The app now removes quest-start items from farming and bag-check objectives, while retaining the start-NPC and delivery steps. The audit reports 56 supplied-item quests after that single exception, zero supplied items still in farming needs, zero wiki collect steps for those items, and zero objectives left uncovered after reconciliation. The game-file field is the rule; a quest title resembling an item is not enough to classify it as supplied.

Updated on 2026-10-26 with `npm run audit:quests`. The script reads the public OSMS quest catalog and MapleClassic Wiki's quest, required-item, and structured-step tables; it changes no external data.

| Check | Result |
| --- | ---: |
| Quest records after weekly rotations are grouped | 310 |
| Wiki required-item rows | 269 |
| Wiki structured-step rows | 847 |
| Quests with a wiki-required item absent from game-file objectives | 8 |
| Quests whose wiki steps do not explicitly name every objective | 29 |
| Objective-bearing quests without structured wiki steps | 12 |
| Required-item mismatches after catalog reconciliation | 0 |
| Objectives absent from generated steps after reconciliation | 0 |

The eight extra required-item cases are the Warrior, Magician, Bowman, and Thief versions of **Test of Qualification** (Dark Marble) and **Proof of Qualification** (The Proof of a Hero). The app now matches those job-qualified wiki titles to the right game-file variant and includes their required items.

The 29 step-list cases are *review candidates*: some wiki steps summarize several objectives in one sentence. The app keeps the wiki's steps, adds any objectives not explicitly named, and uses game-file objectives when no structured steps exist. The audit is reproducible; its JSON output lists every candidate.

This audit checks objective and step coverage, not whether every mob, item drop, shop, NPC, or portal has a confirmed route. Unmapped destinations remain disclosed in the app rather than guessed.

## Origin and destination audit (2026-10-26)

The game quest data identifies 55 required-item occurrences across 48 quests as items supplied when the quest starts. The app previously ignored this field. With no documented drop, its monster-name/text fallback would wrongly suggest hunting for nine of these items: Estelle's Special Sauce, Sparkling Glass Marble, Arcon's Blood, Stuffed Drake Skull, Fossil Report, Dances with Balrog's Letter (in two quests), Vitamin Gummy, and Special Stirge Phobia Cure. The catalog now carries the start-item field through to the planner and generated checklist; it tells the player to check the item from the quest giver instead of inventing a hunt. The Old Snail's book remains a separately verified special case.

The rainbow shell for the final Legend of the Snail quest was another confirmed false hunt: an item-name match selected ordinary Snail, but the quest points to Mano at Thicket Around the Beach III. The planner now uses Mano for that specific quest. Sources: [quest guide](https://henesys.gg/quests/legend-of-the-snail), [Mano location](https://mapleclassic.wiki/wiki/Mano).

One further confirmed class of bad suggestion remains: Shumi's Lost Roll of Cash is a Construction Site B2 jump-quest pickup, not a Stirge drop. This needs a map/pickup objective rather than a hunt objective. Source: [Classic hidden maps guide](https://www.mapleclassicguide.com/secrets/).

The current public-catalog audit finds 28 quests without a wiki-listed hand-in: one confirmed by a wiki step, nine inferable from quest text but unverified, three with competing NPC names, and fifteen where only the giver is named. These are *route-review candidates*, not 28 confirmed broken routes. The three most ambiguous are A Memory of Iron, [Event] A Strange and Familiar Wood, and [Event] The One Who Sealed the Darkness. NPC names can also have several locations; Nella, the four job instructors, Sam, and Maple Administrator have reachable and isolated copies, so choosing the first matching NPC can produce “no walking route.” The app's reachable-NPC selection addresses that failure mode, but the remaining hand-ins still need evidence-based review.

`npm run audit:droppers` currently classifies 80 single-monster and 23 multi-monster fallbacks, plus four crafted items lacking an ingredient source. Those numbers measure uncertainty, **not** confirmed mistakes: some guesses, such as Pig's Head from Pig, are plausible. Server-side drop data and unverified wiki rows limit a claim of complete accuracy. The app should label these as guesses and never silently present them as confirmed routes.
