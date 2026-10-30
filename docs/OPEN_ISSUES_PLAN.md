# Open issue resolution plan

Scope: GitHub issues #2–#17 as reviewed on 2026-10-27. Resolve and close every issue below **except #4**, the character-wide quest journey; keep #4 open until its complete level-gated journey is built. A local fix or a passing unit test alone is not grounds to close an issue: it must reach the relevant PC/Deck build and pass the stated player-facing check. Preserve existing progress and the game's read-only boundary (screen capture only; no game process, inputs, or network interception).

## 1. Stabilize the app during live play

| Issues | Work | Acceptance check |
| --- | --- | --- |
| #5, #10, #14 | Replay the attached mini-map crops and private game frames through the same reader used by Live GPS. Separate a real share-track disconnect from an uncertain title. Hold the last confirmed map while re-reading; disambiguate adjacent Roman-numeral maps using title text, picture, and portal adjacency, without silently assuming a map from weak OCR. | Forest East of Henesys and A Hill West of Henesys do not repeatedly disconnect or flash “checking”; Swamp of Despair III is distinguished from II. Windows and Deck fixture tests remain green. |
| #9, #17 | Give `showView`/`reveal` one consistent navigation path. After opening an issue and after choosing a destination, restore Live GPS and the selected tab/hash without requiring a detour through another tab. | Report opens GitHub and returning to Maple Route leaves Live GPS clickable; choosing a city shows Live GPS immediately. |
| #13 | Make quest add/remove/inclusion changes invalidate the combined-plan cache, recalculate the next stop, and re-render the Live GPS view in the same action, including phone-driven actions. | Add or remove a quest with GPS running: checklist, destination, and pop-out update without a page refresh; manual ticks still override OCR. |

## 2. Correct quest and route data

| Issues | Work | Acceptance check |
| --- | --- | --- |
| #2 | Reproduce the exact Kerning report with its selected guide mode and combined-plan stops. Prioritize a manually ready hand-in on the current map before a distant hunt, but never skip an unfinished prerequisite. Include `tripAll`, current step, and stop order in future diagnostics. | Asking After Shumi can be handed in while in Kerning before a detour when it is genuinely the next ready step. The current-map hand-in regression and a full route test pass. |
| #7 | Verify the rainbow-snail quest objective against the game data and an independent Classic source, then identify Mano's actual spawn/map. The current public map feed places Mano in **Thicket Around the Beach III**, not Forest Trail II; correct the item source without inventing a second spawn. | The quest directs to the verified Mano map rather than a generic snail hunting map; test the quest with other active quests so optimization cannot override it. |
| #8, #16 | Audit every quest NPC and stop against the directed portal graph. Split results into bad NPC-to-map resolution, missing portal edges, and genuinely non-walkable/event-only destinations. Fix verified data/mappings; show an honest travel instruction or explicit “unknown” for the rest. | The Maple Administrator and each reproducible Sleepywood example get a valid route when one exists. An automated audit reports zero *incorrectly* unreachable walking destinations; legitimate exceptions stay labelled rather than inventing paths. |
| #3 | Integrate the locally implemented Outstanding quests list and Remove from plan / Put back controls into the current GitHub main build, including scanned and manually added quests. | In Progress, Available, and manual quests appear once with their sources; removing one updates the route immediately but does not alter the game's quest log. Release/PC check, then close. |

## 3. Make the PC pop-out useful and steady

| Issues | Work | Acceptance check |
| --- | --- | --- |
| #6 | Put an explicit “Complete current step” control in the PC pop-out, wired to the same manual tick action as the main checklist. Require confirmation for a hand-in if it would mark a quest finished. | Clicking it advances only the active stop and updates the main app; no game key or click is sent. |
| #11 | Show remaining portal count beside the next direction in the PC pop-out, from the current planned route, and update on map/route changes. | The count matches Live GPS and disappears or says unknown when no trustworthy route exists. |
| #12 | Stop automatic `fitPip` resizing after the player manually resizes the window. Give header/status text a bounded area and let the map take the remaining fixed window height; retain a deliberate Fit button. | Resized dimensions remain stable across several map/step text changes; map stays visible without stretching the pop-out. |
| #15 | Add a compact EXP/hour readout to Live GPS and the PC pop-out using the existing tracker, with a clear unavailable/stale state. | Both views agree with the tracker while GPS runs and do not show a stale rate after the reading stops. |

## Delivery and closure

1. Reconcile the dirty local worktree with current GitHub main in an isolated branch/worktree. Do not overwrite the newer published branch or sweep unrelated chat/Deck changes into a fix.
2. Land the stability fixes first (#5, #10, #14, #9, #17, #13), then quest/data fixes (#2, #7, #8, #16, #3), then pop-out/EXP fixes (#6, #11, #12, #15). Keep small pure tests beside new logic; run `npm test` and `npm run build` at each batch.
3. Verify the PC build in Edge and the relevant Deck/phone paths where shared code changed. Publish only after review. Comment with the release/commit and verification result, then close each passing issue. Reopen if the player reproduces it.
4. Leave #4 open: the preview has started locally, but a saved per-character journey through all eligible quests, prerequisite chains, level gaps (KPQ or other verified options), and job/citizenship choices is not complete.

## Local implementation check (2026-10-27)

The PC bundle in `dist/` was rebuilt and the running local `serve.mjs` responds with its new asset. All 271 tests pass. This is **not** a published release or proof of live gameplay acceptance; keep the relevant GitHub issues open pending an Edge/Deck check.

- Stability: the previous map remains visible during an uncertain read; learned-scale fallback now compares neighboring map art at the shared-window scale, and agreeing OCR + art avoid a false checking flash. Quest-list changes invalidate/repaint the combined route; destination and Report links update the selected view and URL hash. The three reported map captures still need real replay/validation before #5, #10 or #14 close.
- Routes: repeated NPCs now favor reachable locations, a sourced Hotel Receptionist dialogue edge reaches both Sleepywood saunas, and a live-feed audit checks quest givers/hand-ins. The audit found no mapped-but-isolated quest NPCs after the correction; 10 quest NPC entries have no location in the public feed and remain explicitly unknown. The Rainbow-colored Snail Shell uses Mano's verified source; the current map feed places Mano in Thicket Around the Beach III. The Kerning hand-in regression passes, but its original player state still needs a live check.
- PC pop-out: manual current-step completion (hand-ins require confirmation), remaining portals, fresh EXP/hour and a manual-resize lock are built and unit-tested. Actual pop-out resize and click behavior still need an Edge check.
