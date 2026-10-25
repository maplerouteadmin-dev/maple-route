# Steam Deck investigation and test gate

The Linux desktop wrapper uses exactly the same `src/` app as Windows. It serves `dist/` on `127.0.0.1`, keeps OSMS cache files under `$XDG_DATA_HOME/MapleRoute/cache` (normally `~/.local/share/MapleRoute/cache`), and requests a user-selected screen/window. It never reads game memory, hooks a process, sends game input, or intercepts game traffic.

## Desktop Mode

Electron requests `getDisplayMedia` and uses `desktopCapturer`. On KDE Plasma Wayland, the expected path is the xdg-desktop-portal ScreenCast picker, which grants only the selected source. On X11, the wrapper shows an explicit source-choice dialog if Electron enumerates more than one source. This was implemented and unit/build-tested on Windows; it is **not yet verified on a Steam Deck**, KDE Wayland, X11, or Proton. A real Deck test must confirm the portal lists the MapleStory window, grants a moving non-black stream, still works after a portal transition, and is not blocked by the compact window.

The game should run in a 1280×800 window (or a known letterboxed region). The current picture-scale estimate is `1280/1366 ≈ 0.937`. `node scripts/make-deck-fixtures.mjs` makes **simulated**, gitignored 1280×800 frames from existing private screenshots; their mini map title, markers, Quest Helper, status bars and quest window pass the local tests. This is a geometry regression check, **not** a Deck verification. The actual Deck rendering still requires consented private captures under `fixtures/screens/` (never commit captures with character/chat names). `OCR_SETTINGS` remains unchanged until a failing real fixture shows which region needs retuning. Compare Wayland and X11 separately.

## Gaming Mode: capture WORKS through gamescope's PipeWire stream (verified 2026-10-25)

**Scope decision (project owner):** reading the whole Deck screen is allowed, exactly like the Windows app's "Entire screen" share and Steam's own game recording. The hard rules are unchanged (no game memory, inputs, injection or network interception). The earlier "only the MapleStory window" requirement in the notes below was too strict and is withdrawn.

**What works:** gamescope publishes the composited screen as a PipeWire node named `gamescope` (media.class Video/Source, 1280x800, formats BGRx and NV12, variable frame rate, modifier 0 = plain memory). As the `deck` user in the Gaming Mode session:

```
XDG_RUNTIME_DIR=/run/user/1000 gst-launch-1.0 pipewiresrc path=<gamescope node id> always-copy=true num-buffers=4 ! video/x-raw,format=BGRx ! videoconvert ! pngenc ! multifilesink location=/tmp/frame-%d.png
```

Find the node id with `pw-dump` (node.name == "gamescope"; it changes per session). Frames are real game pixels, including in game. Reading did not disturb the stream.

**Gotcha:** if a consumer fails format negotiation (log: `pw.link: ... no more input formats`), gamescope drops its node; the ScreenCast portal (`xdg-desktop-portal-gamescope`) then keeps handing out the dead node id ("invalid global", "target not found") until Gaming Mode restarts. Always ask for `video/x-raw,format=BGRx` (or NV12) and never a fixed framerate; check the node exists before linking. `desktop/probe/portal_frame.py` is the portal-based probe (it exposed the stale-node bug).

**Reader on a real Gaming Mode frame** (private fixture `fixtures/screens/deck-gaming-1.png`, 1280x800): the game is 1366x768 scaled to 1280x720 and letterboxed (black bars y 0-40 and 760-800). The existing reader, unchanged, reads the mini map title (Victoria Road / Ellinia, score 1.00), finds the player dot and 4 portal rings (position placed), reads the status bar (Lv 19, EXP 97.87%, HP/MP) and finds the Quest Helper and matches its quest (Research on Plant Fossils). Only the Quest Helper count line ("0 / 8 Plant Sample") is too small to read; tune `OCR_SETTINGS.helper` for Deck scale.

**Screen layout at 1280x800 (for the overlay):** in-game mini map top-left (x 0-170, y 40-225); Quest Helper top-right (x 1068-1278, y 88-142); event icons bottom-left (x 0-90, y 600-760); chat x 268-790, y 633-697; status/level bar x 265-1015, y 697-760; quick-slot keys x 820-1015, y 633-697. Free area for a small pop-up: **bottom-right, x 1020-1275, y 560-755** (about 250x190).

## Older Gaming Mode notes (before the working path was found)


### Live Deck inspection and consented capture tests (2026-10-25)

SSH to the Deck succeeded as the regular `deck` user while Gaming Mode and MapleStory were already running. No sudo, settings changes, system packages, game-process access, or unconsented screen capture were used. The active login session is Wayland/`gamescope`; `DISPLAY=:1` exposes a window titled **MapleStory** at 1366×768, while the gamescope output on `:0` is 1280×800. This distinction matters: the game window is not itself a 1280×800 X11 window. The user-session environment did not export `DISPLAY` or `WAYLAND_DISPLAY`, so a background launcher must obtain the correct display explicitly and test that its only eligible capture target is the `MapleStory` window.

`xdg-desktop-portal-gamescope` and the main portal are active. The ScreenCast portal reports version 5 and source types value 3 (monitor and window). PipeWire lists a `gamescope` Video/Source node with advertised 1280×800 formats and `pipewiresrc` is present. That node appears to represent the compositor output, not a window named MapleStory; reading it could include overlays or other content and does not yet meet the window-only rule. No frame rate or usable resolution has been measured from a non-black Gaming Mode frame.

The Deck has no `node`, `npm`, `electron`, or Chromium executable available on its normal path; it does have GStreamer and FFmpeg. A consent-triggered test helper or a packaged AppImage is needed for the X11-window approach. Capture must remain off until the player presses **Start** in Maple Route or its test control; merely finding a window or stream is not consent.

**X11 named-window test:** A temporary Electron 45 helper was run as a transient user service on `DISPLAY=:1`. The player pressed Start on its short-lived LAN consent page. It selected exactly one `desktopCapturer` source named `MapleStory` (window source) and used `getUserMedia` with that source ID for 10.05 seconds. Chromium reported 99 video frames at 1366×768 (9.85 fps), but the private RGBA fixture is uniformly black. Thus source selection and frame delivery work, **game pixels do not**; the existing reader finds no mini map, Quest Helper, or status bars. This is a failed capture path, not a viable Gaming Mode reader. The private fixture is stored only under the Deck user's MapleRoute data folder and the local gitignored `fixtures/screens/`.

**X11 `getDisplayMedia` retry:** A separate Start-triggered run enabled `WebRTCPipeWireCapturer` but still launched Electron under X11. No portal picker appeared on the Deck. It returned 99 frames at 1366×768 (9.87 fps), again entirely black. Because no picker appeared, this does **not** establish a gamescope portal failure; it likely retried the X11 route.

**Wayland portal tests:** Electron 45 was then launched on the gamescope Wayland socket (`WAYLAND_DISPLAY=gamescope-0`) with a hidden window. A temporary, token-protected LAN page offered a Start button; the player pressed it for each test. The helper requested `getDisplayMedia` video and attempted to constrain the source to the named `MapleStory` window. With both `{ video: { frameRate: 10 } }` and the simpler `{ video: true }`, Chromium returned `Invalid capture constraints` before any frame (0 fps; resolution unknown). The gamescope portal journal shows a ScreenCast session, a window-only `SelectSources` request (`types: Window`, `multiple: false`), a start on PipeWire node 95, and immediate session closure in both tests. There is no evidence that node 95 was the MapleStory window rather than gamescope's compositor stream, and no usable pixels or OCR result. The temporary capture-test user service was stopped afterward. Do not infer successful background capture or a functional window picker from the portal's session log.

**Gate result:** Neither named X11 capture nor the Wayland portal has provided a usable, window-isolated Gaming Mode frame. Per the project rule, do not build or claim the background reader or Decky control panel until a consented capture path is proven. The gamescope compositor-wide PipeWire stream remains out of scope for the window-only rule unless its isolation can be established. Desktop Mode capture remains the fallback to test with the player.

**Follow-up metadata check (no capture):** This Deck runs gamescope 3.16.30 and has the `gamescopestream` reference consumer. The X11 window named `MapleStory` carries `STEAM_GAME=216150`, but the X11 window tree contains many other windows with the same game ID, including a window titled `Steam`. The gamescope Wayland registry advertises `gamescope_pipewire` but none of `ext_foreign_toplevel_list_v1`, `ext_foreign_toplevel_image_capture_source_manager_v1`, or `ext_image_copy_capture_manager_v1`. Gamescope's PipeWire format supports a focus-AppID parameter, but an AppID is not a unique window identity on this Deck. Do not treat that mode as satisfying the current **only the chosen MapleStory window** rule or start it as a workaround without an explicit scope decision. No new pixel test was run during this check.

**Diagnostic retry:** A new Start-triggered Wayland probe retained Electron's source-selection error instead of overwriting it with the renderer's generic error. `desktopCapturer.getSources({ types: ['window'] })` returned **zero sources**, including zero named `MapleStory`; the probe denied the request and acquired no frames. The user service was stopped after the result. This makes the earlier `Invalid capture constraints` result more specific: this Electron/gamescope path is not exposing a selectable MapleStory window to the app. It does not justify falling back to the compositor output.

Gamescope has PipeWire capture support, and Steam uses PipeWire for its own recording path, but neither fact establishes that a separate Electron app can obtain the game's stream from inside Gaming Mode. The xdg portal picker and regular window composition may differ from Desktop Mode. Running Maple Route as another non-Steam game may also suspend or hide it when focus returns to MapleStory. These are hypotheses, not working features. Do **not** ship an automatic capture claim or a Decky overlay on this evidence alone.

Test on a Deck, in order:

1. Confirm Desktop Mode capture and OCR on KDE Wayland, then X11 if installed.
2. Launch the AppImage as a non-Steam game beside MapleStory in Gaming Mode. Check whether the game is selectable through `getDisplayMedia`, whether frames advance, and whether the app keeps running when MapleStory is focused. Record SteamOS, gamescope, Electron and portal versions.
3. If the regular picker fails, investigate whether gamescope's PipeWire stream is made available to a normal user and whether accessing it is compatible with a user-visible consent flow. Never bypass permissions, read the game process, or access Steam's private recording data.
4. If capture fails, support Desktop-Mode-only capture. A phone/tablet companion cannot fix capture unless the Deck already has a consented stream.

An optional LAN second screen can be built after the Desktop Mode capture is tested. It should be explicitly enabled, bind only to a private-network interface, display its URL and QR code, and send only derived route/map/checklist state from Deck to phone via SSE or WebSocket. The phone must not capture the game. A random session token and a visible stop control are required so another device on the LAN cannot casually see quest or character state. Keep loopback as the default.

If Gaming Mode capture succeeds, a separate `deck/decky-plugin/` can use the official Decky plugin template and subscribe to that same local state feed. It must never control or inspect the game. No Decky plugin is included before the Gaming Mode capture gate is passed.

## References

- [Electron display capture and session API](https://www.electronjs.org/docs/latest/api/session)
- [XDG ScreenCast portal](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.ScreenCast.html)
- [Gamescope project](https://github.com/ValveSoftware/gamescope)
- [Valve Steam beta notes mentioning PipeWire recording](https://github.com/ValveSoftware/steam-for-linux/blob/master/README.beta.md)
- [Decky plugin template](https://github.com/SteamDeckHomebrew/decky-plugin-template)
