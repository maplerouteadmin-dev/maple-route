// Maple Route's Linux desktop shell. It captures only a window the user chooses
// through Electron/xdg-desktop-portal; it never interacts with the game process.
const { app, BrowserWindow, desktopCapturer, dialog, ipcMain, Menu, session } = require('electron');
const { join } = require('node:path');
const { spawn } = require('node:child_process');

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

async function speakWithFallback(text, rate) {
  if (process.platform !== 'linux') return false;
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
  ipcMain.handle('desktop:voice', (event, words, rate) => isLocalRequest(event.sender) ? speakWithFallback(words, rate) : false);

  mainWindow = new BrowserWindow({
    width: 1050, height: 760, minWidth: 600, minHeight: 500,
    title: 'Maple Route', backgroundColor: '#f7f8f2',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(localOrigin + '/')) event.preventDefault();
  });
  mainWindow.webContents.on('did-finish-load', () => mainWindow.webContents.send('desktop:compact-changed', compact));
  await mainWindow.loadURL(localOrigin + '/#navigate');
  const menu = Menu.buildFromTemplate([
    { label: 'Maple Route', submenu: [{ role: 'quit' }] },
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
app.on('before-quit', () => { speaking?.kill(); localServer?.close(); });
