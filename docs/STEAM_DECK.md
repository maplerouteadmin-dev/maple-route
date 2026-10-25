# Steam Deck investigation and test gate

The Linux desktop wrapper uses exactly the same `src/` app as Windows. It serves `dist/` on `127.0.0.1`, keeps OSMS cache files under `$XDG_DATA_HOME/MapleRoute/cache` (normally `~/.local/share/MapleRoute/cache`), and requests a user-selected screen/window. It never reads game memory, hooks a process, sends game input, or intercepts game traffic.

## Desktop Mode

Electron requests `getDisplayMedia` and uses `desktopCapturer`. On KDE Plasma Wayland, the expected path is the xdg-desktop-portal ScreenCast picker, which grants only the selected source. On X11, the wrapper shows an explicit source-choice dialog if Electron enumerates more than one source. This was implemented and unit/build-tested on Windows; it is **not yet verified on a Steam Deck**, KDE Wayland, X11, or Proton. A real Deck test must confirm the portal lists the MapleStory window, grants a moving non-black stream, still works after a portal transition, and is not blocked by the compact window.

The game should run in a 1280×800 window (or a known letterboxed region). The current picture-scale estimate is `1280/1366 ≈ 0.937`. `node scripts/make-deck-fixtures.mjs` makes **simulated**, gitignored 1280×800 frames from existing private screenshots; their mini map title, markers, Quest Helper, status bars and quest window pass the local tests. This is a geometry regression check, **not** a Deck verification. The actual Deck rendering still requires consented private captures under `fixtures/screens/` (never commit captures with character/chat names). `OCR_SETTINGS` remains unchanged until a failing real fixture shows which region needs retuning. Compare Wayland and X11 separately.

## Gaming Mode: no capture claim yet

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
