import { shortestRoute } from './core.js';
import { questStepMaps } from './quests.js';
import { completeQuestNeeds } from './questneeds.js';
import { buildSteps, currentStep } from './queststeps.js';

export function pendingQuestTasks(data, names, catalog, details, done, currentMapId, itemsReady = {}, acceptedQuests = names) {
  return names.map(name => {
    const quest = catalog.find(item => item.name === name) ?? { name };
    const record = details[name];
    const completed = new Set(Array.isArray(done[name]) ? done[name] : []);
    const needs = completeQuestNeeds(quest, record?.items);
    const steps = record?.status === 'loaded' ? buildSteps({ ...quest, needs }, record.steps) : [];
    const { step } = currentStep(steps, [...completed], { accepted: acceptedQuests.includes(name), giver: quest.giver, completedNeeds: itemsReady[name] ?? [] });
    return { quest, step, status: record?.status ?? 'loading', items: record?.items ?? [], maps: step ? questStepMaps(data, step, currentMapId, 12) : [] };
  });
}

// A bounded nearest-useful-stop heuristic, not a claim of globally optimal travel.
export function planQuestTrip(data, tasks, currentMapId) {
  const remaining = tasks.filter(task => task.step && task.maps.length);
  const stops = [], unroutable = [];
  let cursor = currentMapId;
  const routeCache = new Map();
  const routeTo = (from, to) => {
    if (!from) return null;
    const key = `${from}:${to}`;
    if (!routeCache.has(key)) routeCache.set(key, shortestRoute(data, from, to));
    return routeCache.get(key);
  };
  while (remaining.length) {
    let best = null;
    for (const task of remaining) {
      const maxSpawns = Math.max(0, ...task.maps.map(option => option.spawns));
      for (const option of task.maps) {
        const route = routeTo(cursor, option.map.id);
        if (cursor && route === null) continue;
        const shared = remaining.filter(other => other.maps.some(candidate => candidate.map.id === option.map.id)).length;
        const score = (route?.length ?? 0) + (maxSpawns - option.spawns) * .15 - (shared - 1) * 1.5;
        if (!best || score < best.score || (score === best.score && option.map.name < best.option.map.name)) best = { option, route, score };
      }
    }
    if (!best) { unroutable.push(...remaining); break; }
    const together = remaining.filter(task => task.maps.some(option => option.map.id === best.option.map.id));
    stops.push({ map: best.option.map, from: cursor, hops: best.route?.length ?? null, tasks: together });
    for (const task of together) remaining.splice(remaining.indexOf(task), 1);
    cursor = best.option.map.id;
  }
  return { stops, unroutable, unmapped: tasks.filter(task => task.step && !task.maps.length && task.status === 'loaded') };
}
