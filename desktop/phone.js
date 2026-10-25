// The phone displays the Deck-hosted app UI. Every action goes back to the
// Deck; this page has no separate quest/route state and never receives pixels.
const app = document.querySelector('#app');
let scrollCalculator;
import('/map-follow.mjs').then(module => { scrollCalculator = module.centeredScroll; followMap(); }).catch(() => {});
const statusText = document.querySelector('#phone-status');
const disconnected = document.querySelector('#phone-disconnected');
let voice = false;
let lastWords = '';
let wakeLock;
let currentHtml = '';
let mapUserAt = 0;
app.addEventListener('wheel', event => { if (event.target.closest('#mapview .mv-picture')) mapUserAt = Date.now(); }, { passive: true });
for (const type of ['pointerdown', 'touchstart', 'keydown'])
  app.addEventListener(type, event => { if (event.target.closest('#mapview .mv-picture')) mapUserAt = Date.now(); }, { passive: true });

function followMap(previous = null) {
  const box = app.querySelector('#mapview .mv-picture');
  const drawing = box?.querySelector('svg');
  if (!box || !drawing || !scrollCalculator) return;
  if (Date.now() - mapUserAt < 5000) {
    if (previous && previous.map === app.querySelector('#mapview')?.dataset.map) {
      box.scrollLeft = previous.left; box.scrollTop = previous.top;
    }
    return;
  }
  const marker = drawing.querySelector('.mv-player circle') ?? drawing.querySelector('.mv-next circle');
  const viewBox = drawing.viewBox?.baseVal;
  if (!marker || !viewBox) return;
  const position = scrollCalculator({
    x: Number(marker.getAttribute('cx')), y: Number(marker.getAttribute('cy')),
    svgWidth: drawing.clientWidth, svgHeight: drawing.clientHeight,
    viewBoxWidth: viewBox.width, viewBoxHeight: viewBox.height,
    viewportWidth: box.clientWidth, viewportHeight: box.clientHeight
  });
  if (position) { box.scrollLeft = position.left; box.scrollTop = position.top; }
}

async function action(endpoint, value) {
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(value ?? {})
  });
  if (!response.ok) statusText.textContent = `Could not send that action (${response.status})`;
}
function pathFor(element) {
  const path = [];
  while (element && element !== app) {
    const parent = element.parentElement;
    if (!parent) return null;
    path.unshift([...parent.children].indexOf(element));
    element = parent;
  }
  return element === app ? path : null;
}
function forward(kind, element) {
  const path = pathFor(element);
  if (!path) return;
  return action('/action', { kind, path, tag: element.tagName, id: element.id || undefined, value: 'value' in element ? String(element.value).slice(0, 512) : undefined,
    checked: 'checked' in element ? Boolean(element.checked) : undefined });
}
app.addEventListener('click', async event => {
  const element = event.target.closest('button,a,input,label,[data-map],[data-mob],[data-npc]');
  if (!element || element.tagName === 'LABEL') return;
  if (element.tagName === 'A' && !element.getAttribute('href')?.startsWith('#')) return;
  if (element.tagName === 'INPUT' && !['checkbox', 'radio'].includes(element.type)) return;
  event.preventDefault();
  if (element.closest('#chat-root')) {
    clearTimeout(typingTimer);
    for (const id of ['#chat-world', '#chat-channel', '#chat-text', '#chat-muted']) {
      const input = app.querySelector(id);
      if (input) await forward('input', input);
    }
  }
  await forward('click', element);
});
app.addEventListener('change', event => {
  const element = event.target;
  if (element.matches('select,input[type="number"],input[type="range"]')) forward('change', element);
});
let typingTimer;
app.addEventListener('input', event => {
  const element = event.target;
  if (!element.matches('input[type="text"],input[type="search"],input[type="number"],textarea')) return;
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => forward('input', element), 120);
});

function applySnapshot(snapshot) {
  disconnected.hidden = true;
  const status = snapshot.status ?? {};
  statusText.textContent = status.error ? `Stopped: ${status.error}` :
    status.state === 'reading' ? `Reading your screen · ${status.width}×${status.height}` :
    status.state === 'starting' ? 'Starting the screen reader…' : 'Reader off';
  document.querySelector('#phone-overlay').textContent = snapshot.overlay ? 'Pop-up on' : 'Pop-up off';
  document.querySelector('#phone-position').value = snapshot.overlayPosition ?? 'bottom-left';
  document.body.className = snapshot.bodyClass ?? '';
  if (!snapshot.html || snapshot.html === currentHtml) return;
  const previousBox = app.querySelector('#mapview .mv-picture');
  const previousMap = app.querySelector('#mapview')?.dataset.map;
  const previous = previousBox ? { map: previousMap, left: previousBox.scrollLeft, top: previousBox.scrollTop } : null;
  const focused = document.activeElement;
  const focusPath = app.contains(focused) ? pathFor(focused) : null;
  const selection = focusPath && 'selectionStart' in focused ? [focused.selectionStart, focused.selectionEnd] : null;
  currentHtml = snapshot.html;
  app.innerHTML = currentHtml;
  requestAnimationFrame(() => followMap(previous));
  setTimeout(() => followMap(), 150);
  if (focusPath) {
    let replacement = app;
    for (const index of focusPath) replacement = replacement?.children[index];
    if (replacement) {
      replacement.focus({ preventScroll: true });
      if (selection) try { replacement.setSelectionRange(...selection); } catch {}
    }
  }
  if (voice) {
    const words = app.querySelector('#live-step')?.innerText?.trim().slice(0, 250) ?? '';
    if (words && words !== lastWords && 'speechSynthesis' in window) {
      lastWords = words;
      speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(words));
    }
  }
}
function connect() {
  const feed = new EventSource('/events');
  feed.onmessage = event => { try { applySnapshot(JSON.parse(event.data)); } catch {} };
  feed.onerror = () => { disconnected.hidden = false; statusText.textContent = 'Reconnecting…'; };
}
connect();
document.querySelector('#phone-start').onclick = () => action('/start');
document.querySelector('#phone-stop').onclick = () => action('/stop');
document.querySelector('#phone-overlay').onclick = () => action('/overlay', { enabled: document.querySelector('#phone-overlay').textContent !== 'Pop-up on', position: document.querySelector('#phone-position').value });
document.querySelector('#phone-position').onchange = event => action('/overlay', { enabled: true, position: event.target.value });
document.querySelector('#phone-voice').onclick = event => {
  voice = !voice; event.target.textContent = voice ? 'Phone voice on' : 'Phone voice off';
  if (!voice) window.speechSynthesis?.cancel?.();
};
document.addEventListener('click', async () => {
  if (!wakeLock && navigator.wakeLock) try { wakeLock = await navigator.wakeLock.request('screen'); } catch {}
}, { once: true });

// Keep the phone screen on while this page is open. The Wake Lock API only works on https pages, so
// fall back to looping a tiny silent blank video, which phones treat as watching a video. Phones
// only start it after a tap, so the first tap anywhere turns it on.
const keepAwake = document.createElement('video');
Object.assign(keepAwake, { src: '/keepawake.mp4', muted: true, loop: true, playsInline: true });
keepAwake.setAttribute('playsinline', ''); keepAwake.setAttribute('muted', '');
keepAwake.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;bottom:0;left:0';
document.body.append(keepAwake);
async function stayAwake() {
  if (navigator.wakeLock && window.isSecureContext) { try { wakeLock = await navigator.wakeLock.request('screen'); return; } catch { /* fall back */ } }
  if (keepAwake.paused) keepAwake.play().catch(() => {});
}
document.addEventListener('click', stayAwake, true);
document.addEventListener('touchend', stayAwake, true);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') stayAwake(); });

