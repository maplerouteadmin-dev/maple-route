# Private Deck map replay checks

`desktop/deck-replay.test.mjs` replays title recognition and map-handoff decisions using
private, previously consented Deck captures. The captures and `fixtures/screens/deck-replay.json`
are gitignored; **never add them to a commit or release**. No game process, input, or network
traffic is read by this test.

The present set has a readable Ellinia frame, a second real Deck mini-map crop with a different
title, and a frame where inventory covers the title. These are separate snapshots, not a
recording of one portal crossing. The test uses the snapshots to verify that a changed or covered
title pauses old-map movement and that a twice-confirmed new title can resume it. A future
consented, consecutive portal capture should be added privately to test the exact timing.

Run `npm test` locally. In CI the replay test skips when the private files are absent. The
public synthetic unit tests still run on every build. If a map fails in play, save only the
minimum mini-map crop needed, remove chat and names, add it under `fixtures/screens/`, and
record its expected map in the private manifest; do not commit the image or manifest.
