import { chatRoom, roomKey, chatMessage, visibleMessages, travelerName, CHAT_KINDS } from './chat.js';

const SETTINGS_KEY = 'maple-route-chat-beta-settings';
function savedSettings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; } }

export function mountChat(root, { store, getMap }) {
  const saved = savedSettings();
  const state = { active: false, loading: false, kind: CHAT_KINDS.includes(saved.kind) ? saved.kind : 'here', blocked: Array.isArray(saved.blocked) ? saved.blocked : [], me: null, rows: [], lastRoom: '' };
  root.innerHTML = `
    <p class="muted">Opt-in Maple Route chat between people using this app. It does not read, filter, or send messages in MapleStory. No screenshot or character name is posted automatically. Other app users may see what you write.</p>
    <div id="chat-panel">
      <div class="chat-fields"><label class="field">World <input id="chat-world" type="text" maxlength="30" autocomplete="off" placeholder="Your world" value=""></label><label class="field">Channel <input id="chat-channel" type="number" min="1" max="40" inputmode="numeric" placeholder="1–40" value=""></label></div>
      <p class="fine">Choose your world and channel yourself. “Here” and “Map” follow the map shown by Live GPS; you can also choose a map manually in the route planner.</p>
      <div class="chat-rooms" role="group" aria-label="Chat rooms">${CHAT_KINDS.map(kind => `<button type="button" class="button light" data-chat-kind="${kind}">${kind === 'here' ? 'Here' : kind[0].toUpperCase() + kind.slice(1)}</button>`).join('')}</div>
      <p id="chat-room-label" class="chat-room-label"></p>
      <div id="chat-messages" class="chat-messages" role="log" aria-live="polite"></div>
      <div class="chat-compose"><input id="chat-text" type="text" maxlength="280" autocomplete="off" placeholder="Message other Maple Route players…" aria-label="Chat message"><button type="button" class="button" id="chat-send">Send</button></div>
      <details class="chat-filters"><summary>Filters and safety</summary><label class="field">Hide messages containing these words (comma-separated)<input id="chat-muted" type="text" maxlength="200" autocomplete="off" placeholder="e.g. trade, guild"></label><label class="toggle"><input id="chat-repeats" type="checkbox" checked> Hide repeated messages</label><label class="field">Report reason <select id="chat-report-reason"><option value="spam">Spam</option><option value="harassment">Harassment</option><option value="other">Other</option></select></label><div id="chat-blocked"></div></details>
    </div><p id="chat-status" class="fine" role="status" aria-live="polite"></p>`;
  const $ = selector => root.querySelector(selector);
  $('#chat-world').value = saved.world ?? '';
  $('#chat-channel').value = saved.channel ?? '';
  $('#chat-muted').value = saved.muted ?? '';
  $('#chat-repeats').checked = saved.hideRepeats !== false;
  const status = message => { $('#chat-status').textContent = message; };
  function persist() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ world: $('#chat-world').value, channel: $('#chat-channel').value, kind: state.kind, muted: $('#chat-muted').value, blocked: state.blocked, hideRepeats: $('#chat-repeats').checked })); } catch { /* local filtering is optional */ }
  }
  function currentRoom() { return chatRoom(state.kind, $('#chat-world').value, $('#chat-channel').value, getMap()?.id); }
  function label() {
    const map = getMap(), room = currentRoom();
    root.querySelectorAll('[data-chat-kind]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.chatKind === state.kind)));
    $('#chat-room-label').textContent = !room ? 'Choose a world and, for this room, a channel or current map.' :
      `${room.world} · ${state.kind === 'here' || state.kind === 'channel' ? `Channel ${room.channel} · ` : ''}${state.kind === 'here' || state.kind === 'map' ? `${map?.name ?? `Map ${room.mapId}`} · ` : ''}${state.kind === 'here' ? 'Here' : state.kind[0].toUpperCase() + state.kind.slice(1)}`;
    $('#chat-send').disabled = !room;
    return room;
  }
  function renderBlocked() {
    const box = $('#chat-blocked'); box.replaceChildren();
    if (!state.blocked.length) return;
    const heading = document.createElement('p'); heading.textContent = 'Blocked players:'; box.append(heading);
    for (const owner of state.blocked) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'link-button'; button.dataset.chatUnblock = owner; button.textContent = `Unblock ${travelerName(owner)}`; box.append(button, document.createTextNode(' '));
    }
  }
  function renderMessages() {
    const box = $('#chat-messages'); box.replaceChildren();
    const rows = visibleMessages([...state.rows].reverse(), { blocked: state.blocked, mutedWords: $('#chat-muted').value.split(','), hideRepeats: $('#chat-repeats').checked });
    if (!rows.length) { const empty = document.createElement('p'); empty.className = 'fine'; empty.textContent = 'No messages in this room yet.'; box.append(empty); return; }
    for (const row of rows) {
      const item = document.createElement('article'); item.className = 'chat-message';
      const head = document.createElement('div'); head.className = 'chat-message-head';
      const name = document.createElement('strong'); name.textContent = row.owner === state.me ? 'You' : travelerName(row.owner);
      const time = document.createElement('time'); time.dateTime = row.created_at; time.textContent = new Date(row.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      head.append(name, time);
      const body = document.createElement('p'); body.textContent = row.body;
      item.append(head, body);
      if (row.owner !== state.me) {
        const controls = document.createElement('div'); controls.className = 'chat-message-controls';
        const block = document.createElement('button'); block.type = 'button'; block.className = 'link-button'; block.dataset.chatBlock = row.owner; block.textContent = 'Block';
        const report = document.createElement('button'); report.type = 'button'; report.className = 'link-button'; report.dataset.chatReport = row.id; report.textContent = 'Report';
        controls.append(block, report); item.append(controls);
      }
      box.append(item);
    }
  }
  async function refresh() {
    if (!state.active || state.loading) return;
    const room = label(), key = roomKey(room);
    if (!room) { state.rows = []; renderMessages(); return; }
    state.loading = true;
    try {
      const rows = await store.list(room);
      if (roomKey(currentRoom()) !== key || !state.active) return;
      state.rows = rows; state.lastRoom = key; renderMessages(); status('Open app chat · messages refresh every few seconds.');
    } catch (error) { status(error.message); }
    finally { state.loading = false; }
  }
  async function open() {
    state.active = true;
    if (!store.configured) { status('Shared chat is not configured.'); return; }
    try { state.me = await store.me(); label(); renderBlocked(); await refresh(); }
    catch (error) { status(error.message); }
  }
  $('#chat-send').addEventListener('click', async () => {
    const room = currentRoom(), body = chatMessage($('#chat-text').value);
    if (!room) { status('Choose a valid world, channel and map for this room.'); return; }
    if (!body) { status('Write 1–280 characters. Links are not allowed in this beta.'); return; }
    $('#chat-send').disabled = true;
    try { await store.send(room, body); $('#chat-text').value = ''; await refresh(); }
    catch (error) { status(error.message); }
    finally { $('#chat-send').disabled = false; }
  });
  $('#chat-text').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); $('#chat-send').click(); } });
  root.addEventListener('click', async event => {
    const kind = event.target.closest('[data-chat-kind]')?.dataset.chatKind;
    if (kind) { state.kind = kind; persist(); label(); refresh(); return; }
    const owner = event.target.closest('[data-chat-block]')?.dataset.chatBlock;
    if (owner) { state.blocked = [...new Set([...state.blocked, owner])]; persist(); renderBlocked(); renderMessages(); return; }
    const unblock = event.target.closest('[data-chat-unblock]')?.dataset.chatUnblock;
    if (unblock) { state.blocked = state.blocked.filter(id => id !== unblock); persist(); renderBlocked(); renderMessages(); return; }
    const id = event.target.closest('[data-chat-report]')?.dataset.chatReport;
    if (id) { try { await store.report(id, $('#chat-report-reason').value); status('Report saved for review.'); } catch (error) { status(error.message); } }
  });
  for (const id of ['#chat-world', '#chat-channel']) $(id).addEventListener('change', () => { persist(); label(); refresh(); });
  for (const id of ['#chat-muted', '#chat-repeats']) $(id).addEventListener('input', () => { persist(); renderMessages(); });
  const timer = setInterval(() => { if (state.active) refresh(); }, 5000);
  return { open, close() { state.active = false; }, dispose() { clearInterval(timer); } };
}
