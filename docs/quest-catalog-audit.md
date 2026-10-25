# Quest catalog reconciliation audit

Run on 2026-10-25 with `npm run audit:quests`. The script reads the public OSMS quest catalog and MapleClassic Wiki's quest, required-item, and structured-step tables; it changes no external data.

| Check | Result |
| --- | ---: |
| Quest records after weekly rotations are grouped | 310 |
| Wiki required-item rows | 269 |
| Wiki structured-step rows | 847 |
| Quests with a wiki-required item absent from game-file objectives | 8 |
| Quests whose wiki steps do not explicitly name every objective | 33 |
| Objective-bearing quests without structured wiki steps | 12 |
| Required-item mismatches after catalog reconciliation | 0 |
| Objectives absent from generated steps after reconciliation | 0 |

The eight extra required-item cases are the Warrior, Magician, Bowman, and Thief versions of **Test of Qualification** (Dark Marble) and **Proof of Qualification** (The Proof of a Hero). The app now matches those job-qualified wiki titles to the right game-file variant and includes their required items.

The 33 step-list cases are *review candidates*: some wiki steps summarize several objectives in one sentence. The app keeps the wiki's steps, adds any objectives not explicitly named, and uses game-file objectives when no structured steps exist. The audit is reproducible; its JSON output lists every candidate.

This audit checks objective and step coverage, not whether every mob, item drop, shop, NPC, or portal has a confirmed route. Unmapped destinations remain disclosed in the app rather than guessed.
