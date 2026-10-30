# Character quest journey (GitHub issue #4)

Status: in progress. The Quests tab now has a conservative path to level 20, grouped into level bands from the live Classic quest catalog. The player checks their current level in the checklist; OCR may suggest a different level but cannot unlock catalog quest recommendations. In-progress and Available-tab quests are treated as game-confirmed, and named prerequisites require confirmed completion. Each eligible quest can go to the existing GPS guide. This is distinct from “Do all quests together,” which only orders quests already on the player's list. It does not yet optimize the complete leveling-and-quest route, verify citizenship or party entry, or prove catalog candidates appear in game.

## First useful release

1. The player chooses a character profile, job or planned job, current level, and whether to include unfinished quests not yet accepted. Save this per character; never switch profiles from OCR alone.
2. Build a prerequisite graph from the public game-file quest catalog fetched by the app. Show an ordered journey with three states: eligible now, locked by a named prerequisite, and locked by level/job/citizenship. Do not guess completion from an absent Quest Helper line.
3. For each eligible quest, reuse the existing multi-quest route planner to group nearby NPC, hunt, buy, craft, and hand-in stops. The player can pin or leave out a quest, and manually confirm every completion. Manual choices take precedence over screen reading.
4. When nothing eligible is ready, offer a clearly labelled training suggestion rather than forcing a route. Kerning Party Quest can be an option only if the catalog/player level and party availability support it; the app must not claim that a party or entry is guaranteed.
5. Show a preview of the next few quests and why each is next before starting voice/GPS. Allow pause/resume and a one-step undo. Keep all progress in the existing per-character backup format.

## Before calling it “optimal”

- Compare route orders by travel cost and quest overlap, not just quest level. Surface assumptions (missing drops, uncertain NPC, citizenship, and transport). Avoid claiming a globally shortest or fastest completion without measured rewards/time.
- Add pure tests for prerequisite cycles, branch choices, same-name job variants, repeatable quests, unavailable level/job, and quests already finished.
- Validate on both Windows and Deck with private fixtures and a real playthrough; no game memory, inputs, injection, or network interception.
- Do not include personal character names or screenshots in public tests, reports, or documentation.
