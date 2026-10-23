import { normalize } from './core.js';

// Every query word must appear in the label. Labels starting with the query come first, then
// labels with a word starting with it, then any other match; ties keep the original order.
export function filterOptions(options, query) {
  const words = normalize(query).split(' ').filter(Boolean);
  if (!words.length) return [...options];
  const full = words.join(' ');
  const scored = [];
  options.forEach((option, index) => {
    const label = normalize(option.label);
    if (!words.every(word => label.includes(word))) return;
    const rank = label.startsWith(full) ? 0 : ` ${label}`.includes(` ${words[0]}`) ? 1 : 2;
    scored.push({ option, rank, index });
  });
  return scored.sort((a, b) => a.rank - b.rank || a.index - b.index).map(entry => entry.option);
}

let comboCount = 0;

// Replaces a <select> on screen with a type-to-filter input plus an arrow that lists everything.
// The select stays in the DOM (hidden) as the source of truth, so existing .value reads/writes,
// option rebuilds and 'change' listeners keep working.
export function enhanceSelect(select, { placeholder = 'Type to search…' } = {}) {
  const id = `combo-${++comboCount}`;
  const selectValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  const wrap = document.createElement('div'); wrap.className = 'combo';
  const input = document.createElement('input');
  Object.assign(input, { type: 'text', className: 'combo-input', placeholder, autocomplete: 'off', spellcheck: false });
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-controls', `${id}-list`);
  const toggle = document.createElement('button');
  Object.assign(toggle, { type: 'button', className: 'combo-toggle', tabIndex: -1, textContent: '▾' });
  toggle.setAttribute('aria-label', 'Show all options');
  const list = document.createElement('ul'); list.className = 'combo-list'; list.id = `${id}-list`; list.setAttribute('role', 'listbox'); list.hidden = true;
  select.replaceWith(wrap); wrap.append(input, toggle, list, select); select.hidden = true; select.tabIndex = -1;

  let shown = [], active = -1;
  const choices = () => [...select.options].filter(option => option.value).map(option => ({ value: option.value, label: option.text }));
  const syncInput = () => { const option = select.selectedOptions[0]; input.value = option?.value ? option.text : ''; };
  const isOpen = () => !list.hidden;

  function highlight(index) {
    active = index;
    [...list.children].forEach((item, i) => item.setAttribute('aria-selected', String(i === index)));
    const item = list.children[index];
    if (item) { input.setAttribute('aria-activedescendant', item.id); item.scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant');
  }

  function open(query) {
    shown = filterOptions(choices(), query);
    list.replaceChildren(...(shown.length ? shown.map((choice, i) => {
      const item = document.createElement('li'); item.id = `${id}-${i}`; item.setAttribute('role', 'option'); item.textContent = choice.label;
      if (choice.value === select.value) item.classList.add('chosen');
      item.addEventListener('pointerdown', event => { event.preventDefault(); choose(choice.value); });
      return item;
    }) : [Object.assign(document.createElement('li'), { className: 'combo-empty', textContent: 'No matches' })]));
    list.hidden = false; input.setAttribute('aria-expanded', 'true');
    const current = shown.findIndex(choice => choice.value === select.value);
    highlight(query ? (shown.length ? 0 : -1) : current);
  }

  function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; }

  function choose(value) {
    const changed = value !== select.value;
    selectValue.set.call(select, value); syncInput(); close();
    if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Keep the visible text in step with programmatic writes (select.value = id) and option rebuilds.
  Object.defineProperty(select, 'value', { configurable: true, get() { return selectValue.get.call(this); }, set(value) { selectValue.set.call(this, value); if (document.activeElement !== input) syncInput(); } });
  new MutationObserver(() => { if (document.activeElement !== input) syncInput(); }).observe(select, { childList: true });
  select.addEventListener('change', syncInput);

  input.addEventListener('focus', () => input.select());
  input.addEventListener('input', () => open(input.value));
  input.addEventListener('blur', () => {
    close();
    if (!input.value.trim()) { if (select.value) choose(''); return; }
    syncInput(); // typed text that wasn't picked reverts to the current choice
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen()) { open(''); return; }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      if (shown.length) highlight((active + step + shown.length) % shown.length);
    } else if (event.key === 'Enter' && isOpen()) {
      event.preventDefault();
      if (shown[active]) choose(shown[active].value);
    } else if (event.key === 'Escape' && isOpen()) {
      event.preventDefault(); close(); syncInput();
    }
  });
  toggle.addEventListener('pointerdown', event => event.preventDefault());
  toggle.addEventListener('click', () => { if (isOpen()) { close(); return; } input.focus(); open(''); });

  syncInput();
  return { input, refresh: syncInput };
}
