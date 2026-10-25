import { itemKey } from './questneeds.js';

export function questTitleIdentity(title) {
  const name = String(title ?? '');
  const job = name.match(/\((Warrior|Magician|Bowman|Thief)\)$/i)?.[1]?.toLowerCase() ?? null;
  const plain = name.replace(/^\[[^\]]+\]\s*/, '').replace(/\s+\((?:quest|Warrior|Magician|Bowman|Thief)\)$/i, '');
  return { key: itemKey(plain), job };
}

export function wikiQuestMatches(quest, wikiTitle) {
  const wanted = questTitleIdentity(wikiTitle);
  const own = questTitleIdentity(quest?.name);
  return Boolean(wanted.key) && wanted.key === own.key && (!wanted.job || String(quest?.job ?? '').toLowerCase() === wanted.job);
}
