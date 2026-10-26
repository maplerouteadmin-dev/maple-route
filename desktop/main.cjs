// Maple Route's Linux desktop shell. It captures only a window the user chooses
// through Electron/xdg-desktop-portal; it never interacts with the game process.
const { app, BrowserWindow, desktopCapturer, dialog, ipcMain, Menu, screen, session } = require('electron');
const { join } = require('node:path');
const { spawn } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { DeckStream, lookupGamescopeSize } = require('./deck-stream.cjs');
const { overlayBounds, pairingBounds, displaySizeFromHelper } = require('./deck-overlay.cjs');

const deckMode = process.platform === 'linux' && process.argv.includes('--deck-service');
if (deckMode) {
  app.commandLine.appendSwitch('ozone-platform', 'x11');
  // The pop-up is a see-through full-screen window (gamescope pins overlays to the top-left); on X11
  // Chromium only makes windows see-through with this.
  app.commandLine.appendSwitch('enable-transparent-visuals');
  // GPU drawing only keeps transparency when Chromium detects a desktop compositor, which it may not
  // inside gamescope; software drawing hands the alpha channel straight to the window.
  app.commandLine.appendSwitch('disable-gpu');
}

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer');
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
}

let mainWindow;
let localServer;
let localOrigin;
let compact = false;
let normalBounds;
let speaking;
let phone;
let deckApi;
let deckSummary = { map: null, destination: null, next: null, quest: null, here: null, step: null, canUndo: false };
let overlayWindow;
let overlayPosition = 'bottom-left';
let overlayWanted = true;
let overlaySnapshot = null;
let overlayDisplaySize = null;
const deckStream = deckMode ? new DeckStream(status => {
  mainWindow?.webContents?.send('deck:status', status);
  phone?.publish({ status });
  showPairing();
}) : null;
// Until the game is being read, the pop-up shows the phone's QR code (the only way to find the link
// in Gaming Mode); once reading, it shows the mini GPS.
// "Keep reading": once you press Start, Maple Route resumes by itself after the game or Gaming Mode
// restarts (the service restarts with it). Only an explicit Stop clears it.
const readingFlag = () => join(app.getPath('userData'), 'keep-reading');
function setKeepReading(on) {
  try { if (on) require('node:fs').writeFileSync(readingFlag(), '1'); else require('node:fs').rmSync(readingFlag(), { force: true }); } catch { /* best effort */ }
}
const keepReading = () => { try { return require('node:fs').existsSync(readingFlag()); } catch { return false; } };
function explicitStop() { setKeepReading(false); deckStream.stop(); mainWindow.webContents.send('deck:phone-stop'); }
function placeOverlayBox(window, position) {
  const b = boxBounds(position);
  if (!window.isDestroyed()) window.setSize(b.width, b.height);
  overlayToHelper({ display: overlayViewport(), x: b.x, y: b.y });
  window.webContents.executeJavaScript(`window.placeMapleBox(${JSON.stringify({ x: 0, y: 0, width: b.width, height: b.height, scale: Math.min(b.width / 258, b.height / (position === 'bottom-left' ? 208 : 142)) })})`).catch(() => {});
}
// QR code first: while no phone is connected, the pop-up shows the phone's QR code for the first
// minute after the game opens (and whenever reading is off), then the map. A connected phone hides it.
let gameOpenedAt = 0, pairingShown = false;
const overlayViewport = () => overlayDisplaySize ?? screen.getPrimaryDisplay().size;
const boxBounds = position => (pairingShown ? pairingBounds : overlayBounds)(position, overlayViewport());
function showPairing() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const noPhone = !phone?.clients?.size, early = Date.now() - gameOpenedAt < 60_000;
  const svg = phone?.qr && noPhone && (early || deckStream?.status().state !== 'reading') ? phone.qr : '';
  if (Boolean(svg) !== pairingShown) { pairingShown = Boolean(svg); placeOverlayBox(overlayWindow, overlayPosition); }
  overlayWindow.webContents.executeJavaScript(`window.setMaplePairing(${JSON.stringify(svg)})`).catch(() => {});
}

function isLocalRequest(contents) {
  return contents === mainWindow?.webContents && contents.getURL().startsWith(localOrigin + '/');
}

async function chooseCaptureSource() {
  // On Wayland this invokes the xdg portal picker. On X11, Electron may return
  // several sources; ask the user instead of silently selecting a screen.
  const sources = await desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: { width: 0, height: 0 } });
  if (!sources.length) return null;
  // Confirm even a single source: the app must never silently begin reading a screen.
  const buttons = [...sources.map(source => source.name), 'Cancel'];
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'question', title: 'Choose the game window',
    message: 'Choose the MapleStory window to share with Maple Route.',
    detail: 'Only the window you pick is read. Choose Cancel if the game is not listed.',
    buttons, cancelId: sources.length, defaultId: sources.length, noLink: true
  });
  return sources[response] ?? null;
}

function setCompact(value) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  compact = Boolean(value);
  if (compact) {
    normalBounds = mainWindow.getBounds();
    mainWindow.setMinimumSize(320, 280);
    mainWindow.setBounds({ x: normalBounds.x, y: normalBounds.y, width: 410, height: 570 });
    mainWindow.setAlwaysOnTop(true, 'floating');
  } else {
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setMinimumSize(600, 500);
    if (normalBounds) mainWindow.setBounds(normalBounds);
  }
  mainWindow.webContents.send('desktop:compact-changed', compact);
  return compact;
}

// The pop-up over the game. gamescope shows "external overlay" windows full-screen from the top-left
// and Chromium cannot make its windows see-through there, so the map box is drawn in a hidden
// offscreen window and its picture handed to a small GTK helper (deck-overlay-gtk.py) that paints it,
// see-through around it, in the chosen corner. Clicks pass through to the game.
let overlayHelper = null;
function overlayToHelper(message) {
  if (overlayHelper?.stdin?.writable) overlayHelper.stdin.write(JSON.stringify(message) + String.fromCharCode(10));
}
async function setDeckOverlay(enabled, position = 'bottom-left', { remember = true } = {}) {
  if (!deckMode) return false;
  if (remember) overlayWanted = Boolean(enabled);
  overlayPosition = position;
  if (!enabled) {
    overlayToHelper({ hide: true }); overlayHelper?.kill(); overlayHelper = null;
    overlayWindow?.destroy(); overlayWindow = null;
    phone?.publish({ overlay: false, overlayPosition });
    return false;
  }
  // The PipeWire compositor image can be 2560x1440 while gamescope's Xwayland screen says
  // 1920x1080. External overlays use the former coordinate space.
  overlayDisplaySize = await lookupGamescopeSize().catch(() => null) ?? overlayDisplaySize;
  const bounds = overlayBounds(position, overlayViewport());
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    placeOverlayBox(overlayWindow, position);
    phone?.publish({ overlay: true, overlayPosition });
    return true;
  }
  const window = new BrowserWindow({
    width: bounds.width, height: bounds.height, show: false, frame: false, resizable: false,
    focusable: false, skipTaskbar: true, backgroundColor: '#102c24', title: 'Maple Route mini GPS',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, offscreen: true }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // The app's own stylesheet, so the map looks like the phone's (route line, coloured exits, you).
  const cssName = require('node:fs').readdirSync(join(__dirname, '..', 'dist', 'assets')).find(name => /^index-[\w-]+\.css$/.test(name));
  const html = readFileSync(join(__dirname, 'overlay.html'), 'utf8').replace('__BASE__', localOrigin + '/').replace('__CSS__', cssName ? `assets/${cssName}` : '');
  try {
    await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    overlayHelper = spawn('python3', [require('./unpacked.cjs').unpacked(join(__dirname, 'deck-overlay-gtk.py'))], { stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
    overlayHelper.on('exit', () => { overlayHelper = null; overlayDisplaySize = null; });
    overlayHelper.stdin.on('error', () => {});
    // GTK owns the actual full-screen overlay. Its Xwayland geometry is authoritative on TVs,
    // where Electron may still report the Deck's old 1280x800 viewport.
    let displayLine = '';
    overlayHelper.stdout.setEncoding('utf8');
    overlayHelper.stdout.on('data', chunk => {
      displayLine += chunk;
      while (displayLine.includes('\n')) {
        const end = displayLine.indexOf('\n');
        const line = displayLine.slice(0, end); displayLine = displayLine.slice(end + 1);
        const xwaylandSize = displaySizeFromHelper(line);
        if (xwaylandSize) lookupGamescopeSize().then(size => {
          size ??= xwaylandSize;
          if (size.width !== overlayDisplaySize?.width || size.height !== overlayDisplaySize?.height) {
            overlayDisplaySize = size;
          }
          if (overlayWindow && !overlayWindow.isDestroyed()) placeOverlayBox(overlayWindow, overlayPosition);
        }).catch(() => {});
      }
    });
    overlayWindow = window;
    window.on('closed', () => { if (overlayWindow === window) overlayWindow = null; });
    // Hand over a new picture at most twice a second, only when the box changed.
    window.webContents.setFrameRate(2);
    let lastSent = '';
    window.webContents.on('paint', (_event, _dirty, image) => {
      const png = image.toPNG().toString('base64');
      if (png === lastSent) return;
      lastSent = png;
      const b = boxBounds(overlayPosition);
      overlayToHelper({ x: b.x, y: b.y, png });
    });
    placeOverlayBox(window, position);
    if (overlaySnapshot) await window.webContents.executeJavaScript(`window.setMapleOverlay(${JSON.stringify(overlaySnapshot)})`);
    showPairing();
    phone?.publish({ overlay: true, overlayPosition, overlayError: null });
    return true;
  } catch (error) {
    window.destroy(); overlayHelper?.kill(); overlayHelper = null;
    phone?.publish({ overlay: false, overlayPosition, overlayError: error.message });
    return false;
  }
}

async function speakWithFallback(text, rate, voice) {
  if (process.platform !== 'linux') return false;
  // Natural voice first (Piper, once downloaded), else espeak-ng.
  if (require('./piper.cjs').speak(text, rate, voice)) return true;
  const { speechCandidates } = await import('./speech.mjs');
  speaking?.kill();
  speaking = null;
  for (const candidate of speechCandidates(text, rate)) {
    const result = await new Promise(resolve => {
      const child = spawn(candidate.command, candidate.args, { stdio: 'ignore', shell: false });
      let settled = false;
      child.once('error', () => { if (!settled) { settled = true; resolve(false); } });
      child.once('spawn', () => { if (!settled) { settled = true; speaking = child; resolve(true); } });
    });
    if (result) return true;
  }
  return false;
}

async function start() {
  if (deckMode) screen.on('display-metrics-changed', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) placeOverlayBox(overlayWindow, overlayPosition);
  });
  const { startServer } = await import('../scripts/serve.mjs');
  const started = await startServer({ port: 0, host: '127.0.0.1', enableAutostart: false });
  localServer = started.server;
  localOrigin = started.url;

  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
    callback(permission === 'display-capture' && isLocalRequest(contents));
  });
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (request.securityOrigin !== localOrigin || !request.userGesture || !request.frame?.url?.startsWith(localOrigin + '/') || !isLocalRequest(mainWindow?.webContents)) {
      callback(null); return;
    }
    try {
      const source = await chooseCaptureSource();
      callback(source ? { video: source } : null);
    } catch { callback(null); }
  });

  ipcMain.handle('desktop:compact', (event, value) => isLocalRequest(event.sender) ? setCompact(value) : false);
  ipcMain.handle('desktop:voice', (event, words, rate, voice) => isLocalRequest(event.sender) ? speakWithFallback(words, rate, voice) : false);
  // Piper voices: the list for Settings, and downloading one when it is picked.
  ipcMain.handle('desktop:voices', event => isLocalRequest(event.sender) && process.platform === 'linux' ? require('./piper.cjs').voiceList() : []);
  ipcMain.handle('desktop:install-voice', async (event, name) => {
    if (!isLocalRequest(event.sender) || process.platform !== 'linux') return false;
    try { return await require('./piper.cjs').install(String(name)); } catch (error) { return { error: error.message }; }
  });
  // First run on Linux: fetch Piper and the default voice in the background (about 90 MB, once).
  if (process.platform === 'linux') setTimeout(() => require('./piper.cjs').install().catch(() => {}), 8000);
  if (deckMode) {
    // A copy of the app's saved progress (plan, ticks, settings), written to a file right away.
    const storageFile = join(app.getPath('userData'), 'progress.json');
    ipcMain.on('deck:storage-load', event => {
      try { event.returnValue = JSON.parse(readFileSync(storageFile, 'utf8')); } catch { event.returnValue = null; }
    });
    ipcMain.on('deck:storage-save', (event, values) => {
      if (!isLocalRequest(event.sender) || !values || typeof values !== 'object') return;
      const clean = Object.fromEntries(Object.entries(values).filter(([k, v]) => k.startsWith('maple-route') && typeof v === 'string' && v.length < 2_000_000));
      const fs = require('node:fs');
      try { fs.writeFileSync(storageFile + '.tmp', JSON.stringify(clean)); fs.renameSync(storageFile + '.tmp', storageFile); } catch { /* try again next time */ }
    });
    ipcMain.on('deck:summary', (event, summary) => {
      if (!isLocalRequest(event.sender) || !summary || typeof summary !== 'object') return;
      deckSummary = { ...Object.fromEntries(['map', 'destination', 'next', 'quest', 'here', 'step'].map(key => [key, String(summary[key] ?? '').slice(0, 240)])), canUndo: Boolean(summary.canUndo) };
    });
    ipcMain.on('deck:overlay-update', (event, snapshot) => {
      if (!isLocalRequest(event.sender) || typeof snapshot?.next !== 'string' || typeof snapshot?.map !== 'string' || snapshot.map.length > 500_000) return;
      overlaySnapshot = snapshot;
      if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.executeJavaScript(`window.setMapleOverlay(${JSON.stringify(snapshot)})`).catch(() => {});
    });
    ipcMain.on('deck:publish', (event, snapshot) => {
      if (!isLocalRequest(event.sender) || typeof snapshot?.html !== 'string' || snapshot.html.length > 2_000_000) return;
      phone?.publish({ html: snapshot.html, bodyClass: String(snapshot.bodyClass ?? '').slice(0, 200) });
    });
    ipcMain.handle('deck:start-capture', async event => {
      if (!isLocalRequest(event.sender)) return { state: 'off', error: 'Not authorized' };
      try { await deckStream.start(); setKeepReading(true); } catch (error) { deckStream.error = error.message; deckStream.stop(); }
      return deckStream.status();
    });
    ipcMain.handle('deck:stop-capture', event => {
      if (!isLocalRequest(event.sender)) return false;
      deckStream.stop(); return true;
    });
    ipcMain.handle('deck:frame', event => {
      if (!isLocalRequest(event.sender)) return null;
      const frame = deckStream.frame;
      return frame ? { width: frame.width, height: frame.height, pixels: frame.pixels } : null;
    });
    ipcMain.handle('deck:status', event => isLocalRequest(event.sender) ? deckStream.status() : { state: 'off' });
  }

  mainWindow = new BrowserWindow({
    width: 1050, height: 760, minWidth: 600, minHeight: 500,
    show: !deckMode,
    title: 'Maple Route', backgroundColor: '#f7f8f2',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      backgroundThrottling: !deckMode,
      additionalArguments: deckMode ? ['--maple-deck'] : []
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(localOrigin + '/')) event.preventDefault();
  });
  mainWindow.webContents.on('did-finish-load', () => mainWindow.webContents.send('desktop:compact-changed', compact));
  await mainWindow.loadURL(localOrigin + '/#navigate');
  if (deckMode) {
    const { startDeckApi } = require('./deck-api.cjs');
    deckApi = await startDeckApi({
      status: () => ({ ...deckStream.status(), ...deckSummary, phoneUrl: phone?.url ?? null,
        qr: phone?.qr ?? null, overlay: Boolean(overlayWindow && !overlayWindow.isDestroyed()), overlayPosition }),
      start: () => mainWindow.webContents.send('deck:phone-start'),
      stop: explicitStop,
      overlay: setDeckOverlay,
      nextStep: () => mainWindow.webContents.send('deck:next-step'),
      undo: () => mainWindow.webContents.send('deck:undo')
    });
  }
  if (deckMode && process.argv.includes('--lan')) {
    try {
      const { startPhoneServer } = require('./phone-server.cjs');
      const tokenFile = join(app.getPath('userData'), 'phone-token');
      let token = null; try { token = readFileSync(tokenFile, 'utf8').trim(); } catch { /* first run */ }
      phone = await startPhoneServer({
        localOrigin, token,
        onAction: action => mainWindow.webContents.send('deck:phone-action', action),
        onStart: () => mainWindow.webContents.send('deck:phone-start'),
        onStop: explicitStop,
        onOverlay: (enabled, position) => setDeckOverlay(enabled, position)
      });
      try { require('node:fs').writeFileSync(tokenFile, phone.token, { mode: 0o600 }); } catch { /* a new link next time */ }
      phone.publish({ status: deckStream.status() });
      console.log(`Maple Route phone: ${phone.url}`);
    } catch (error) { console.error(`Phone sharing stayed off: ${error.message}`); }
  }
  if (deckMode) {
    // Follow MapleStory: while it is open, show the pop-up and (if you pressed Start before) read it;
    // when it closes, stop reading and hide the pop-up, so nothing shows over other games.
    const { mapleRunning } = require('./game-watch.cjs');
    let gameOpen = null;
    const follow = async () => {
      const open = mapleRunning();
      if (open !== gameOpen) {
        gameOpen = open;
        phone?.publish({ game: open });
        if (open) { gameOpenedAt = Date.now(); if (overlayWanted) await setDeckOverlay(true, overlayPosition); }
        else { deckStream.stop(); mainWindow.webContents.send('deck:phone-stop'); await setDeckOverlay(false, overlayPosition, { remember: false }); }
      }
      if (open && keepReading() && deckStream.status().state === 'off') mainWindow.webContents.send('deck:phone-start');
      showPairing(); // a phone connecting, or the first minute ending, switches the QR code to the map
    };
    setTimeout(follow, 3000);
    setInterval(follow, 5000).unref();
  }
  // Steam Deck: offer the one-click Gaming Mode setup the first time the AppImage is opened in
  // Desktop Mode (and from the menu any time).
  const gaming = require('./gaming-mode.cjs');
  const setUpGamingMode = async (asked = false) => {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'question', title: 'Steam Deck Gaming Mode', buttons: ['Set up Gaming Mode', 'Not now'], defaultId: 0, cancelId: 1, noLink: true,
      message: 'Use Maple Route in Gaming Mode?',
      detail: "Maple Route will start by itself in Gaming Mode and wait for MapleStory. While the game is open it shows a small map in a corner and reads your screen (like Steam's own recording; it never touches the game). Scan its QR code with your phone for the full app." + (asked ? '' : ' You can do this later from the Maple Route menu.')
    });
    if (response !== 0) return;
    try {
      const where = gaming.install();
      await dialog.showMessageBox(mainWindow, { type: 'info', title: 'Gaming Mode is set up', message: 'Done. Switch to Gaming Mode and start MapleStory.', detail: `Maple Route was copied to ${where} and starts with Gaming Mode. A small pop-up with a QR code appears in the bottom-left corner while MapleStory is open: scan it with your phone (same Wi-Fi) and press Start reading.` });
    } catch (error) { dialog.showErrorBox('Gaming Mode setup failed', String(error?.message ?? error)); }
  };
  if (!deckMode && process.platform === 'linux' && process.env.APPIMAGE && !gaming.installed()) setTimeout(() => setUpGamingMode(false), 1500);
  const menu = Menu.buildFromTemplate([
    { label: 'Maple Route', submenu: [
      ...(process.platform === 'linux' ? [
        { label: 'Set up Steam Deck Gaming Mode…', click: () => setUpGamingMode(true) },
        { label: 'Remove Gaming Mode service', click: () => { gaming.remove(); dialog.showMessageBox(mainWindow, { type: 'info', message: 'Maple Route will no longer start in Gaming Mode.' }); } },
        { type: 'separator' }] : []),
      { role: 'quit' }] },
    { label: 'View', submenu: [
      { label: 'Compact Mode', accelerator: 'CommandOrControl+Shift+C', click: () => setCompact(!compact) },
      { role: 'reload' }, { role: 'togglefullscreen' }
    ] }
  ]);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(start).catch(error => {
  dialog.showErrorBox('Maple Route could not start', String(error?.message ?? error));
  app.quit();
});
app.on('window-all-closed', () => app.quit());
// Stopped by the service manager: close properly so nothing is lost.
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => app.quit());
app.on('before-quit', () => { speaking?.kill(); try { require('./piper.cjs').stop(); } catch { /* not loaded */ } deckStream?.stop(); overlayHelper?.kill(); overlayWindow?.destroy(); deckApi?.close(); phone?.server?.close(); localServer?.close(); });
