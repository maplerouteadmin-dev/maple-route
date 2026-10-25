import { createWorker, OEM, PSM } from 'tesseract.js';
import { STORAGE_KEY, validateDataset, shortestRoute, matchMap, normalize, portalPosition } from './core.js';
import { starterData } from './starter-data.js';
import { fetchOsms } from './osms.js';
import { rankGrindMaps } from './guide.js';
import { fetchItemCatalog, fetchWikiDrops, rankFarmMaps, fetchMonsterDrops } from './items.js';
import { fetchWikiShops, recipeFor, remainingIngredients } from './gear.js';
import { travelGraph, routeWithPreference, routeTradeoff, explainNoRoute } from './routing.js';
import { describeStep, spokenStep } from './directions.js';
import { guidance, rememberScale, recallScale, findMarkers, minimapLayout } from './minimap.js';
import { locateMinimap, readTitle, titleSignature, signatureChanged, locatePlayer, regionImage, readRegion, createOcrWorker, readWholeFrame } from './screen.js';
import { startCapture, ticker } from './live.js';
import { mapViewModel, mapViewSvg, calibratePicture, pictureOverlaySvg, renderOverlaySvg, spawnColors } from './mapview.js';
import { arrivalDetails } from './arrival.js';
import { questObjective, huntGoals, planHuntTrip, planMultiTrip, rankObjectiveMaps, craftStops, matchCount, believableDone, helperComplete } from './objective.js';
import { worldMapModel, worldMapHtml, mobTally } from './worldmap.js';
import { osmsUrl, isLocalHost } from './sources.js';
import { OSMS_CRAFTING, fromOsmsCrafting } from './refine.js';
import { issueUrl, problemReport, dropReport } from './report.js';
import { OSMS_ITEMS as MARKET_ITEMS, OSMS_CASH as MARKET_CASH, parseTooltip, marketAlerts, suggestPrice, STATS, CATEGORIES, JOBS, SORTS, fromOsmsItems, catalogFacets, sortListings, customItem, daysLeft, isExpired, relistCopy, checkOffer, offerTerms, checkListing, statLines, equipSummary, filterListings, priceBook, findCommand, searchItems, parseMesos } from './market.js';
import { createMarketStore } from './marketstore.js';
/* global __APP_VERSION__ */
const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
import { startCounting, countEvent, countingOptedOut, setCountingOptOut, GOATCOUNTER_CODE } from './usage.js';

// As a public website, keep OSMS pictures in the player's browser (public/sw.js). On this PC the local
// server already saves them.
if (!isLocalHost() && 'serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
import { recommendQuests, questsInText, questChain, gameQuestNames, questsForGameNames, guessTurnIn } from './questrecs.js';
import { buildSteps, currentStep } from './queststeps.js';
import { locateInPicture, findPictureScale, registerPictures, trimSeeThrough, maskCovered } from './picmatch.js';
import { findStatusBars, statusTextRect, levelRect, parseStatusText, parseLevel, findQuestHelper, parseQuestHelper, matchQuestTitle, findChatInput, chatLogRect, collapsedChatRect, inkByContrast, inkDark, OCR_SETTINGS, findQuestWindow, inkQuestList, listChange, nameRect, parseName, mergeWrappedLines } from './hud.js';
import { parseTradeChat, addTrades, summarizePrices, itemNamer, formatMesos } from './prices.js';
import { findCatalogItem, sellVerdict, listingOpportunities, MEOWDB_PRICE_CHECK } from './sellcheck.js';
import { createExpTracker, addExpReading, expSummary, sessionFromTracker } from './exptracker.js';
import { inkTitle } from './minimap.js';
import { OSMS_FILES } from './osms.js';
import { PARTY_QUEST, partyLevelMessage } from './party.js';
import { summarizeSession, bestMeasuredSpot } from './session.js';
import { PROFILE_KEY, snapshotProfile, makeProfileBackup, parseProfileBackup } from './profile.js';
import { CLASSIC_BANDS, guideForLevel, resolveGuideMaps } from './classic-guide.js';
import { atlasNeighbors } from './atlas.js';
import { fetchQuestCatalog, fetchQuestSteps, fetchQuestItems, questStepMaps, questUrl } from './quests.js';
import { pendingQuestTasks, planQuestTrip } from './trip.js';
import { enhanceSelect } from './combobox.js';
import './style.css';
import './goals.css';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const state = { data: validateDataset(starterData), dataFetchedAt: 0, current: null, destination: null, routeStyle: 'fewest', targetId: null, crop: null, worker: null, busy: false, route: null, goals: [], level: 15, job: 'Any', focus: 'quests', guideMode: 'xp', guideBandMin: null, atlasCenter: null, atlasHistory: [], items: [], itemCatalogStatus: 'idle', selectedItem: null, itemDrops: [], itemDropStatus: 'idle', itemShops: [], itemShopStatus: 'idle', gearOwned: {}, partyDone: [], sessions: [], quests: [], questCatalogStatus: 'idle', selectedQuest: null, questSteps: [], questStepStatus: 'idle', questDone: {}, activeQuests: [], questsFinished: [], questsHidden: [], questsAvailable: [], questDetails: {}, questItemsReady: {} };

const LIVE_KEY = 'maple-route-live';
// In-memory test log of what Live GPS read on each tick (window.__mapleRouteLog), for diagnosing
// misreads during a real session. Never stored or sent.
const testLog = window.__mapleRouteLog = [];
const testSnapshots = window.__mapleRouteSnapshots = [];
// Small JPEG of the top corners when a read fails, so a downloaded test log shows what the reader saw.
function snapshotCorner(source, width, height, why, wholeFrame = false) {
  if (testSnapshots.length >= 12) return;
  try {
    const w = wholeFrame ? width : Math.ceil(width * .35), h = wholeFrame ? height : Math.ceil(height * .3), canvas = document.createElement('canvas');
    canvas.width = Math.min(wholeFrame ? 1280 : 560, w); canvas.height = Math.round(canvas.width * h / w);
    canvas.getContext('2d').drawImage(source, 0, 0, w, h, 0, 0, canvas.width, canvas.height);
    testSnapshots.push({ t: new Date().toISOString().slice(11, 19), why, image: canvas.toDataURL('image/jpeg', .8) });
  } catch { /* snapshots are optional */ }
}
let logSeq = 0;
const logTest = (kind, details) => { testLog.push({ seq: ++logSeq, t: new Date().toISOString().slice(11, 23), kind, ...details }); if (testLog.length > 400) testLog.splice(0, testLog.length - 400); };
Object.assign(state, { mapStyle: 'art', guide: { quest: null, stage: null, spoken: null }, itemSources: {}, pictureScales: [], positionPic: null, tools: { exp: true, quest: true, prices: false, mobCount: true }, mapViewMode: 'schematic', live: null, position: null, positionNote: null, voice: true, pipDoc: null, minimapScales: [], useTaxis: true });
try { const saved = JSON.parse(localStorage.getItem(LIVE_KEY) || 'null'); if (saved) { if (saved.mapStyle === 'render') state.mapStyle = 'render'; if (typeof saved.guideQuest === 'string') state.guide.quest = saved.guideQuest; if (typeof saved.goalNpc === 'string') state.goalNpc = saved.goalNpc; if (typeof saved.voiceName === 'string') state.voiceName = saved.voiceName; if (saved.voiceParts && typeof saved.voiceParts === 'object') state.voiceParts = Object.fromEntries(Object.entries(saved.voiceParts).filter(([, v]) => typeof v === 'boolean')); if ([0.85, 1, 1.15].includes(saved.voiceRate)) state.voiceRate = saved.voiceRate; if (typeof saved.startingQuest === 'string') state.startingQuest = saved.startingQuest; state.voice = saved.voice !== false; state.useTaxis = saved.useTaxis !== false; state.useNearestScroll = saved.useNearestScroll === true; state.useTownScrolls = saved.useTownScrolls === true; state.tripAll = saved.tripAll === true; if (saved.tools && typeof saved.tools === 'object') for (const key of Object.keys(state.tools)) if (typeof saved.tools[key] === typeof state.tools[key]) state.tools[key] = saved.tools[key]; state.pictureScales = Array.isArray(saved.pictureScales) ? saved.pictureScales.filter(entry => [entry?.w, entry?.h, entry?.scale].every(Number.isFinite)).slice(0, 8) : []; state.minimapScales = Array.isArray(saved.minimapScales) ? saved.minimapScales.filter(entry => [entry?.w, entry?.h, entry?.scale].every(Number.isFinite)).slice(0, 8) : []; } } catch { /* optional */ }
const saveLive = () => { try { localStorage.setItem(LIVE_KEY, JSON.stringify({ useNearestScroll: Boolean(state.useNearestScroll), useTownScrolls: Boolean(state.useTownScrolls), tripAll: Boolean(state.tripAll), voiceParts: state.voiceParts ?? null, voiceName: state.voiceName ?? null, voiceRate: state.voiceRate ?? 1, goalNpc: state.goalNpc ?? null, startingQuest: state.startingQuest ?? null, mapStyle: state.mapStyle, guideQuest: state.guide.quest, voice: state.voice, useTaxis: state.useTaxis, tools: state.tools, minimapScales: state.minimapScales, pictureScales: state.pictureScales })); } catch { /* optional */ } };

// Parts not yet checked in real play carry this label, so players know to double-check them.
const UNTESTED = '<span class="untested" title="Not checked in real play yet: it may misread or miss things. Please report what you see.">Untested</span>';
$('#app').innerHTML = `
  <header class="top"><div class="top-inner"><div class="brand"><span class="brand-mark">✦</span> Maple Route</div><nav class="top-nav" aria-label="Sections" role="tablist"><a class="top-link" role="tab" href="#navigate">Live GPS</a><a class="top-link" role="tab" href="#goto">Go to</a><a class="top-link" role="tab" href="#world">World map</a><a class="top-link" role="tab" href="#quests">Quests</a><a class="top-link" role="tab" href="#hunt">Hunt &amp; trade</a><a class="top-link" role="tab" href="#market">Market</a><a class="top-link" role="tab" href="#settings">Settings</a></nav></div></header>
  <main class="shell">
    <section class="hero"><div><div class="eyebrow">Classic World companion</div><h1>Your next map, clearly.</h1><p>Turn-by-turn portal directions. Share your game window once and Live GPS follows you from map to map.</p></div><span class="safety">Never touches the game</span></section>
    <section class="card live-card" aria-labelledby="live-title"><div class="live-head"><div><div class="eyebrow">Live GPS</div><h2 id="live-title">Next move</h2></div><span class="pill" id="live-state">Off</span></div>
      <div id="live-step" class="live-step" aria-live="polite"></div>
      <div class="action-row"><button class="button" id="live-start">Start live GPS</button><button class="button secondary hidden" id="live-stop">Stop live GPS</button><button class="button light" id="live-report" title="Something wrong? Opens a pre-filled GitHub issue">Report</button><button class="button light" id="live-pip">Pop-out window</button><label class="toggle"><input type="checkbox" id="live-voice"> Voice</label><label class="toggle"><input type="checkbox" id="live-taxis"> Taxis</label><label class="toggle" title="Return Scroll - Nearest Town"><input type="checkbox" id="live-nearest"> Nearest town scroll</label><label class="toggle" title="Return Scroll to Henesys, Ellinia, Perion, Kerning City, Lith Harbor, Sleepywood, Forgotten Hollow"><input type="checkbox" id="live-townscrolls"> Town scrolls</label><button type="button" class="link-button choose-dest" id="choose-destination">Choose destination</button></div>
      <p class="live-note hidden" id="live-note" role="status"></p>

      <p class="fine">Share the MapleStory window once. About once a second the app reads only the minimap corner, on this device, to see which map you are on and where your dot is. Nothing is uploaded, and no keys, clicks or game memory are involved.</p></section>
    <section class="card" aria-labelledby="recs-title"><h2 id="recs-title">Quests for your level</h2><p class="muted">Quests you can start now, nearest your level first, skipping ones you have finished or are doing.</p><div id="quest-recs" aria-live="polite"></div><p class="fine">To show only quests the game is offering you, read your in-game Available tab (below, or on the <b>Quests</b> page).</p></section>
    <section class="card" aria-labelledby="questlog-title"><h2 id="questlog-title">Read your in-game quest list</h2><p class="muted">While Live GPS runs, an open quest window (<b>Q</b>) is read by itself. These buttons read it on demand.</p>
      <p class="fine">For the game's own list: in game press <b>Q</b>, open the <b>Available</b> tab (expand the towns), then press the button below. Suggestions then only show quests the game is offering you.</p>
      <div class="action-row"><button type="button" class="button secondary" id="read-available" data-read-quests="available">Read my Available tab</button></div><div id="available-read" aria-live="polite"></div>
      <div class="divider"></div><h3 class="sub-title">What have I finished?</h3><p class="fine">Quests are marked finished automatically when Live GPS sees one leave the Quest Helper after it was ready to hand in. To catch up on older ones: in game press <b>Q</b>, open the <b>Completed</b> tab, then press the button below (once per page of the list). Only your shared screen is read.</p>
      <div class="action-row"><button type="button" class="button secondary" id="read-completed" data-read-quests="completed">Read my Completed tab</button></div><div id="completed-read" aria-live="polite"></div><div id="finished-list"></div></section>
    <section class="card" aria-labelledby="quest-helper-title"><h2 id="quest-helper-title">Quest Helper sync</h2><p class="muted">While Live GPS runs, the app reads the in-game Quest Helper, ticks finished counts and tells you when a quest is ready to hand in.</p><div id="quest-helper" aria-live="polite"></div></section>
    <section class="card" aria-labelledby="live-exp-title"><h2 id="live-exp-title">Live EXP tracker</h2><p class="muted">Reads EXP from the status bar while Live GPS runs and checks it against the bar's fill, so misreads are ignored.</p><div id="live-exp" aria-live="polite"></div></section>
    <section class="card" aria-labelledby="prices-title"><div class="data-row"><div><h2 id="prices-title">Market prices</h2><p class="muted">Asking and buying prices collected from trade chat (S&gt; / B&gt; adverts) while Live GPS runs. These are adverts, not completed sales.</p></div><span class="pill" id="price-count">0 adverts logged</span></div>
      <div class="price-tools"><label class="field">Search items<input id="price-query" type="search" autocomplete="off" placeholder="e.g. earring, scroll"></label><button type="button" class="button light" id="price-clear">Clear log</button></div><div id="price-table"></div></section>
    <section class="card" aria-labelledby="sell-title"><h2 id="sell-title">Shop or players? ${UNTESTED}</h2><p class="muted">Compare what an NPC shop pays for an item with what players are asking, before you sell.</p>
      <label class="field">Item<input id="sell-query" type="search" autocomplete="off" placeholder="Type an item name"></label><div id="sell-suggest" class="start-results"></div>
      <div class="sell-fields"><label class="field">How many<input id="sell-qty" type="number" min="1" max="99999" value="1"></label><label class="field">Player price each (mesos)<input id="sell-market" type="text" inputmode="numeric" placeholder="From your log, or type one"></label></div>
      <div id="sell-result" aria-live="polite"></div><div id="sell-opportunities"></div></section>
<section class="card" aria-labelledby="autostart-title" id="autostart-card" hidden><h2 id="autostart-title">Open with MapleStory</h2><label class="toggle"><input type="checkbox" id="autostart"> Open Maple Route by itself when MapleStory starts</label><p class="fine">A small watcher started with Windows checks every few seconds whether MapleStory is running. It only looks at running program names; the game is never touched.</p></section>
<section class="card" aria-labelledby="voice-title"><h2 id="voice-title">Voice</h2><p class="muted">Pick the voice that reads directions. Voices marked <b>natural</b> are Microsoft's free neural voices built into Edge. Korean voices are listed first (they read English with a Korean accent), then Asian English voices such as Singapore, Hong Kong, Philippines and India.</p>
      <label class="field">Voice<select id="voice-name"></select></label><label class="field">Speed<select id="voice-rate"><option value="0.85">Slower</option><option value="1">Normal</option><option value="1.15">Faster</option></select></label>
      <fieldset class="voice-parts"><legend>Say out loud</legend><div id="voice-parts"></div></fieldset>
      <div class="action-row"><button type="button" class="button secondary" id="voice-test">Test voice</button></div></section>
<section class="card market-card" aria-labelledby="market-title"><div class="data-row"><div><h2 id="market-title">Market</h2><p class="muted">Items players are selling or looking for, with the real stats and upgrade slots left. Found something? <b>/find</b> the seller in game and whisper them. Mesos only.</p></div><span class="pill" id="market-mode"></span></div>
      <div id="market-alerts" aria-live="polite"></div>
      <div class="market-notice" role="note"><strong>Maple Route is only a noticeboard that helps players find each other.</strong> We never take, hold or ask for your mesos or items, and we are not part of any trade. Every trade is agreed and settled in game, in mesos, between the two players, using the game's own trade window. Never pay or accept payment outside the game: real-money trading is against MapleStory's rules. Check the item in the trade window before you accept; you trade at your own risk.</div>
      <div class="market-filters"><label class="field">Item<input id="market-query" type="search" autocomplete="off" placeholder="e.g. work gloves, ilbi"></label>
        <label class="field">Show<select id="market-side"><option value="all">Selling and buying</option><option value="sell">Selling</option><option value="buy">Buying</option></select></label>
        <label class="field">Sort<select id="market-sort"></select></label></div>
      <p class="fine"><button type="button" class="link-button" id="market-search-read">Search from screen</button>: press it, then hover an item in game within 3 seconds, and the market shows that item.</p>
      <details class="market-more" id="market-more"><summary>More filters <span id="market-filter-count"></span></summary><div class="market-filters">
        <label class="field">Category<select id="market-category"><option value="">All categories</option></select></label>
        <label class="field">Type<select id="market-type" disabled><option value="">Any type</option></select></label>
        <label class="field">Job<select id="market-job"><option value="">Any job</option></select></label>
        <label class="field">Level<span class="market-stat"><input id="market-level-min" type="number" min="0" max="200" placeholder="from"><input id="market-level-max" type="number" min="0" max="200" placeholder="to"></span></label>
        <label class="field">Stat at least<span class="market-stat"><select id="market-stat"><option value="">any stat</option></select><input id="market-stat-min" type="number" min="1" max="999" placeholder="0"></span></label>
        <label class="field">Slots left at least<input id="market-slots" type="number" min="0" max="20" placeholder="any"></label>
        <label class="field">Scroll success<select id="market-success"><option value="">any</option><option value="10">10%+</option><option value="30">30%+</option><option value="60">60%+</option><option value="70">70%+</option><option value="100">100%</option></select></label>
        <label class="field">Max price<input id="market-max" type="text" inputmode="numeric" placeholder="e.g. 2m"></label>
      </div><button type="button" class="link-button" id="market-clear">Clear filters</button></details>
      <div id="market-book" aria-live="polite"></div><div id="market-list" aria-live="polite"></div>
      <p class="fine">Listings last 7 days, then the poster can relist them. Anything wrong with a listing (a scam, real-money offer or fake item)? Use its Report link.</p></section>
    <section class="card" aria-labelledby="market-post-title"><h2 id="market-post-title">List an item</h2>
      <div class="market-side-pick" role="radiogroup"><label class="toggle"><input type="radio" name="market-post-side" value="sell" checked> I'm selling</label><label class="toggle"><input type="radio" name="market-post-side" value="buy"> I'm buying</label></div>
      <div class="action-row market-read"><button type="button" class="button light" id="market-read">Read item from game screen</button>${UNTESTED}</div><p class="fine">With Live GPS on, press this, then hover the item in game within 3 seconds so its tooltip shows: the name, stats and slots are filled in for you to check.</p><p class="fine" id="market-read-note" role="status"></p>
      <div class="market-combo"><label class="field">Item<input id="market-item" type="search" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="market-item-suggest" placeholder="Type to search all items, or a custom name"></label><ul id="market-item-suggest" class="market-suggest" role="listbox" hidden></ul></div>
      <div id="market-item-card"></div>
      <div class="sell-fields"><label class="field">Price each (mesos)<input id="market-price" inputmode="numeric" placeholder="e.g. 1.5m or 250k"></label><label class="field">How many<input id="market-qty" type="number" min="1" max="9999" value="1"></label></div>
      <div class="sell-fields"><label class="field">Your character name<input id="market-ign" maxlength="12" placeholder="as in game"></label><label class="field">Channel (optional)<input id="market-channel" type="number" min="1" max="40"></label></div>
      <label class="field">Note (optional)<input id="market-note" maxlength="200" placeholder="e.g. clean, can meet in Henesys"></label>
      <div id="market-offer-settings" class="market-offer-settings"><label class="toggle"><input type="checkbox" id="market-offers" checked> Accept offers</label><label class="field">Lowest offer I'll consider (optional)<input id="market-min-offer" inputmode="numeric" placeholder="e.g. 1.2m"></label></div>
      <p class="fine">By posting you agree the trade happens in game, in mesos, between you and the other player. Your character name and channel are shown to everyone.</p><div class="action-row"><button type="button" class="button" id="market-post">Post listing</button></div><p class="fine" id="market-post-note" role="status"></p>
      <div class="divider"></div><h3 class="sub-title">My listings</h3><div id="market-mine"></div><h3 class="sub-title">My offers</h3><div id="market-my-offers"></div></section>
<section class="card" aria-labelledby="feedback-title"><h2 id="feedback-title">Report a problem or a drop</h2><p class="muted">Opens a GitHub issue already filled in with what Maple Route saw (map names, the last mini map reads, your screen size). You read it and press Submit yourself; nothing is sent before that. Chat, character names and other players are never included.</p>
      <label class="field">What went wrong (optional)<input id="report-what" maxlength="300" placeholder="e.g. it thought I was on Henesys Hunting Ground II"></label>
      <div class="action-row"><button type="button" class="button secondary" id="report-problem">Report a problem</button><button type="button" class="button light" id="report-copy">Copy mini map picture</button></div><p class="fine" id="report-note" role="status"></p>
      <div class="divider"></div><h3 class="sub-title">Saw a drop?</h3><p class="fine">Drop tables are not in the game files, so player reports are how the drop data gets better.</p>
      <div class="sell-fields"><label class="field">Item<input id="drop-item" maxlength="80" placeholder="e.g. Diamond Ore"></label><label class="field">Monster<input id="drop-monster" maxlength="80" placeholder="e.g. Stone Golem"></label></div>
      <div class="action-row"><button type="button" class="button secondary" id="report-drop">Report this drop</button></div></section>
<section class="card" aria-labelledby="characters-title"><h2 id="characters-title">Characters</h2><p class="muted">Each character keeps its own level, quests and progress.</p><div id="characters"></div></section>
<section class="card" aria-labelledby="settings-title"><h2 id="settings-title">Live tools</h2><p class="muted">What Live GPS reads besides the mini map.</p><div class="tool-grid">
        <label class="toggle"><input type="checkbox" id="tool-exp"> EXP tracker</label>
        <label class="toggle"><input type="checkbox" id="tool-quest"> Quest Helper sync</label>
        <label class="toggle"><input type="checkbox" id="tool-prices"> Trade chat prices</label>
        <label class="toggle"><input type="checkbox" id="tool-mobcount"> Monster spawn counts in pop-out</label>
        <button type="button" class="button light" id="download-test-log">Download test log</button>
      </div><p class="fine">These read the status bar, the Quest Helper and the last chat lines from the same shared window. Nothing is pressed for you.</p></section>
    <section class="card world-card" aria-labelledby="world-title"><h2 id="world-title">World map</h2><p class="muted">Explore any map and what it connects to, with monster levels, NPCs and rides. Search a map, NPC or monster and press Go to route there.</p><div id="world-map"></div></section>
    <section class="card mapview-card" aria-labelledby="mapview-title"><div class="live-head"><div><div class="eyebrow">Map</div><h2 id="mapview-title">Where you are</h2></div><label class="toggle"><input type="checkbox" id="map-detailed"> Detailed render (may show monsters)</label></div>
      <div id="mapview" aria-live="off"></div><p class="fine" id="mapview-note"></p></section>
    <section class="card dashboard-card" aria-labelledby="next-title"><div class="dashboard-heading"><div><div class="eyebrow">Your local plan</div><h2 id="next-title">Next stop</h2><p class="muted">Set your character and today’s focus. This dashboard updates when you mark quest steps or confirm a new map.</p></div><span class="pill">Manual progress</span></div><div class="profile-fields"><label class="field">Level<input id="profile-level" type="number" min="1" max="200" value="15"></label><label class="field">Job<select id="profile-job"><option>Any</option><option>Beginner</option><option>Warrior</option><option>Magician</option><option>Bowman</option><option>Thief</option></select></label><label class="field">Focus<select id="focus-mode"><option value="quests">Active quests</option><option value="training">Training</option><option value="money">Money candidates</option><option value="item">Chosen item</option></select></label></div><div id="next-stop" aria-live="polite"></div><p class="fine">Stored only in this browser. Suggestions use community data and do not read your character, inventory, or quest log.</p></section>
    <div class="grid"><div class="stack">
      <section class="card" aria-labelledby="plan-title"><h2 id="plan-title">Plan your route</h2><p class="muted">Start by picking the map shown in your game. No scan needed. After each portal, confirm the next map with one tap.</p>
        <label class="field">Find your starting map<input id="start-query" type="search" autocomplete="off" placeholder="Type the map name you see"></label><div id="start-results" class="start-results" aria-live="polite"></div>
        <div class="fields"><label class="field">Current map<select id="current-map"></select></label><label class="field">Destination<select id="destination-map"></select></label></div>
        <div class="action-row"><button class="button" id="plan-route">Plan route</button><button class="button secondary" id="detect-map">Check current screen</button><button class="button light" id="upload-screen">Use a screenshot file</button><input class="visually-hidden" id="screen-file" type="file" accept="image/png,image/jpeg,image/webp"></div>
        <div class="status" id="detection-status" role="status">Pick your starting map above, or check your screen. The reader now tries the minimap automatically; mark the title only if it cannot find it.</div>
        <div id="candidates"></div><details class="scan-details hidden" id="scan-details"><summary>See what the map reader saw</summary><img id="scan-crop" alt="The selected minimap area from this one screen check"><p class="fine">Text found: <code id="scan-text"></code></p><p class="fine">This preview stays in this browser and disappears when the page closes.</p></details><button class="button light hidden" id="reset-area">Set minimap area again</button>
      </section>
      <section class="card" aria-labelledby="trip-title"><h2 id="trip-title">Quest trip planner</h2><p class="muted">Add quests from the guide below. The planner groups each quest’s next unfinished step into a suggested trip. Tick a step when you finish it to unlock its next stop.</p><div id="trip-active" aria-live="polite"></div><div id="trip-warnings"></div><div id="trip-stops"></div><p class="fine">This is a practical order from your current map, not a guaranteed shortest trip. Quest prerequisites and inventory must be checked in game and in each full guide.</p></section>
      <section class="card" aria-labelledby="targets-title"><h2 id="targets-title">Find a mob or NPC</h2><p class="muted">Search by name, then choose a map where it appears. The route leads to the map, not its exact position.</p><label class="field">Mob or NPC name<input id="target-query" type="search" autocomplete="off" placeholder="Try Blue Snail or John"></label><div id="target-results" class="target-results" aria-live="polite"></div><div id="target-locations" class="target-locations"></div></section>
      <section class="card" aria-labelledby="quest-title"><h2 id="quest-title">Quest guide & directions</h2><p class="muted">Find a Classic World quest, then route to each known NPC or hunting map. Tick steps yourself as you finish them in game.</p><label class="field">Quest name<input id="quest-query" type="search" autocomplete="off" placeholder="Try Chrishrama or Mai's Training"></label><div id="quest-results" class="quest-results" aria-live="polite"></div><div id="quest-guide" class="quest-guide" aria-live="polite"></div><p class="fine">Quest steps: <a href="https://mapleclassic.wiki/wiki/Quests" target="_blank" rel="noopener">MapleClassic Wiki contributors</a> (<a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener">CC BY-NC-SA 4.0</a>). Route maps and spawns: OSMS Data Explorer. Community information may be incomplete or differ from your game. Progress is only saved in this browser; no quest log is read.</p></section>
      <section class="card" aria-labelledby="item-title"><h2 id="item-title">Find an item to farm</h2><p class="muted">Pick an item to see documented dropping monsters and maps where they spawn. Choose the spot you prefer and get a route.</p><label class="field">Item name<input id="item-query" type="search" autocomplete="off" placeholder="Try Blue Snail Shell"></label><div id="item-results" class="item-results" aria-live="polite"></div><div id="item-farm" class="item-farm" aria-live="polite"></div><p class="fine">Item names and map spawns: <a href="https://osmsdataexplorer.com/" target="_blank" rel="noopener">OSMS Data Explorer</a>. Community drop listings: <a href="https://mapleclassic.wiki/" target="_blank" rel="noopener">MapleClassic Wiki contributors</a>, <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener">CC BY-NC-SA 4.0</a>. We join those listings to map routes; neither source endorses this app. Missing records do not prove an item is exclusive.</p></section>
      <section class="card" aria-labelledby="gear-title"><h2 id="gear-title">Gear & crafting planner</h2><p class="muted">Choose an item in the finder above. Compare its documented drop and shop paths, or plan a listed recipe. Enter material counts yourself; nothing reads your inventory.</p><div id="gear-plan" aria-live="polite"></div><p class="fine">Starter recipes: <a href="https://mapleclassic.wiki/wiki/Smithing" target="_blank" rel="noopener">Smithing</a>, <a href="https://mapleclassic.wiki/wiki/Weaponcrafting" target="_blank" rel="noopener">Weaponcrafting</a>, and <a href="https://mapleclassic.wiki/wiki/Tailoring" target="_blank" rel="noopener">Tailoring</a> by MapleClassic Wiki contributors (<a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener">CC BY-NC-SA 4.0</a>). The wiki marks these recipes pre-launch. Check the actual crafting window before spending materials. This is a starter selection, not a complete recipe database.</p></section>
      <section class="card" aria-labelledby="party-title"><h2 id="party-title">Party-quest checklist</h2><p class="muted">Plan Kerning’s First Time Together, then tick preparation and stages yourself. The app routes you to the entrance; it cannot see party status or instance progress.</p><div id="party-plan" aria-live="polite"></div><p class="fine">Adapted from the <a href="https://mapleclassic.wiki/wiki/First_Time_Together" target="_blank" rel="noopener">MapleClassic Wiki walkthrough</a> by its contributors (<a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener">CC BY-NC-SA 4.0</a>). Marked pre-launch by the wiki; verify level limits, channels, and stage rules in game. This is the only launch party quest the source currently identifies.</p></section>
      <section class="card" aria-labelledby="session-title"><h2 id="session-title">My training sessions</h2><p class="muted">Record your own EXP, mesos, time, and map to compare actual results. Nothing is measured or read automatically.</p><div class="session-fields"><label class="field">Map<select id="session-map"></select></label><label class="field">Minutes<input id="session-minutes" type="number" min="1" max="1440" placeholder="30"></label><label class="field">Start level<input id="session-start-level" type="number" min="1" max="200"></label><label class="field">End level<input id="session-end-level" type="number" min="1" max="200"></label><label class="field">Start EXP<input id="session-start-exp" type="number" min="0"></label><label class="field">End EXP<input id="session-end-exp" type="number" min="0"></label><label class="field">Start mesos<input id="session-start-mesos" type="number" min="0"></label><label class="field">End mesos<input id="session-end-mesos" type="number" min="0"></label></div><label class="field">If you leveled up: total EXP gained<input id="session-exp-gained" type="number" min="0" placeholder="Needed only when level changes"></label><div class="action-row"><button class="button secondary" id="save-session">Save session</button></div><div id="session-status" role="status" class="fine"></div><div id="session-list" aria-live="polite"></div><p class="fine">Rates are your recorded change divided by time, not a prediction. Meso change includes spending during the session. EXP shown by the game may reset on level-up, so supply total gained when your level changes. Saved only in this browser.</p></section>
      <section class="card" aria-labelledby="guide-title"><h2 id="guide-title">Level guide</h2><p class="muted">Explore possible training or loot-heavy maps for your level. These are data-based suggestions, not measured XP or mesos per hour.</p><label class="field">Your level<input id="player-level" type="number" min="1" max="200" value="15"></label><div class="action-row"><button class="button secondary" id="guide-xp">Training spots</button><button class="button light" id="guide-money">Money candidates</button></div><p class="fine" id="guide-explainer"></p><div id="guide-results" class="guide-results"></div></section>
      <section class="card" aria-labelledby="journey-title"><h2 id="journey-title">Classic leveling journey</h2><p class="muted">A simple path through Victoria Island, with alternatives at each stage. Pick a spot to route there.</p><div id="journey-bands" class="journey-bands" aria-label="Level ranges"></div><div id="journey-detail" class="journey-detail"></div><p class="fine">Adapted as short route suggestions from the <a href="https://mapleclassic.wiki/wiki/Training_guide" target="_blank" rel="noopener">MapleClassic Wiki training guide</a> (community content, <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener">CC BY-NC-SA 4.0</a>). Its rankings are a starting point, not guaranteed best XP for your class or gear. Map names are checked against the current route feed.</p></section>
      <section class="card" aria-labelledby="goals-title"><h2 id="goals-title">Quest stops</h2><p class="muted">Save a quest or errand with its destination map. Progress is kept only in this browser.</p><div class="fields"><label class="field">Stop name<input id="goal-name" type="text" maxlength="80" placeholder="Talk to the job instructor"></label><label class="field">Map<select id="goal-map"></select></label></div><div class="action-row"><button class="button secondary" id="add-goal">Save stop</button></div><div id="goal-list" aria-live="polite"></div></section>
      <section class="card" aria-labelledby="data-title"><div class="data-row"><div><h2 id="data-title">Map data</h2><p class="muted" id="data-status">Loading the public portal graph…</p></div><span class="pill" id="map-count">0 maps</span></div>
        <div class="data-actions"><button class="button secondary" id="refresh-data">Refresh map data</button><button class="button light" id="import-data">Import authorized JSON</button><input class="visually-hidden" id="data-file" type="file" accept="application/json,.json"></div>
        <div class="divider"></div><h3>Back up your progress</h3><p class="fine">Download your quests, goals, settings, and session logs. Restore them in another browser or after clearing site data. Map data is refreshed separately.</p><div class="data-actions"><button class="button secondary" id="export-progress">Download progress backup</button><button class="button light" id="import-progress">Restore progress backup</button><input class="visually-hidden" id="progress-file" type="file" accept="application/json,.json"></div><p class="fine" id="progress-status" role="status"></p>
        <div class="divider"></div><p class="fine">Map and portal routing data is fetched directly from <a href="https://osmsdataexplorer.com/" target="_blank" rel="noopener">OSMS Data Explorer</a> on your device. <a href="https://meowdb.com/msclassic/ko/quests" target="_blank" rel="noopener">MeowDB quests</a> remain a separate reference. Imported data stays in your browser.</p>
      </section>
    </div><div class="stack"><section class="card" aria-labelledby="route-title"><h2 id="route-title">Directions</h2><label class="field">Route style<select id="route-style"><option value="fewest">Fewest portals</option><option value="level">Avoid much higher-level monsters</option><option value="cautious">Avoid possibly special exits</option></select></label><div id="route-result" aria-live="polite"><div class="empty"><div class="icon">◇</div>Choose a destination to see your next portal.</div></div></section>
      <section class="card" aria-labelledby="atlas-title"><h2 id="atlas-title">Interactive portal map</h2><p class="muted">Explore one map and its connected portals. Click a neighboring map to move around the network, then choose it as your start or destination.</p><label class="field">Find a map<input id="atlas-query" type="search" autocomplete="off" placeholder="Search Henesys, Sleepywood…"></label><div id="atlas-results" class="atlas-results" aria-live="polite"></div><div class="atlas-toolbar"><button class="button light" id="atlas-back" type="button">← Back</button><button class="button secondary" id="atlas-current" type="button">Show my current map</button></div><div class="atlas-scroll"><div id="atlas-canvas" class="atlas-canvas" role="group" aria-label="Nearby portal network"></div></div><p class="fine" id="atlas-caption">Schematic connections, not the game’s terrain or your live position. Green lines leave the center map; dashed amber lines arrive from a neighbor.</p><div id="atlas-detail" class="atlas-detail"></div></section>
      <section class="card" aria-labelledby="privacy-title"><h2 id="privacy-title">How screen reading works</h2><p class="fine" id="usage-note"></p><p class="muted">Live GPS uses your browser's normal screen sharing, the same video a streaming app receives. It reads the mini map's title to know your map, and the yellow dot and blue portal rings to know where you stand. Everything happens in this browser.</p><div class="callout">It never reads game memory, never sends keys or clicks, and never changes the game. Stop sharing at any time from the browser bar or the Stop button. Portal positions come from community data and may be off after a game update.</div></section></div></div>
    <footer class="footer"><span>Unofficial, free fan project. Not affiliated with or endorsed by Nexon, OSMS Data Explorer or MeowDB. Use at your own risk.</span><span>Reads only the window you share, on your PC: no game memory, files, network or inputs. Game art © NEXON.</span></footer>
  </main>
  <div class="modal-backdrop hidden" id="calibration" role="dialog" aria-modal="true" aria-labelledby="calibration-title"><div class="modal"><h2 id="calibration-title">Mark the minimap name</h2><p class="muted">Drag a box around the minimap's blue header or the whole minimap. The reader will focus on the name area. Keep the minimap open in game. This frame is kept only until recognition finishes.</p><div class="snapshot-wrap"><img class="snapshot" id="snapshot" alt="One captured game frame for selecting the minimap text area"><div class="crop-box hidden" id="crop-box"></div></div><p class="tip" id="crop-hint">Drag a rectangle over the minimap title.</p><div class="action-row"><button class="button" id="use-area" disabled>Read this area</button><button class="button light" id="cancel-area">Cancel</button></div></div></div>`;

const currentSelect = $('#current-map'), destinationSelect = $('#destination-map');
for (const id of ['#current-map', '#destination-map', '#session-map', '#goal-map']) enhanceSelect($(id), { placeholder: 'Type a map name or pick from the list' });

// Four views instead of one long page. Sections keep their markup; they are just regrouped.
const VIEWS = {
  navigate: ['live-title', 'mapview-title'],
  goto: ['plan-title', 'recs-title', 'targets-title', 'quest-title', 'item-title', 'guide-title', 'journey-title', 'route-title'],
  world: ['world-title', 'atlas-title'],
  quests: ['quest-helper-title', 'questlog-title', 'next-title', 'trip-title', 'goals-title', 'party-title'],
  hunt: ['live-exp-title', 'session-title', 'sell-title', 'prices-title', 'gear-title'],
  market: ['market-title', 'market-post-title'],
  settings: ['voice-title', 'autostart-title', 'characters-title', 'settings-title', 'feedback-title', 'data-title', 'privacy-title']
};
{
  const container = document.createElement('div'); container.className = 'views';
  for (const [view, ids] of Object.entries(VIEWS)) {
    const panel = document.createElement('div'); panel.className = `view view-${view}`; panel.dataset.view = view; panel.setAttribute('role', 'tabpanel');
    for (const id of ids) { const section = document.getElementById(id)?.closest('section'); if (section) panel.append(section); }
    container.append(panel);
  }
  document.querySelectorAll('.shell > .card, .shell > .grid').forEach(leftover => leftover.remove());
  $('.hero').after(container);
  // Go to: the ways to pick a destination as tabs, one shown at a time, with Directions beside it.
  const goto = container.querySelector('.view-goto');
  const pickers = [['plan-title', 'Map'], ['recs-title', 'Quests'], ['targets-title', 'Monster / NPC'], ['quest-title', 'Quest guide'], ['item-title', 'Item'], ['guide-title', 'Training'], ['journey-title', 'Journey']];
  const column = document.createElement('div'); column.className = 'goto-pick';
  column.innerHTML = `<div class="goto-chosen hidden"><span>Going to <strong id="goto-dest"></strong></span><button type="button" class="link-button" data-goto-change>Change</button></div><div class="goto-tabs" role="tablist">${pickers.map(([id, label]) => `<button type="button" class="goto-tab" role="tab" data-goto-tab="${id}">${label}</button>`).join('')}</div>`;
  for (const [id] of pickers) { const card = document.getElementById(id)?.closest('section'); if (card) { card.dataset.picker = id; column.append(card); } }
  goto.prepend(column);
}
function showPicker(id) {
  document.querySelectorAll('.goto-pick > section[data-picker]').forEach(card => card.classList.toggle('picker-off', card.dataset.picker !== id));
  document.querySelectorAll('[data-goto-tab]').forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.gotoTab === id)));
  state.picker = id;
}
// With a destination set the pickers fold away behind "Going to X · Change".
function renderGotoChosen() {
  let map = null; try { map = mapById(state.destination); } catch { return; } // before the data helpers exist
  const bar = document.querySelector('.goto-chosen');
  if (!bar) return;
  const folded = Boolean(map) && !state.pickerOpen;
  bar.classList.toggle('hidden', !map); $('#goto-dest').textContent = map?.name ?? '';
  bar.querySelector('[data-goto-change]').textContent = folded ? 'Change' : 'Hide';
  document.querySelector('.goto-pick').classList.toggle('folded', folded);
}
document.querySelector('.goto-pick').addEventListener('click', event => {
  const tab = event.target.closest('[data-goto-tab]'); if (tab) { showPicker(tab.dataset.gotoTab); return; }
  if (event.target.closest('[data-goto-change]')) { state.pickerOpen = !state.pickerOpen || !state.destination; renderGotoChosen(); }
});
showPicker('plan-title');
{
}
// The Live GPS page fits one window: no big intro, compact text, and the map takes the height left.
function fitLivePage() {
  if (!document.body.classList.contains('gps-page')) return;
  const root = document.documentElement, step = $('#live-step');
  // Give the map what is left; if that is under 180 px, take the difference from the Live card
  // (which then scrolls inside itself) so the page itself never scrolls.
  root.style.setProperty('--step-h', '46vh');
  const measure = () => { const box = document.querySelector('#mapview .mv-picture, #mapview svg'); return box ? window.innerHeight - box.getBoundingClientRect().top - (document.querySelector('#mapview-note')?.offsetHeight ?? 0) - 20 + window.scrollY : 300; };
  let room = measure();
  if (room < 180 && step) { root.style.setProperty('--step-h', `${Math.max(90, step.offsetHeight - (180 - room))}px`); room = measure(); }
  root.style.setProperty('--map-h', `${Math.max(120, Math.round(room))}px`);
}
window.addEventListener('resize', fitLivePage);

// The "Read your in-game quest list" card lives on the Quests page and also under the quest
// suggestions in Go to → Quests: it moves to whichever of the two is opened.
function placeQuestLog(view) {
  const card = $('#questlog-title')?.closest('section'); if (!card) return;
  if (view === 'goto') {
    const recs = $('#recs-title')?.closest('section');
    if (recs && card.previousElementSibling !== recs) recs.after(card);
    card.dataset.picker = 'recs-title'; card.classList.toggle('picker-off', state.picker !== 'recs-title');
  } else if (view === 'quests') {
    const helper = $('#quest-helper-title')?.closest('section');
    if (helper && card.previousElementSibling !== helper) helper.after(card);
    delete card.dataset.picker; card.classList.remove('picker-off');
  }
}
function showView(view) {
  if (!VIEWS[view]) view = 'navigate';
  placeQuestLog(view);
  // After start-up finishes: opening the site straight on #market runs this before the market code exists.
  if (view === 'market') setTimeout(() => loadMarket(), 0);
  document.body.classList.toggle('gps-page', view === 'navigate'); document.body.classList.toggle('goto-page', view === 'goto'); setTimeout(fitLivePage, 0);
  if (view === 'goto') { state.pickerOpen = false; renderGotoChosen(); }
  document.querySelectorAll('.view').forEach(panel => panel.classList.toggle('hidden', panel.dataset.view !== view));
  document.querySelectorAll('.top-link').forEach(link => link.setAttribute('aria-selected', String(link.getAttribute('href') === `#${view}`)));
}
function reveal(selector) {
  const picker = $(selector)?.closest('[data-picker]'); if (picker) { showPicker(picker.dataset.picker); state.pickerOpen = true; renderGotoChosen(); }
  const element = $(selector), panel = element?.closest('.view');
  if (panel) { history.replaceState(null, '', `#${panel.dataset.view}`); showView(panel.dataset.view); }
  element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
window.addEventListener('hashchange', () => showView(location.hash.slice(1)));
showView(location.hash.slice(1));
const status = (message, error = false) => { $('#detection-status').textContent = message; $('#detection-status').classList.toggle('error', error); };
const mapById = id => state.data.maps.find(map => map.id === id);
const sourceDate = () => state.data.updated ? new Date(state.data.updated).toLocaleDateString() : 'unknown date';

// Each character keeps its own progress (level, quests, goals…). The first, unnamed profile keeps the
// original key so nothing saved before is lost.
const CHARACTER_KEY = 'maple-route-character';
function character() { try { return localStorage.getItem(CHARACTER_KEY) || ''; } catch { return ''; } }
function characters() { try { return JSON.parse(localStorage.getItem(`${CHARACTER_KEY}s`) || '[]').filter(name => typeof name === 'string'); } catch { return []; } }
function profileKey(name = character()) { return name ? `${PROFILE_KEY}:${name}` : PROFILE_KEY; }
function switchCharacter(name) {
  name = String(name ?? '').trim().slice(0, 24);
  try {
    localStorage.setItem(`${CHARACTER_KEY}s`, JSON.stringify([...new Set([...characters(), ...(character() ? [character()] : []), ...(name ? [name] : [])])]));
    if (name) localStorage.setItem(CHARACTER_KEY, name); else localStorage.removeItem(CHARACTER_KEY);
  } catch { /* storage blocked */ }
  location.reload();
}

let bootstrapping = true;
// The graph routes and distances use: your Taxis / Scrolls choices applied.
const travel = () => travelGraph(state.data, { taxis: state.useTaxis, nearest: Boolean(state.useNearestScroll), towns: Boolean(state.useTownScrolls) });

function persist() {
  if (bootstrapping) return;
  try { localStorage.setItem(profileKey(), JSON.stringify(snapshotProfile(state))); }
  catch { $('#progress-status').textContent = 'Your browser could not save progress. Download a backup now.'; }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ data: state.data, savedAt: state.dataFetchedAt })); }
  catch { $('#data-status').textContent += ' Your browser could not cache map data for the next visit.'; }
}

function populateMaps() {
  if (state.current && !mapById(state.current)) state.current = null;
  if (state.destination && !mapById(state.destination)) state.destination = null;
  const sorted = [...state.data.maps].sort((a, b) => a.name.localeCompare(b.name));
  const options = '<option value="">Choose a map…</option>' + sorted.map(m => `<option value="${esc(m.id)}">${esc(m.name)}${m.area ? ` · ${esc(m.area)}` : ''}</option>`).join('');
  const selectedSessionMap = $('#session-map').value;
  currentSelect.innerHTML = options; destinationSelect.innerHTML = options; $('#goal-map').innerHTML = options; $('#session-map').innerHTML = options;
  $('#session-map').value = mapById(selectedSessionMap) ? selectedSessionMap : state.current && mapById(state.current) ? state.current : '';
  currentSelect.value = state.current && mapById(state.current) ? state.current : '';
  destinationSelect.value = state.destination && mapById(state.destination) ? state.destination : '';
  $('#map-count').textContent = `${state.data.maps.length} maps`;
  $('#data-status').textContent = `${state.data.label} · ${state.data.portals.length} directed portals · updated ${sourceDate()}`;
  $('#reset-area').classList.toggle('hidden', !state.crop);
  if (state.targetId && !state.data.targets.some(target => target.id === state.targetId)) state.targetId = null;
  if (state.current && !$('#start-query').value) $('#start-query').value = mapById(state.current)?.name ?? '';
  renderStartResults(); renderRoute(); renderGoals(); renderTargets(); renderItemResults(); renderItemFarm(); renderGearPlan(); renderPartyPlan(); renderSessionList(); renderGuide(); renderJourney(); renderAtlas(); renderQuestGuide(); renderTripPlanner(); renderDashboard();
}

function renderStartResults() {
  const results = $('#start-results'); results.replaceChildren();
  const query = normalize($('#start-query').value);
  if (query.length < 2 || (state.current && normalize(mapById(state.current)?.name) === query)) return;
  const matches = state.data.maps.filter(map => normalize(map.name).includes(query) || normalize(map.area).includes(query))
    .sort((a, b) => Number(normalize(b.name).startsWith(query)) - Number(normalize(a.name).startsWith(query)) || a.name.localeCompare(b.name)).slice(0, 12);
  if (!matches.length) { results.textContent = 'No matching map. Try part of its name or region.'; return; }
  for (const map of matches) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'start-option';
    const name = document.createElement('strong'); name.textContent = map.name;
    const area = document.createElement('span'); area.textContent = map.area;
    button.append(name, area);
    button.addEventListener('click', () => { $('#start-query').value = map.name; setCurrent(map.id); results.replaceChildren(); });
    results.append(button);
  }
}
$('#start-query').addEventListener('input', renderStartResults);

function instruction(step, next = null) {
  return describeStep(state.data, step, next, { level: state.level }).headline;
}

function renderRoute() {
  renderGotoChosen?.();
  const target = $('#route-result');
  if (!state.destination) { target.innerHTML = '<div class="empty"><div class="icon">◇</div>Choose a destination to see your next portal.</div>'; return; }
  if (!state.current) { target.innerHTML = '<div class="empty">Select your current map or check your screen first.</div>'; return; }
  const current = mapById(state.current), destination = mapById(state.destination);
  if (!current || !destination) { target.innerHTML = '<div class="empty">Choose maps from the current data source.</div>'; return; }
  const route = routeWithPreference(travel(), state.current, state.destination, state.routeStyle, state.level, { taxis: true }); state.route = route;
  if (route === null) { target.innerHTML = `<div class="current"><div class="label">Current map</div><div class="name">${esc(current.name)}</div><div class="hint">Destination: ${esc(destination.name)}</div></div>${noRouteHtml()}`; $('#route-nearest')?.addEventListener('click', event => { state.destination = event.currentTarget.dataset.map; destinationSelect.value = state.destination; persist(); renderRoute(); renderTargets(); }); renderLive(); return; }
  if (!route.length) { target.innerHTML = `<div class="current"><div class="label">Arrived</div><div class="name">${esc(destination.name)}</div><div class="hint">You are at your destination.</div></div>`; renderLive(); return; }
  const tradeoff = routeTradeoff(state.data, route, state.routeStyle, state.level);
  const fewest = routeWithPreference(travel(), state.current, state.destination, 'fewest', state.level, { taxis: true });
  const next = route[0];
  target.innerHTML = `<div class="current"><div class="label">Next move · ${route.length} map${route.length === 1 ? '' : 's'} remaining</div><div class="name">${esc(current.name)}</div><div class="hint">${esc(instruction(next, route[1]))}.</div></div>
    <p class="route-tradeoff">${esc(tradeoff.summary)} ${route.length} portal${route.length === 1 ? '' : 's'}${fewest && route.length > fewest.length ? ` · ${route.length - fewest.length} more than the fewest-portals route` : ''}. ${tradeoff.flagged ? `${tradeoff.flagged} exit${tradeoff.flagged === 1 ? '' : 's'} may involve special travel. ` : ''}${tradeoff.highMaps ? `${tradeoff.highMaps} map${tradeoff.highMaps === 1 ? ' has' : 's have'} a listed higher-level monster. ` : ''}These are data-based hints, not verified safety or entry rules.</p>
    <div class="action-row"><button class="button" id="arrived-next">I’m on ${esc(mapById(next.to).name)}</button><button class="button secondary" id="speak-next">Speak next step</button><button class="button light" id="check-next">Check next screen</button></div>
    <div class="divider"></div><ol class="steps">${route.map((step, i) => `<li class="step ${i === 0 ? 'next' : ''}"><span class="step-num">${i + 1}</span><div>${stepHtml(step, route[i + 1])}<details class="portal-detail"><summary>Portal details</summary><span>Data label: ${esc(step.name)}${step.note ? ` · ${esc(step.note)}` : ''}</span></details>${/^\d{9}$/.test(step.from) ? `<a class="fine" href="https://meowdb.com/msclassic/ko/maps/${step.from}" target="_blank" rel="noopener">Map details ↗</a>` : ''}</div></li>`).join('')}</ol>
    <p class="fine">Portal sides come from community map data. Live GPS adds your real position from the minimap. Hidden or scripted exits are used only when no visible path exists, and some may need a quest.</p>`;
  $('#arrived-next').addEventListener('click', () => { setCurrent(next.to); $('#start-query').value = mapById(next.to).name; });
  $('#speak-next').addEventListener('click', () => speak(next));
  $('#check-next').addEventListener('click', () => checkScreen());
  renderLive();
}

function stepHtml(step, next) {
  const words = describeStep(state.data, step, next, { level: state.level });
  return `<strong>${esc(words.headline)}</strong><small>${esc(mapById(step.from).name)} → ${esc(mapById(step.to).name)}</small><p>${esc(words.how)}${words.arrival ? ` ${esc(words.arrival)}` : ''}</p>`;
}

function noRouteHtml() {
  const why = explainNoRoute(state.data, state.current, state.destination);
  return `<div class="empty">No walking route found. ${esc(mapById(state.destination)?.name ?? 'This map')} is probably reached through an NPC (a ticket, subway, jump quest or quest warp), which the map data does not list.${why.nearest ? `<div class="action-row center"><button class="button secondary" id="route-nearest" data-map="${esc(why.nearest.id)}">Route to ${esc(why.nearest.name)} instead</button></div>` : ''}</div>`;
}
$('#route-style').addEventListener('change', () => { state.routeStyle = $('#route-style').value; persist(); renderRoute(); });
$('#route-style').closest('label').insertAdjacentHTML('afterend', '<label class="toggle route-toggle"><input type="checkbox" id="use-taxis"> Use taxis and NPC rides (they cost mesos)</label>');
$('#use-taxis').checked = state.useTaxis;
$('#use-taxis').addEventListener('change', event => { state.useTaxis = event.target.checked; $('#live-taxis').checked = state.useTaxis; saveLive(); renderRoute(); });
$('#live-taxis').checked = state.useTaxis;
for (const [id, key] of [['live-nearest', 'useNearestScroll'], ['live-townscrolls', 'useTownScrolls']]) {
  $(`#${id}`).checked = Boolean(state[key]);
  $(`#${id}`).addEventListener('change', event => { state[key] = event.target.checked; saveLive(); renderRoute(); renderLive(); renderTargets(); });
}
$('#live-taxis').addEventListener('change', event => { state.useTaxis = event.target.checked; $('#use-taxis').checked = state.useTaxis; saveLive(); renderRoute(); renderLive(); renderTargets(); });

// Voice: Edge's free "Online (Natural)" Microsoft voices sound far better than the default one. The
// chosen voice is remembered; with none chosen, SunHi (Korean) is preferred, then a natural English one.
// Korean women's voices first, then Asian-English natural voices, then natural US/UK English.
const VOICE_PREFERENCE = [/SunHi|Heami|Yuna/i, /Natural.*English \((Singapore|Hong Kong|Philippines|India)\)/i, /(Ava|Emma|Jenny|Aria).*Natural/i, /Natural.*English/i];
const voiceRank = v => /^ko/i.test(v.lang) ? 0 : /(Singapore|Hong Kong|Philippines|India)/i.test(v.name) && /Natural/i.test(v.name) ? 1 : /Natural/i.test(v.name) ? 2 : 3;
function voices() { return 'speechSynthesis' in window ? speechSynthesis.getVoices() : []; }
function chosenVoice() {
  const all = voices();
  return all.find(v => v.name === state.voiceName) ?? VOICE_PREFERENCE.map(re => all.find(v => re.test(v.name))).find(Boolean) ?? null;
}
// Which kinds of spoken lines are on (Settings → Voice). Directions = which portal and where it
// leads on each new map; monsters = what spawns there and how many; quests = quest progress lines.
const VOICE_PARTS = { directions: 'Which portal to take and where it leads', monstersDest: 'Monsters at your destination, with counts', monstersAll: 'Monsters on every map you enter (not just the destination)', arrival: 'Arriving at your destination', npc: 'Reaching the NPC you are going to', quests: 'Quest steps and progress', warnings: 'Warnings (mini map hidden, share stopped)' };
const VOICE_DEFAULT_OFF = new Set(['monstersAll']);
function voiceOn(part) { return state.voice && (state.voiceParts?.[part] ?? !VOICE_DEFAULT_OFF.has(part)) === true; }
function sayPart(part, words) { if (words && voiceOn(part)) say(words); }

function say(words) {
  if (!('speechSynthesis' in window)) return;
  const line = new SpeechSynthesisUtterance(words), voice = chosenVoice();
  if (voice) { line.voice = voice; line.lang = voice.lang; }
  line.rate = state.voiceRate ?? 1;
  speechSynthesis.cancel(); speechSynthesis.speak(line);
}
function renderVoicePicker() {
  const select = $('#voice-name'); if (!select) return;
  const all = voices().slice().sort((a, b) => voiceRank(a) - voiceRank(b) || a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));
  const current = chosenVoice()?.name ?? '';
  select.innerHTML = all.length ? all.map(v => `<option value="${esc(v.name)}"${v.name === current ? ' selected' : ''}>${esc(v.name.replace(/^Microsoft /, '').replace(/ Online \(Natural\)/, ' (natural)'))}</option>`).join('') : '<option value="">Default voice</option>';
  $('#voice-rate').value = String(state.voiceRate ?? 1);
}

function speak(step) {
  if (!('speechSynthesis' in window)) { status('Voice playback is not available in this browser.', true); return; }
  const index = state.route?.indexOf(step) ?? -1;
  say(spokenStep(state.data, step, index >= 0 ? state.route[index + 1] : null, { level: state.level }));
}

function setCurrent(id, detected = false) {
  if (!mapById(id)) return;
  const previous = state.current;
  state.current = id; currentSelect.value = id; $('#candidates').replaceChildren();
  preloadNeighbors(id);
  if (state.position?.mapId !== id) state.position = null;
  $('#start-query').value = mapById(id).name; $('#start-results').replaceChildren();
  state.atlasCenter = id;
  persist(); renderRoute(); renderTargets(); renderItemFarm(); renderJourney(); renderAtlas(); renderQuestGuide(); renderTripPlanner(); renderDashboard();
  status(detected ? (previous === id ? `Still at ${mapById(id).name}. Route unchanged.` : `Recognized ${mapById(id).name}. Directions updated.`) : `Current map set to ${mapById(id).name}.`);
}

// Crafting recipes from the game files (what a Garnet or an ingot is made from, and where), saved
// for a day like the quest list. Loaded with the quest list; guiding works without them.
async function loadCrafting() {
  if (state.crafting || state.craftingLoading) return;
  state.craftingLoading = true;
  const KEY = 'maple-route-crafting-v1';
  let cached = null; try { cached = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { cached = null; }
  try {
    if (cached?.recipes && Date.now() - cached.savedAt < 24 * 60 * 60 * 1000) state.crafting = cached.recipes;
    else {
      const response = await fetch(OSMS_CRAFTING, { cache: 'no-store' });
      if (!response.ok) throw new Error('crafting list unavailable');
      state.crafting = fromOsmsCrafting(await response.json());
      try { localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), recipes: state.crafting })); } catch { /* storage full: fine */ }
    }
    state.tripCache = null; applyObjective(); renderLive();
  } catch { state.crafting = cached?.recipes ?? null; } // offline: last saved recipes, else none
  finally { state.craftingLoading = false; }
}

async function loadQuestCatalog() {
  if (state.questCatalogStatus !== 'idle') return;
  loadCrafting();
  state.questCatalogStatus = 'loading'; renderQuestResults();
  try {
    const QUESTS_KEY = 'maple-route-quests-v2'; // v2: quest text kept (names the monsters when the wiki has no drops)
    let cached = null; try { cached = JSON.parse(localStorage.getItem(QUESTS_KEY) || 'null'); } catch { cached = null; }
    const fresh = cached?.quests?.length && Date.now() - cached.savedAt < 24 * 60 * 60 * 1000;
    try {
      state.quests = fresh ? cached.quests : await fetchQuestCatalog();
      if (!fresh) try { localStorage.setItem(QUESTS_KEY, JSON.stringify({ savedAt: Date.now(), quests: state.quests })); } catch { /* storage full: fine */ }
    } catch (error) { if (!cached?.quests?.length) throw error; state.quests = cached.quests; } // offline: last saved list
    state.quests = state.quests.map(q => ({ ...q }));
    state.questCatalogStatus = 'loaded';
    // Fill missing hand-in NPCs from the game's quest text and the known NPC names.
    const npcNames = [...new Set(state.data.targets.filter(t => t.kind === 'npc').map(t => t.name))];
    for (const quest of state.quests) if (!quest.turnIn) { quest.turnIn = guessTurnIn(quest.doneText, npcNames, quest.giver); quest.turnInGuessed = true; }
    if (state.selectedQuest?.name) {
      const match = state.quests.find(quest => quest.name === state.selectedQuest.name);
      if (match) selectQuest(match);
    }
  } catch (error) { state.questCatalogStatus = 'error'; state.questCatalogError = error.message; }
  for (const name of state.activeQuests) ensureQuestDetails(name);
  renderQuestResults(); renderQuestGuide(); renderTripPlanner(); renderDashboard(); renderLive();
}

function renderQuestResults() {
  const panel = $('#quest-results'); panel.replaceChildren();
  const query = normalize($('#quest-query').value);
  if (state.selectedQuest && query === normalize(state.selectedQuest.name)) return;
  if (state.questCatalogStatus === 'loading') { panel.textContent = 'Loading community quest names…'; return; }
  if (state.questCatalogStatus === 'error') { panel.textContent = `${state.questCatalogError} Try again later.`; return; }
  if (query.length < 2) return;
  const matches = state.quests.filter(quest => normalize(quest.name).includes(query))
    .sort((a, b) => Number(normalize(b.name).startsWith(query)) - Number(normalize(a.name).startsWith(query)) || a.name.localeCompare(b.name)).slice(0, 12);
  if (!matches.length) { panel.textContent = 'No matching quest in the community catalog. Try a shorter name.'; return; }
  for (const quest of matches) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'quest-option';
    const name = document.createElement('strong'); name.textContent = quest.name;
    const meta = document.createElement('span'); meta.textContent = `${quest.level ? `Lv. ${quest.level} · ` : ''}${quest.giver || quest.start || 'Check wiki for starting point'}`;
    button.append(name, meta); button.addEventListener('click', () => selectQuest(quest)); panel.append(button);
  }
}

async function ensureQuestDetails(name) {
  if (state.questDetails[name]) return;
  state.questDetails[name] = { status: 'loading', steps: [], items: [] };
  renderTripPlanner(); renderDashboard();
  const [steps, items] = await Promise.allSettled([fetchQuestSteps(name), fetchQuestItems(name)]);
  queueMicrotask(() => { if (state.guide.quest === name) { applyObjective(); renderLive(); } });
  state.questDetails[name] = {
    status: steps.status === 'fulfilled' ? 'loaded' : 'error',
    steps: steps.status === 'fulfilled' ? steps.value : [],
    items: items.status === 'fulfilled' ? items.value : [],
    itemsStatus: items.status === 'fulfilled' ? 'loaded' : 'error',
    error: steps.status === 'rejected' ? steps.reason?.message ?? 'Quest steps unavailable.' : null
  };
  if (state.selectedQuest?.name === name) {
    state.questSteps = state.questDetails[name].steps;
    state.questStepStatus = state.questDetails[name].status;
    state.questStepError = state.questDetails[name].error;
  }
  renderQuestGuide(); renderTripPlanner(); renderDashboard();
}

function selectQuest(quest) {
  state.selectedQuest = quest;
  const cached = state.questDetails[quest.name];
  state.questSteps = cached?.steps ?? [];
  state.questStepStatus = cached?.status ?? 'loading';
  state.questStepError = cached?.error;
  $('#quest-query').value = quest.name; $('#quest-results').replaceChildren(); persist(); renderQuestGuide();
  ensureQuestDetails(quest.name);
}

function renderQuestGuide() {
  const panel = $('#quest-guide'); panel.replaceChildren();
  const quest = state.selectedQuest;
  if (!quest) { panel.textContent = 'Search above to open a step-by-step quest route.'; return; }
  const heading = document.createElement('h3'); heading.textContent = quest.name; panel.append(heading);
  const meta = document.createElement('p'); meta.className = 'fine';
  meta.textContent = `${quest.level ? `Level ${quest.level}+` : 'Level not listed'}${quest.job ? ` · ${quest.job}` : ''}${quest.giver ? ` · starts with ${quest.giver}` : ''}${quest.turnIn && quest.turnIn !== quest.giver ? ` · hand in to ${quest.turnIn}${quest.turnInGuessed ? ' (best guess from the quest text)' : ''}` : ''}.`;
  panel.append(meta);
  // The quests that have to be done first (the whole chain, earliest first) and what this one unlocks.
  if (state.questCatalogStatus === 'loaded') {
    const { before, after } = questChain(state.quests, quest.name);
    const item = name => { const done = state.questsFinished.includes(name); return `<li class="${done ? 'done' : ''}">${done ? '✓' : '○'} <button type="button" class="link-button" data-qr-open="${esc(name)}">${esc(name)}</button>${done ? '' : ` <button type="button" class="link-button subtle" data-qr-done="${esc(name)}">done it</button>`}</li>`; };
    const box = document.createElement('div'); box.className = 'quest-chain';
    box.innerHTML = (before.length ? `<div class="fine"><strong>Do these first${before.every(name => state.questsFinished.includes(name)) ? ' (all done)' : ''}:</strong></div><ol>${before.map(item).join('')}</ol>` : '<p class="fine"><strong>No earlier quests needed.</strong></p>')
      + (after.length ? `<div class="fine"><strong>Unlocks:</strong> ${after.map(name => `<button type="button" class="link-button" data-qr-open="${esc(name)}">${esc(name)}</button>`).join(', ')}</div>` : '');
    panel.append(box);
  }
  const guideButton = document.createElement('button'); guideButton.type = 'button'; guideButton.className = 'button'; guideButton.textContent = state.guide.quest === quest.name ? 'Guiding this quest ✓' : 'Guide me through this quest';
  guideButton.addEventListener('click', () => { setGuide(quest.name); reveal('#live-title'); }); panel.append(guideButton);
  const link = document.createElement('a'); link.href = questUrl(quest.name); link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'Full community guide ↗'; panel.append(link);
  const add = document.createElement('button'); add.type = 'button'; add.className = 'button secondary quest-add';
  const isActive = state.activeQuests.includes(quest.name);
  add.textContent = isActive ? 'Added to trip ✓' : 'Add quest to trip'; add.disabled = isActive || state.activeQuests.length >= 8;
  add.addEventListener('click', () => {
    if (state.activeQuests.includes(quest.name) || state.activeQuests.length >= 8) return;
    state.activeQuests.push(quest.name); persist(); ensureQuestDetails(quest.name); renderQuestGuide(); renderTripPlanner(); renderDashboard();
    reveal('#trip-title');
  }); panel.append(add);
  if (state.questStepStatus === 'loading') { const p = document.createElement('p'); p.textContent = 'Loading quest steps…'; panel.append(p); return; }
  if (state.questStepStatus === 'error') { const p = document.createElement('p'); p.textContent = state.questStepError; panel.append(p); return; }
  if (!state.questSteps.length) { const p = document.createElement('p'); p.textContent = 'No structured steps are listed for this quest yet. The full community guide may have more detail.'; panel.append(p); return; }
  const done = new Set(state.questDone[quest.name] ?? []);
  const nextStep = state.questSteps.find(step => !done.has(step.number));
  const list = document.createElement('ol'); list.className = 'quest-steps';
  for (const step of state.questSteps) {
    const row = document.createElement('li'); row.className = `quest-step${done.has(step.number) ? ' done' : ''}${nextStep?.number === step.number ? ' next' : ''}`;
    const top = document.createElement('div'); top.className = 'quest-step-top';
    const label = document.createElement('label'); const check = document.createElement('input'); check.type = 'checkbox'; check.checked = done.has(step.number);
    check.setAttribute('aria-label', `Mark step ${step.number} ${step.title} complete`);
    check.addEventListener('change', () => {
      const completed = new Set(state.questDone[quest.name] ?? []);
      if (check.checked) completed.add(step.number); else completed.delete(step.number);
      state.questDone[quest.name] = [...completed]; persist(); renderQuestGuide(); renderTripPlanner(); renderDashboard();
    });
    const title = document.createElement('strong'); title.textContent = `${step.number}. ${step.title}${nextStep?.number === step.number ? ' · NEXT' : ''}`; label.append(check, title); top.append(label); row.append(top);
    const target = document.createElement('p'); target.className = 'fine';
    target.textContent = [step.npc && `NPC: ${step.npc}`, step.monster && `Mob: ${step.monster}`, step.map && `Map: ${step.map}`, step.notes].filter(Boolean).join(' · ');
    if (target.textContent) row.append(target);
    const maps = questStepMaps(travel(), step, state.current);
    if (maps.length) {
      const caption = document.createElement('p'); caption.className = 'fine'; caption.textContent = maps.length > 1 ? 'Choose a mapped location (listed spawns first, then portal distance):' : 'Mapped location:'; row.append(caption);
      const choices = document.createElement('div'); choices.className = 'quest-map-choices';
      for (const option of maps) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'quest-map-option';
        const name = document.createElement('strong'); name.textContent = option.map.name;
        const detail = document.createElement('span'); detail.textContent = `${option.spawns ? `${option.spawns} listed spawns · ` : ''}${option.hops === null ? (state.current ? 'route not confirmed' : 'set your current map') : `${option.hops} portal${option.hops === 1 ? '' : 's'} away`}`;
        button.append(name, detail); button.addEventListener('click', () => routeToMap(option.map.id, step.npc || null)); choices.append(button);
      }
      row.append(choices);
    } else if (/^collect\s+\d+\s+/i.test(step.title)) {
      const itemName = step.title.replace(/^collect\s+\d+\s+/i, '').trim();
      const button = document.createElement('button'); button.type = 'button'; button.className = 'button light'; button.textContent = `Find ${itemName} farming maps`;
      button.addEventListener('click', async () => {
        $('#item-query').value = itemName; await ensureItemCatalog();
        const item = state.items.find(candidate => normalize(candidate.name) === normalize(itemName));
        if (item) selectItem(item); else renderItemResults();
        reveal('#item-title');
      }); row.append(button);
    } else {
      const note = document.createElement('p'); note.className = 'fine'; note.textContent = 'No routeable map is confirmed for this step. Check the full guide or use the map finder.'; row.append(note);
    }
    list.append(row);
  }
  panel.append(list);
}
$('#quest-query').addEventListener('input', () => { renderQuestResults(); if (normalize($('#quest-query').value).length >= 2) loadQuestCatalog(); });

function currentQuestPlan() {
  const tasks = pendingQuestTasks(state.data, state.activeQuests, state.quests, state.questDetails, state.questDone, state.current);
  return { tasks, ...planQuestTrip(state.data, tasks, state.current) };
}

function finishQuestStep(name, number) {
  const completed = new Set(state.questDone[name] ?? []);
  completed.add(number); state.questDone[name] = [...completed]; persist();
  renderQuestGuide(); renderTripPlanner(); renderDashboard();
}

function renderTripPlanner() {
  const active = $('#trip-active'), warnings = $('#trip-warnings'), stops = $('#trip-stops');
  active.replaceChildren(); warnings.replaceChildren(); stops.replaceChildren();
  if (!state.activeQuests.length) {
    active.textContent = 'No active quests yet. Search for a quest below and press “Add quest to trip.”';
    return;
  }
  const plan = currentQuestPlan();
  const summary = document.createElement('p'); summary.className = 'trip-summary'; summary.textContent = `${state.activeQuests.length} active quest${state.activeQuests.length === 1 ? '' : 's'} · ${plan.stops.length} mapped stop${plan.stops.length === 1 ? '' : 's'} suggested`;
  active.append(summary);
  for (const task of plan.tasks) {
    const row = document.createElement('div'); row.className = 'trip-quest';
    const open = document.createElement('button'); open.type = 'button'; open.className = 'trip-quest-open';
    const name = document.createElement('strong'); name.textContent = task.quest.name;
    const detail = document.createElement('span'); detail.textContent = task.status === 'loading' ? 'Loading steps…' : task.status === 'error' ? 'Guide unavailable' : task.step ? task.step.title : 'All listed steps complete';
    open.append(name, detail); open.addEventListener('click', () => { selectQuest(task.quest); reveal('#quest-title'); });
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'trip-remove'; remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove ${task.quest.name} from trip`);
    remove.addEventListener('click', () => { state.activeQuests = state.activeQuests.filter(item => item !== task.quest.name); persist(); renderTripPlanner(); renderDashboard(); renderQuestGuide(); });
    row.append(open, remove); active.append(row);
  }
  for (const task of plan.tasks) {
    const quest = task.quest;
    const record = state.questDetails[quest.name];
    const alerts = [];
    if (quest.level && state.level < quest.level) alerts.push(`Needs level ${quest.level}; your saved level is ${state.level}.`);
    if (quest.job && normalize(quest.job) !== 'any' && state.job !== 'Any' && normalize(quest.job) !== normalize(state.job)) alerts.push(`Wiki lists job ${quest.job}; check eligibility for your ${state.job}.`);
    if (task.status === 'error') alerts.push('Could not load its steps; use the full guide.');
    if (task.status === 'loaded' && !task.step) alerts.push(record?.steps?.length ? 'All listed steps are checked.' : 'No structured steps are listed; use the full guide.');
    if (task.status === 'loaded' && task.step && !task.maps.length) alerts.push(`No mapped route for “${task.step.title}”; use the full guide or item finder.`);
    if (record?.itemsStatus === 'error') alerts.push('Required-item list unavailable; check the full guide.');
    if (!alerts.length && !task.items.length) continue;
    const box = document.createElement('div'); box.className = 'trip-warning';
    const title = document.createElement('strong'); title.textContent = quest.name; box.append(title);
    for (const message of alerts) { const p = document.createElement('p'); p.textContent = message; box.append(p); }
    for (const item of task.items) {
      const label = document.createElement('label'); label.className = 'trip-item-check';
      const input = document.createElement('input'); input.type = 'checkbox'; input.checked = (state.questItemsReady[quest.name] ?? []).includes(item.name);
      input.addEventListener('change', () => {
        const ready = new Set(state.questItemsReady[quest.name] ?? []);
        if (input.checked) ready.add(item.name); else ready.delete(item.name);
        state.questItemsReady[quest.name] = [...ready]; persist(); renderTripPlanner(); renderDashboard();
      });
      const text = document.createElement('span'); text.textContent = `Needed: ${item.quantity} × ${item.name} · tick when in your bag`;
      label.append(input, text); box.append(label);
    }
    warnings.append(box);
  }
  if (warnings.childElementCount) {
    const heading = document.createElement('h3'); heading.textContent = 'Before you travel'; warnings.prepend(heading);
  }
  if (!state.current) { const p = document.createElement('p'); p.className = 'trip-empty'; p.textContent = 'Set your current map to order these stops and get directions.'; stops.append(p); }
  if (!plan.stops.length) { const p = document.createElement('p'); p.className = 'trip-empty'; p.textContent = 'No routeable next steps yet. Check the notices above or choose another quest.'; stops.append(p); return; }
  const heading = document.createElement('h3'); heading.textContent = 'Suggested trip'; stops.append(heading);
  const list = document.createElement('ol'); list.className = 'trip-stops-list';
  for (const [index, stop] of plan.stops.entries()) {
    const row = document.createElement('li'); row.className = 'trip-stop';
    const title = document.createElement('strong'); title.textContent = `${index + 1}. ${stop.map.name}`; row.append(title);
    const info = document.createElement('p'); info.className = 'fine'; info.textContent = index === 0 ? (state.current ? `${stop.hops} portal${stop.hops === 1 ? '' : 's'} from your current map` : 'Set your current map for distance') : `${stop.hops ?? '?'} portal${stop.hops === 1 ? '' : 's'} from previous stop`; row.append(info);
    for (const task of stop.tasks) {
      const taskRow = document.createElement('div'); taskRow.className = 'trip-task';
      const label = document.createElement('span'); label.textContent = `${task.quest.name}: ${task.step.title}`;
      const done = document.createElement('button'); done.type = 'button'; done.textContent = 'Step done'; done.setAttribute('aria-label', `Mark ${task.quest.name} step ${task.step.number} done`);
      done.addEventListener('click', () => finishQuestStep(task.quest.name, task.step.number));
      taskRow.append(label, done); row.append(taskRow);
    }
    const route = document.createElement('button'); route.type = 'button'; route.className = 'button secondary'; route.textContent = 'Route to this stop';
    route.addEventListener('click', () => routeToMap(stop.map.id)); row.append(route); list.append(row);
  }
  stops.append(list);
  if (plan.unroutable.length) { const p = document.createElement('p'); p.className = 'fine'; p.textContent = `${plan.unroutable.length} next step(s) have no confirmed route from the preceding stop; check the map or choose another starting point.`; stops.append(p); }
}

// ---------- Quest suggestions and finished quests ----------
function markFinished(names) {
  const add = [names].flat().filter(name => name && !state.questsFinished.includes(name));
  if (!add.length) return;
  state.questsFinished = [...state.questsFinished, ...add].slice(-2000);
  state.activeQuests = state.activeQuests.filter(name => !add.includes(name));
  state.questsAvailable = state.questsAvailable.filter(name => !add.includes(name));
  persist(); renderQuestRecs(); renderQuestGuide();
}
function renderQuestRecs() {
  const panel = $('#quest-recs'); if (!panel) return;
  if (state.questCatalogStatus === 'idle') loadQuestCatalog();
  if (state.questCatalogStatus !== 'loaded') panel.innerHTML = `<p class="fine">${state.questCatalogStatus === 'error' ? 'The quest list is unavailable right now.' : 'Loading the quest list…'}</p>`;
  else {
    const all = recommendQuests(state.quests, { level: state.level, job: state.job, finished: state.questsFinished, active: state.activeQuests, hidden: state.questsHidden, available: state.questsAvailable, data: travel(), currentMapId: state.current, limit: state.questsAvailable.length ? 40 : 8 });
    // After an Available-tab read, quests the game did not list go into a closed dropdown.
    const recs = state.questsAvailable.length ? all.filter(r => r.inGame) : all, unseen = state.questsAvailable.length ? all.filter(r => !r.inGame) : [];
    const row = r => `<li><span><strong>${esc(r.title)}</strong> <span class="pill">Lv ${r.level}</span>${r.inGame ? ' <span class="pill ingame">in your Available tab</span>' : ''}${r.title !== r.name ? `<small>step: ${esc(r.name)}</small>` : ''}<small>${r.after.length ? `after ${r.after.map(esc).join(', ')} · ` : ''}${r.giver ? `from ${esc(r.giver)}` : ''}${r.map ? ` · ${esc(r.map.name)}${r.hops === 0 ? ' (you are here)' : r.hops ? ` · ${r.hops} map${r.hops === 1 ? '' : 's'} away` : ''}` : ''}</small></span>
      <span class="wm-actions">${r.map ? `<button type="button" class="button secondary wm-go" data-qr-go="${esc(r.map.id)}" data-qr-npc="${esc(r.giver ?? '')}" data-qr-quest="${esc(r.name)}">Go</button>` : ''}<button type="button" class="link-button" data-qr-open="${esc(r.name)}">details</button><button type="button" class="link-button" data-qr-done="${esc(r.name)}">done it</button><button type="button" class="link-button" data-qr-hide="${esc(r.name)}" title="Hide it from suggestions">can’t start it</button></span></li>`;
    panel.innerHTML = (recs.length ? `<ul class="qr-list">${recs.map(row).join('')}</ul>`
      : `<p class="fine">No quests left for level ${state.level}${state.job !== 'Any' ? ` ${esc(state.job)}` : ''} in the game data. Nice work.</p>`)
      + (unseen.length ? `<details class="finished"><summary>Not in your Available tab (${unseen.length})</summary><p class="fine">The game data says you could start these, but they were not read off your Available tab.</p><ul class="qr-list">${unseen.map(row).join('')}</ul></details>` : '');
    if (!state.questsAvailable.length) panel.insertAdjacentHTML('afterbegin', '<p class="fine">From the Classic game data (OSMS Data Explorer). Mark quests you have done (or read your in-game <b>Completed</b> tab) so their follow-ups show; reading the <b>Available</b> tab gives the exact list.</p>');
    if (state.questsAvailable.length) panel.insertAdjacentHTML('afterbegin', `<p class="fine"><strong>${state.questsAvailable.length} read from your in-game Available tab</strong> Missing one? Expand that town in game and read again. <button type="button" class="link-button" data-qr-avail-reset>forget what was read</button></p>`);
  }
  const list = $('#finished-list');
  if (list) list.innerHTML = (state.questsFinished.length ? `<details class="finished"><summary>Finished quests (${state.questsFinished.length})</summary><ul>${[...state.questsFinished].reverse().map(name => `<li>${esc(name)} <button type="button" class="link-button" data-qr-undo="${esc(name)}">undo</button></li>`).join('')}</ul></details>` : '')
    + (state.questsHidden.length ? `<details class="finished"><summary>Hidden quests (${state.questsHidden.length})</summary><ul>${state.questsHidden.map(name => `<li>${esc(name)} <button type="button" class="link-button" data-qr-unhide="${esc(name)}">show again</button></li>`).join('')}</ul></details>` : '');
}
document.addEventListener('click', event => {
  const go = event.target.closest('[data-qr-go]'), open = event.target.closest('[data-qr-open]'), done = event.target.closest('[data-qr-done]'), undo = event.target.closest('[data-qr-undo]'), add = event.target.closest('[data-qr-add]');
  if (go) { if (go.dataset.qrQuest) { setGuide(go.dataset.qrQuest); reveal('#live-title'); } else routeToMap(go.dataset.qrGo, go.dataset.qrNpc || null); }
  if (open) { const quest = state.quests.find(q => q.name === open.dataset.qrOpen); if (quest) { selectQuest(quest); reveal('#quest-title'); } }
  if (done) markFinished(done.dataset.qrDone);
  if (event.target.closest('[data-qr-avail-reset]')) { state.questsAvailable = []; persist(); renderQuestRecs(); $('#available-read').innerHTML = ''; }
  const hide = event.target.closest('[data-qr-hide]'), unhide = event.target.closest('[data-qr-unhide]');
  if (hide) { state.questsHidden = [...new Set([...state.questsHidden, hide.dataset.qrHide])]; persist(); renderQuestRecs(); }
  if (unhide) { state.questsHidden = state.questsHidden.filter(name => name !== unhide.dataset.qrUnhide); persist(); renderQuestRecs(); }
  if (undo) { state.questsFinished = state.questsFinished.filter(name => name !== undo.dataset.qrUndo); persist(); renderQuestRecs(); renderQuestGuide(); }
  if (add) {
    const picked = [...document.querySelectorAll('#completed-read input[type=checkbox]:checked')].map(box => box.value);
    markFinished(picked); $('#completed-read').innerHTML = `<p class="fine">Added ${picked.length} finished quest${picked.length === 1 ? '' : 's'}. Scroll the Completed tab and read again for more.</p>`;
  }
});
document.querySelectorAll('[data-read-quests]').forEach(button => button.addEventListener('click', () => readQuestWindow(button.dataset.readQuests)));
// Names read off the quest window -> state. Available: quests you can start (added to what was
// read before). Completed: quests you have finished (marked straight away when read automatically,
// confirmed by you when read by the button).
// Coarse brightness pattern of a picture: changes when the list scrolls or a town is expanded.
function quickSignature(image) {
  const cells = [], n = 16;
  for (let gy = 0; gy < n; gy++) for (let gx = 0; gx < n; gx++) { const i = (Math.floor((gy + .5) * image.height / n) * image.width + Math.floor((gx + .5) * image.width / n)) * 4; cells.push(image.data[i] + image.data[i + 1] + image.data[i + 2] > 400 ? 1 : 0); }
  return cells.join('');
}

function applyQuestWindow(tab, text, { auto = false } = {}) {
  const available = tab === 'available', out = $(available ? '#available-read' : '#completed-read');
  const seen = questsInText(text, gameQuestNames(state.quests));
  logTest('quest-window', { tab, auto, seen, text: text.slice(0, 3000) });
  if (auto && !seen.length) return 0;
  const found = questsForGameNames(state.quests, seen, { tab, finished: state.questsFinished }), fresh = found.filter(name => !state.questsFinished.includes(name));
  if (available) {
    // Quest Helper lines are quests already in progress, not offered ones.
    const inProgress = new Set((state.hud.quests ?? []).map(q => q.name).filter(Boolean));
    const offered = found.filter(name => !state.questsFinished.includes(name) && !inProgress.has(name) && !state.activeQuests.includes(name));
    const added = offered.filter(name => !state.questsAvailable.includes(name));
    state.questsAvailable = [...new Set([...state.questsAvailable, ...offered])]; persist(); renderQuestRecs();
    if (auto && !added.length) return seen.length;
    // One row per name read off the window (a quest line title like "Winston's Fossil Dig-up", or a
    // single quest), its next quest, and Start: guide there and through it with Live GPS.
    const rows = seen.map(title => ({ title, name: questsForGameNames(state.quests, [title], { tab, finished: state.questsFinished })[0] })).filter(row => row.name && offered.includes(row.name));
    const startRow = ({ title, name }) => {
      const quest = state.quests.find(q => q.name === name), mapId = quest?.giver ? state.data.targets.find(t => t.kind === 'npc' && normalize(t.name) === normalize(quest.giver))?.locations[0]?.mapId : null;
      return `<li><span><strong>${esc(title)}</strong>${normalize(title) !== normalize(name) ? ` <small>first quest: ${esc(name)}</small>` : ''}<small>${quest?.giver ? `from ${esc(quest.giver)}` : ''}${mapId ? ` · ${esc(mapById(mapId)?.name ?? '')}` : ''}${quest?.level ? ` · Lv ${quest.level}` : ''}</small></span>
        <span class="wm-actions"><button type="button" class="button secondary wm-go" data-qr-go="${esc(mapId ?? '')}" data-qr-npc="${esc(quest?.giver ?? '')}" data-qr-quest="${esc(name)}">Start</button></span></li>`;
    };
    out.innerHTML = !rows.length ? '<p class="fine">No quest names found. Open the quest window (Q) on the <b>Available</b> tab with a town expanded, then try again.</p>'
      : `<p class="fine">${auto ? 'Read from your quest window' : 'Read from your Available tab'}. Press <b>Start</b> and Live GPS takes you to the quest giver, then through the quest.</p><ul class="qr-list">${rows.map(startRow).join('')}</ul><p class="fine">Expand another town or scroll the list and read again to add more.</p>`;
    return seen.length;
  }
  if (auto) {
    if (!fresh.length) return seen.length;
    markFinished(fresh);
    out.innerHTML = `<p class="fine">Marked finished from your quest window: ${fresh.map(esc).join(', ')}. (Undo any under Finished quests.)</p>`;
    return seen.length;
  }
  out.innerHTML = !found.length ? '<p class="fine">No quest names found. Open the quest window (Q) on the <b>Completed</b> tab so the names are visible, then try again.</p>'
    : !fresh.length ? `<p class="fine">Found ${found.length} quest${found.length === 1 ? '' : 's'}, all already marked finished. Scroll the list and read again.</p>`
    : `<p class="fine">Found these on screen. Untick any that are wrong:</p><ul class="qr-found">${fresh.map(name => `<li><label><input type="checkbox" value="${esc(name)}" checked> ${esc(name)}</label></li>`).join('')}</ul><button type="button" class="button" data-qr-add>Mark ${fresh.length} finished</button>`;
}

async function readQuestWindow(tab) {
  const available = tab === 'available', out = $(available ? '#available-read' : '#completed-read'), live = state.live;
  if (!live || live.paused) { out.innerHTML = '<p class="fine">Start Live GPS first: the quest window is read from the same shared screen.</p>'; return; }
  if (state.questCatalogStatus !== 'loaded') { await loadQuestCatalog(); if (state.questCatalogStatus !== 'loaded') { out.innerHTML = '<p class="fine">The quest list is unavailable right now.</p>'; return; } }
  const button = $(available ? '#read-available' : '#read-completed'); button.disabled = true; out.innerHTML = '<p class="fine">Reading the quest window… (a few seconds)</p>';
  let grabbed = null, worker = null;
  try {
    grabbed = await live.capture.grab();
    worker = await createOcrWorker();
    // The quest window found on screen: read just its list (and trust its open tab); else the whole frame.
    const win = findQuestWindow(regionImage(grabbed.source, { x: 0, y: 0, w: grabbed.width, h: grabbed.height }));
    const text = win ? await readRegion(worker, grabbed.source, win.list, { scale: 2, ink: inkQuestList }) : await readWholeFrame(worker, grabbed.source, grabbed.width, grabbed.height);
    applyQuestWindow(win?.tab === 'available' || win?.tab === 'completed' ? win.tab : tab, text);
  } catch (error) { out.innerHTML = `<p class="fine">Could not read the screen: ${esc(error?.message ?? String(error))}</p>`; }
  finally { grabbed?.release(); worker?.terminate?.(); button.disabled = false; }
}

function renderDashboard() {
  renderQuestRecs();
  $('#profile-level').value = state.level; $('#profile-job').value = state.job; $('#focus-mode').value = state.focus;
  const panel = $('#next-stop'); panel.replaceChildren();
  const card = document.createElement('div'); card.className = 'next-recommendation'; panel.append(card);
  const show = (label, title, explanation, mapId = null) => {
    const eyebrow = document.createElement('div'); eyebrow.className = 'eyebrow'; eyebrow.textContent = label;
    const heading = document.createElement('h3'); heading.textContent = title;
    const note = document.createElement('p'); note.textContent = explanation;
    card.append(eyebrow, heading, note);
    if (mapId && mapById(mapId) && state.current) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'button'; button.textContent = 'Get directions';
      button.addEventListener('click', () => routeToMap(mapId)); card.append(button);
    } else if (mapId && !state.current) {
      const prompt = document.createElement('small'); prompt.textContent = 'Choose your current map below to get directions.'; card.append(prompt);
    }
  };
  if (state.focus === 'quests') {
    if (!state.activeQuests.length) { show('Start here', 'Add a quest to your trip', 'Search for a quest below, open it, and press “Add quest to trip.”'); return; }
    const plan = currentQuestPlan();
    if (!state.current) { show('Set your location', 'Choose your current map', 'The trip planner needs your starting map to order quest stops and give portal directions.'); return; }
    if (plan.stops.length) { const stop = plan.stops[0]; show('Suggested next stop', stop.map.name, `${stop.tasks.map(task => `${task.quest.name}: ${task.step.title}`).join(' · ')}. ${stop.hops} portal${stop.hops === 1 ? '' : 's'} from you.`, stop.map.id); return; }
    if (plan.tasks.some(task => task.status === 'loading')) { show('Getting ready', 'Loading your quests', 'The community guide is loading the next steps.'); return; }
    if (plan.unmapped.length) { show('Needs your choice', plan.unmapped[0].step.title, 'This step has no confirmed map in the route data. Check the full guide or use the item finder.'); return; }
    if (plan.tasks.some(task => task.status === 'error' || !state.questDetails[task.quest.name]?.steps?.length)) { show('Check the guide', 'Some quest steps are unavailable', 'Open each full community guide before treating the trip as complete.'); return; }
    show('Quest trip', 'All listed steps are done', 'Choose another quest or switch your focus to training, money, or an item.'); return;
  }
  if (state.focus === 'item') {
    if (!state.selectedItem) { show('Item goal', 'Choose an item to farm', 'Use “Find an item to farm” below; your choice will appear here.'); return; }
    if (state.itemDropStatus === 'loading') { show('Item goal', `Checking ${state.selectedItem.name}`, 'Looking for documented drops and mapped spawns.'); return; }
    const spot = state.itemDropStatus === 'loaded' ? rankFarmMaps(travel(), state.itemDrops, state.current).spots[0] : null;
    if (spot) { show('Item goal', spot.map.name, `Possible farming map for ${state.selectedItem.name}. Listed spawns, not verified drop rate or profit.`, spot.map.id); return; }
    show('Item goal', state.selectedItem.name, 'No mapped farming recommendation is confirmed. Check the item finder and community source.'); return;
  }
  const mode = state.focus === 'money' ? 'money' : 'xp';
  const metric = mode === 'money' ? 'mesosPerHour' : 'expPerHour';
  const measured = bestMeasuredSpot(state.sessions.filter(row => mapById(row.mapId)), state.level, metric);
  if (measured) { show(mode === 'money' ? 'Your logged meso result' : 'Your logged EXP result', mapById(measured.mapId).name, `${Math.round(measured[metric]).toLocaleString()} ${mode === 'money' ? 'net mesos' : 'EXP'} per hour in one ${measured.minutes}-minute session near your level. This is your record, not a guaranteed future rate.`, measured.mapId); return; }
  const spot = rankGrindMaps(state.data, state.level, mode)[0];
  if (!spot) { show('Training', 'No suitable map found', 'Try another level or refresh the public map data.'); return; }
  show(mode === 'money' ? 'Money candidate' : 'Training candidate', spot.map.name, mode === 'money' ? `For your saved level ${state.level}. Based on monster spawns, not actual meso profit.` : `For your saved level ${state.level}. Based on listed EXP, HP, and spawns—not measured XP per hour.`, spot.map.id);
}

$('#profile-level').addEventListener('change', () => { state.level = Math.max(1, Math.min(200, Number.parseInt($('#profile-level').value, 10) || 1)); state.guideBandMin = null; persist(); renderDashboard(); renderPartyPlan(); renderRoute(); renderTripPlanner(); renderGuide(); renderJourney(); });
$('#profile-job').addEventListener('change', () => { state.job = $('#profile-job').value; persist(); renderDashboard(); renderTripPlanner(); });
$('#focus-mode').addEventListener('change', () => { state.focus = $('#focus-mode').value; persist(); renderDashboard(); });

function renderGoals() {
  const list = $('#goal-list'); list.replaceChildren();
  if (!state.goals.length) { const empty = document.createElement('p'); empty.className = 'goal-empty'; empty.textContent = 'No saved stops yet.'; list.append(empty); return; }
  for (const goal of state.goals) {
    const row = document.createElement('div'); row.className = `goal-row${goal.done ? ' done' : ''}`;
    const main = document.createElement('button'); main.type = 'button'; main.className = 'goal-main'; main.textContent = goal.title;
    const map = document.createElement('small'); map.textContent = mapById(goal.mapId)?.name ?? 'Map unavailable in this data source'; main.append(map);
    main.addEventListener('click', () => { if (!mapById(goal.mapId)) return; releaseGuide(); state.destination = goal.mapId; state.targetId = null; destinationSelect.value = goal.mapId; persist(); renderRoute(); renderTargets(); reveal('#live-title'); });
    const actions = document.createElement('div'); actions.className = 'goal-actions';
    const done = document.createElement('button'); done.type = 'button'; done.className = 'goal-remove'; done.textContent = goal.done ? '↶' : '✓'; done.title = goal.done ? 'Mark incomplete' : 'Mark complete'; done.setAttribute('aria-label', `${goal.done ? 'Mark incomplete' : 'Mark complete'}: ${goal.title}`);
    done.addEventListener('click', () => { goal.done = !goal.done; persist(); renderGoals(); });
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'goal-remove'; remove.textContent = '×'; remove.title = 'Remove stop'; remove.setAttribute('aria-label', `Remove stop: ${goal.title}`);
    remove.addEventListener('click', () => { state.goals = state.goals.filter(item => item.id !== goal.id); persist(); renderGoals(); });
    actions.append(done, remove); row.append(main, actions); list.append(row);
  }
}

function renderTargets() {
  const results = $('#target-results'), locations = $('#target-locations');
  results.replaceChildren(); locations.replaceChildren();
  const targets = state.data.targets;
  if (!targets.length) { results.textContent = 'Mob and NPC locations are not available in this map data. Try Refresh map data.'; return; }
  const selected = targets.find(target => target.id === state.targetId);
  if (selected) {
    $('#target-query').value = selected.name;
    const heading = document.createElement('p'); heading.className = 'target-heading';
    heading.textContent = `${selected.kind === 'mob' ? 'Mob' : 'NPC'}: ${selected.name}${selected.level !== null ? ` · Level ${selected.level}` : ''} · Choose a map:`;
    locations.append(heading);
    const choices = selected.locations.map(location => {
      const route = state.current ? shortestRoute(travel(), state.current, location.mapId) : null;
      return { ...location, hops: route?.length ?? null, map: mapById(location.mapId) };
    }).filter(location => location.map).sort((a, b) => (a.hops ?? Infinity) - (b.hops ?? Infinity) || a.map.name.localeCompare(b.map.name));
    const list = document.createElement('div'); list.className = 'location-list';
    for (const location of choices) {
      const button = document.createElement('button'); button.type = 'button';
      button.className = `location-option${state.destination === location.mapId ? ' selected' : ''}`;
      const name = document.createElement('strong'); name.textContent = location.map.name;
      const meta = document.createElement('span');
      meta.textContent = `${location.hops === null ? (state.current ? 'Route unknown' : 'Choose your current map') : `${location.hops} portal${location.hops === 1 ? '' : 's'} away`}${location.count !== null ? ` · ${location.count} spawn${location.count === 1 ? '' : 's'}` : ''}`;
      button.append(name, meta);
      button.addEventListener('click', () => { releaseGuide(); state.destination = location.mapId; destinationSelect.value = location.mapId; persist(); renderRoute(); renderTargets(); reveal('#live-title'); });
      list.append(button);
    }
    locations.append(list);
    return;
  }
  const query = normalize($('#target-query').value);
  if (query.length < 2) { results.textContent = `Search ${targets.filter(target => target.kind === 'mob').length} mobs and ${targets.filter(target => target.kind === 'npc').length} NPCs.`; return; }
  const matches = targets.filter(target => normalize(target.name).includes(query)).sort((a, b) => Number(normalize(b.name).startsWith(query)) - Number(normalize(a.name).startsWith(query)) || a.name.localeCompare(b.name)).slice(0, 12);
  if (!matches.length) { results.textContent = 'No matching mob or NPC in the current map data.'; return; }
  for (const target of matches) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'target-option';
    const name = document.createElement('strong'); name.textContent = target.name;
    const meta = document.createElement('span'); meta.textContent = `${target.kind === 'mob' ? 'Mob' : 'NPC'}${target.level !== null ? ` · Lv. ${target.level}` : ''} · ${target.locations.length} map${target.locations.length === 1 ? '' : 's'}`;
    button.append(name, meta);
    button.addEventListener('click', () => { state.targetId = target.id; persist(); renderTargets(); });
    results.append(button);
  }
}
$('#target-query').addEventListener('input', () => { state.targetId = null; renderTargets(); });

let itemCatalogPromise = null;
async function ensureItemCatalog() {
  if (state.itemCatalogStatus === 'loaded') return;
  if (itemCatalogPromise) return itemCatalogPromise;
  state.itemCatalogStatus = 'loading'; renderItemResults();
  itemCatalogPromise = fetchItemCatalog().then(items => {
    state.items = items; state.itemCatalogStatus = 'loaded'; renderItemResults();
  }).catch(error => {
    state.itemCatalogStatus = 'error'; $('#item-results').textContent = `${error.message} Try again later.`;
  }).finally(() => { itemCatalogPromise = null; });
  return itemCatalogPromise;
}

function selectItem(item) {
  state.selectedItem = item; state.itemDrops = []; state.itemDropStatus = 'loading'; state.itemShops = []; state.itemShopStatus = 'loading';
  $('#item-query').value = item.name; $('#item-results').replaceChildren(); persist(); renderItemFarm(); renderGearPlan(); renderDashboard();
  fetchWikiDrops(item.name).then(drops => {
    if (state.selectedItem?.name !== item.name) return;
    state.itemDrops = drops; state.itemDropStatus = 'loaded'; renderItemFarm(); renderGearPlan(); renderDashboard();
  }).catch(error => {
    if (state.selectedItem?.name !== item.name) return;
    state.itemDropStatus = 'error'; state.itemDropError = error.message; renderItemFarm(); renderGearPlan(); renderDashboard();
  });
  fetchWikiShops(item.name).then(shops => {
    if (state.selectedItem?.name !== item.name) return;
    state.itemShops = shops; state.itemShopStatus = 'loaded'; renderGearPlan();
  }).catch(() => {
    if (state.selectedItem?.name !== item.name) return;
    state.itemShopStatus = 'error'; renderGearPlan();
  });
}

function renderItemResults() {
  const results = $('#item-results'); results.replaceChildren();
  if (state.selectedItem) return;
  const query = normalize($('#item-query').value);
  if (query.length < 2) { results.textContent = 'Type at least two letters to find an item.'; return; }
  if (state.itemCatalogStatus === 'loading') { results.textContent = 'Loading item names…'; return; }
  if (state.itemCatalogStatus === 'error') { results.textContent = 'The item catalog is unavailable. Try typing again later.'; return; }
  const matches = state.items.filter(item => normalize(item.name).includes(query))
    .sort((a, b) => Number(normalize(b.name).startsWith(query)) - Number(normalize(a.name).startsWith(query)) || a.name.localeCompare(b.name)).slice(0, 15);
  if (!matches.length) { results.textContent = 'No matching item in the current catalog.'; return; }
  for (const item of matches) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'item-option';
    const name = document.createElement('strong'); name.textContent = item.name;
    const meta = document.createElement('span'); meta.textContent = item.category;
    button.append(name, meta); button.addEventListener('click', () => selectItem(item)); results.append(button);
  }
}

function renderItemFarm() {
  const panel = $('#item-farm'); panel.replaceChildren();
  const item = state.selectedItem;
  if (!item) return;
  const heading = document.createElement('p'); heading.className = 'target-heading'; heading.textContent = item.name;
  const wiki = document.createElement('a'); wiki.href = `https://mapleclassic.wiki/wiki/${encodeURIComponent(item.name.replaceAll(' ', '_'))}`;
  wiki.target = '_blank'; wiki.rel = 'noopener'; wiki.className = 'fine'; wiki.textContent = 'Check the item page ↗';
  panel.append(heading, wiki);
  if (state.itemDropStatus === 'loading') { const p = document.createElement('p'); p.textContent = 'Checking community-recorded drops…'; panel.append(p); return; }
  if (state.itemDropStatus === 'error') { const p = document.createElement('p'); p.className = 'error-text'; p.textContent = `${state.itemDropError} Try another item or check the wiki page.`; panel.append(p); return; }
  if (state.itemDropStatus !== 'loaded') return;
  if (!state.itemDrops.length) { const p = document.createElement('p'); p.textContent = 'No monster drop is documented for this item in the community listing. That does not mean it cannot drop.'; panel.append(p); return; }
  const sources = document.createElement('p'); sources.className = 'fine';
  sources.textContent = `Documented dropping monster${state.itemDrops.length === 1 ? '' : 's'}: ${state.itemDrops.join(', ')}. ${state.itemDrops.length === 1 ? 'One recorded source is not proof of exclusivity.' : ''}`;
  panel.append(sources);
  const { spots, unmapped } = rankFarmMaps(travel(), state.itemDrops, state.current);
  if (unmapped.length) { const note = document.createElement('p'); note.className = 'fine'; note.textContent = `No current spawn map in this feed for: ${unmapped.join(', ')}.`; panel.append(note); }
  if (!spots.length) { const p = document.createElement('p'); p.textContent = 'No mapped farming spot found for those monsters in the current map data.'; panel.append(p); return; }
  const explanation = document.createElement('p'); explanation.className = 'fine';
  explanation.textContent = 'Options are ranked by listed monster spawns and portal distance, not item drop rate or profit. Choose a map:';
  panel.append(explanation);
  const list = document.createElement('div'); list.className = 'item-spots';
  for (const spot of spots) {
    const button = document.createElement('button'); button.type = 'button';
    button.className = `item-option${state.destination === spot.map.id ? ' selected' : ''}`;
    const name = document.createElement('strong'); name.textContent = spot.map.name;
    const meta = document.createElement('span');
    meta.textContent = `${spot.mobs.map(mob => `${mob.name}${mob.count === null ? '' : ` ×${mob.count}`}`).join(' · ')} · ${spot.hops === null ? (state.current ? 'route unknown' : 'choose your starting map') : `${spot.hops} portal${spot.hops === 1 ? '' : 's'} away`}`;
    button.append(name, meta);
    button.addEventListener('click', () => { releaseGuide(); state.destination = spot.map.id; state.targetId = null; destinationSelect.value = spot.map.id; persist(); renderRoute(); renderTargets(); renderItemFarm(); reveal('#live-title'); });
    list.append(button);
  }
  panel.append(list);
}
$('#item-query').addEventListener('input', () => {
  state.selectedItem = null; state.itemDrops = []; state.itemDropStatus = 'idle'; state.itemShops = []; state.itemShopStatus = 'idle';
  persist(); renderItemFarm(); renderGearPlan(); renderItemResults(); renderDashboard();
  if (normalize($('#item-query').value).length >= 2) ensureItemCatalog();
});

function routeGearMap(mapId) {
  if (!mapById(mapId)) return;
  releaseGuide(); state.destination = mapId; state.targetId = null; destinationSelect.value = mapId;
  persist(); renderRoute(); renderTargets(); renderItemFarm(); renderGearPlan();
  reveal('#live-title');
}

function routeButton(label, mapId) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'button light';
  button.textContent = label; button.addEventListener('click', () => routeGearMap(mapId)); return button;
}

function mapForPlace(name) {
  const exact = state.data.maps.find(map => normalize(map.name) === normalize(name) || map.aliases?.some(alias => normalize(alias) === normalize(name)));
  if (exact) return exact;
  const npc = state.data.targets.find(target => target.kind === 'npc' && normalize(target.name) === normalize(name));
  return npc?.locations.map(location => mapById(location.mapId)).find(Boolean) ?? null;
}

function renderGearPlan() {
  const panel = $('#gear-plan'); panel.replaceChildren();
  const item = state.selectedItem;
  if (!item) { panel.textContent = 'Pick an item above to see its options and material list.'; return; }
  const title = document.createElement('h3'); title.textContent = item.name; panel.append(title);
  const recipe = recipeFor(item.name);
  if (recipe) {
    const box = document.createElement('div'); box.className = 'gear-box';
    const head = document.createElement('strong'); head.textContent = `${recipe.profession} recipe · craft level ${recipe.level}${recipe.yield ? ` · makes ${recipe.yield}` : ''}`;
    const intro = document.createElement('p'); intro.textContent = `Listed craft cost: ${recipe.mesos.toLocaleString()} mesos. Ask ${recipe.master}; confirm the recipe and requirements in game.`;
    box.append(head, intro);
    const masterMap = mapForPlace(recipe.master);
    if (masterMap) box.append(routeButton(`Route to ${recipe.master} · ${masterMap.name}`, masterMap.id));
    else { const note = document.createElement('p'); note.className = 'fine'; note.textContent = `No confirmed route to ${recipe.master} in the current map feed.`; box.append(note); }
    const list = document.createElement('div'); list.className = 'gear-materials';
    const owned = state.gearOwned[recipe.item] ?? {};
    for (const material of remainingIngredients(recipe, owned)) {
      const row = document.createElement('div'); row.className = 'gear-material';
      const label = document.createElement('label'); label.textContent = `${material.name} · need ${material.needed}`;
      const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.max = '999999'; input.value = String(material.owned); input.setAttribute('aria-label', `${material.name} in your bag`);
      input.addEventListener('change', () => { const count = Math.min(999999, Math.max(0, Number.parseInt(input.value, 10) || 0)); state.gearOwned[recipe.item] ??= {}; state.gearOwned[recipe.item][material.name] = count; persist(); renderGearPlan(); });
      label.append(input);
      const shortage = document.createElement('span'); shortage.textContent = material.remaining ? `${material.remaining} left` : 'Ready';
      const find = document.createElement('button'); find.type = 'button'; find.className = 'gear-find'; find.textContent = 'Find source';
      find.addEventListener('click', async () => {
        $('#item-query').value = material.name; state.selectedItem = null; renderItemResults(); await ensureItemCatalog();
        const match = state.items.find(candidate => normalize(candidate.name) === normalize(material.name));
        if (match) selectItem(match);
        else { $('#item-query').value = material.name; renderItemResults(); }
        reveal('#item-title');
      });
      row.append(label, shortage, find); list.append(row);
    }
    box.append(list); panel.append(box);
  } else { const note = document.createElement('p'); note.className = 'fine'; note.textContent = 'No recipe in this starter selection. Check the item page for other acquisition methods.'; panel.append(note); }
  const drops = document.createElement('div'); drops.className = 'gear-box';
  const dropTitle = document.createElement('strong'); dropTitle.textContent = 'Monster drops'; drops.append(dropTitle);
  const dropText = document.createElement('p'); dropText.textContent = state.itemDropStatus === 'loading' ? 'Checking documented drops…' : state.itemDropStatus === 'loaded' ? (state.itemDrops.length ? `${state.itemDrops.length} documented monster source(s). See the farming maps above.` : 'No documented monster source found; this does not prove none exists.') : 'Drop listing unavailable.'; drops.append(dropText);
  if (state.itemDropStatus === 'loaded' && state.itemDrops.length) { const top = rankFarmMaps(travel(), state.itemDrops, state.current).spots[0]; if (top) drops.append(routeButton(`Route to a farming map · ${top.map.name}`, top.map.id)); }
  panel.append(drops);
  const shops = document.createElement('div'); shops.className = 'gear-box';
  const shopTitle = document.createElement('strong'); shopTitle.textContent = 'NPC shops'; shops.append(shopTitle);
  const shopText = document.createElement('p'); shopText.textContent = state.itemShopStatus === 'loading' ? 'Checking listed shops…' : state.itemShopStatus === 'error' ? 'Shop listing unavailable; check the item page.' : state.itemShops.length ? `${state.itemShops.length} shop listing(s). Verify stock and price in game.` : 'No listed NPC shop; this does not prove it is never sold.'; shops.append(shopText);
  for (const shop of state.itemShops.slice(0, 8)) {
    const line = document.createElement('div'); line.className = 'gear-shop';
    const link = document.createElement('a'); link.textContent = `${shop.name} · ${shop.price.toLocaleString()} mesos ↗`; link.href = `https://mapleclassic.wiki/wiki/${encodeURIComponent(shop.name.replaceAll(' ', '_'))}`; link.target = '_blank'; link.rel = 'noopener'; line.append(link);
    const map = mapForPlace(shop.name); if (map) line.append(routeButton(`Route to ${map.name}`, map.id));
    shops.append(line);
  }
  panel.append(shops);
}

function renderPartyPlan() {
  const panel = $('#party-plan'); panel.replaceChildren();
  const done = new Set(state.partyDone);
  const heading = document.createElement('h3'); heading.textContent = PARTY_QUEST.name;
  const level = document.createElement('p'); level.className = 'fine'; level.textContent = partyLevelMessage(state.level);
  const progress = document.createElement('p'); progress.className = 'trip-summary'; progress.textContent = `${done.size} of ${PARTY_QUEST.preparation.length + PARTY_QUEST.stages.length} checks complete · manual progress`;
  const map = mapForPlace(PARTY_QUEST.entryNpc) ?? mapForPlace(PARTY_QUEST.entryMap);
  panel.append(heading, level, progress);
  if (map) panel.append(routeButton(`Route to ${PARTY_QUEST.entryNpc} · ${map.name}`, map.id));
  else { const note = document.createElement('p'); note.className = 'fine'; note.textContent = 'Entrance map is not matched in this route feed. Check the full walkthrough.'; panel.append(note); }
  for (const [title, entries, prefix] of [['Before you enter', PARTY_QUEST.preparation, 'prep'], ['Inside the quest', PARTY_QUEST.stages, 'stage']]) {
    const group = document.createElement('div'); group.className = 'party-group';
    const h = document.createElement('h4'); h.textContent = title; group.append(h);
    for (const [id, label, description] of entries) {
      const row = document.createElement('label'); row.className = 'party-check';
      const input = document.createElement('input'); input.type = 'checkbox'; input.checked = done.has(`${prefix}:${id}`);
      input.addEventListener('change', () => { const key = `${prefix}:${id}`; if (input.checked) done.add(key); else done.delete(key); state.partyDone = [...done]; persist(); renderPartyPlan(); });
      const span = document.createElement('span');
      const strong = document.createElement('strong'); strong.textContent = label; span.append(strong);
      if (description) { const small = document.createElement('small'); small.textContent = description; span.append(small); }
      row.append(input, span); group.append(row);
    }
    panel.append(group);
  }
  if (done.size) { const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'button light'; reset.textContent = 'Reset for another run'; reset.addEventListener('click', () => { state.partyDone = []; persist(); renderPartyPlan(); }); panel.append(reset); }
}

function renderSessionList() {
  const panel = $('#session-list'); panel.replaceChildren();
  if (!state.sessions.length) { const empty = document.createElement('p'); empty.className = 'fine'; empty.textContent = 'No sessions saved yet. Record one run to start comparing your own results.'; panel.append(empty); return; }
  const summary = document.createElement('p'); summary.className = 'trip-summary'; summary.textContent = `${state.sessions.length} local session${state.sessions.length === 1 ? '' : 's'} saved`; panel.append(summary);
  for (const row of state.sessions.slice(0, 20)) {
    const card = document.createElement('div'); card.className = 'session-row';
    const name = document.createElement('strong'); name.textContent = mapById(row.mapId)?.name ?? 'Map no longer in route feed';
    const detail = document.createElement('span'); detail.textContent = `Lv ${row.startLevel}→${row.endLevel} · ${row.minutes} min · +${row.expGained.toLocaleString()} EXP (${row.expPerHour.toLocaleString()}/h) · ${row.auto ? 'auto-logged, mesos not tracked' : `${row.mesoChange >= 0 ? '+' : ''}${row.mesoChange.toLocaleString()} mesos (${row.mesosPerHour.toLocaleString()}/h)`}`;
    const actions = document.createElement('div'); actions.className = 'session-actions';
    if (mapById(row.mapId)) actions.append(routeButton('Route here', row.mapId));
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'gear-find'; remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove ${name.textContent} session`);
    remove.addEventListener('click', () => { state.sessions = state.sessions.filter(saved => saved.id !== row.id); persist(); renderSessionList(); renderDashboard(); });
    actions.append(remove); card.append(name, detail, actions); panel.append(card);
  }
}

$('#save-session').addEventListener('click', () => {
  try {
    const fields = ['session-map', 'session-minutes', 'session-start-level', 'session-end-level', 'session-start-exp', 'session-end-exp', 'session-start-mesos', 'session-end-mesos'];
    if (fields.some(id => !$('#' + id).value.trim())) throw new Error('Fill in the map, time, both levels, EXP, and mesos.');
    const row = summarizeSession({ mapId: $('#session-map').value, minutes: $('#session-minutes').value, startLevel: $('#session-start-level').value, endLevel: $('#session-end-level').value, startExp: $('#session-start-exp').value, endExp: $('#session-end-exp').value, startMesos: $('#session-start-mesos').value, endMesos: $('#session-end-mesos').value, expGained: $('#session-exp-gained').value });
    if (!mapById(row.mapId)) throw new Error('Choose a map from the current route feed.');
    state.sessions.unshift({ ...row, id: crypto.randomUUID(), savedAt: Date.now() }); state.sessions = state.sessions.slice(0, 100);
    persist(); renderSessionList(); renderDashboard(); $('#session-status').textContent = 'Session saved in this browser.';
    for (const id of fields.filter(id => id !== 'session-map')) $('#' + id).value = '';
    $('#session-exp-gained').value = '';
  } catch (error) { $('#session-status').textContent = error.message; }
});

function renderGuide() {
  $('#player-level').value = state.level;
  $('#guide-xp').classList.toggle('active', state.guideMode === 'xp');
  $('#guide-money').classList.toggle('active', state.guideMode === 'money');
  $('#guide-explainer').textContent = state.guideMode === 'xp'
    ? 'Ranked from monster level, listed spawn count, EXP and HP. This is an estimate; actual XP depends on your class, gear, and map layout.'
    : 'Ranked from listed spawn counts of monsters at or below your level. Drop rates, item prices, and actual meso profit are not available, so these are places to investigate—not guaranteed money-makers.';
  const results = $('#guide-results'); results.replaceChildren();
  const spots = rankGrindMaps(state.data, state.level, state.guideMode);
  if (!spots.length) { results.textContent = 'No suitable spots in the current data. Try another level or refresh map data.'; return; }
  for (const spot of spots) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'guide-option';
    const name = document.createElement('strong'); name.textContent = spot.map.name;
    const info = document.createElement('span'); info.textContent = spot.mobs.sort((a, b) => b.count - a.count).slice(0, 3).map(mob => `${mob.name} Lv.${mob.level} (${mob.count})`).join(' · ');
    const reason = document.createElement('span'); reason.textContent = state.guideMode === 'money'
      ? `Why shown: ${spot.mobs.reduce((total, mob) => total + mob.count, 0)} listed spawns at or below your level; actual loot value is unknown.`
      : `Why shown: ${spot.mobs.reduce((total, mob) => total + mob.count, 0)} listed spawns near your level, weighted by recorded EXP and HP.`;
    button.append(name, info, reason);
    button.addEventListener('click', () => { releaseGuide(); state.destination = spot.map.id; state.targetId = null; destinationSelect.value = spot.map.id; persist(); renderRoute(); renderTargets(); reveal('#live-title'); });
    results.append(button);
  }
}
function routeToMap(id, npc = null) {
  if (!mapById(id)) return;
  releaseGuide(); state.destination = id; state.targetId = null; state.goalNpc = npc; state.startingQuest = null; saveLive(); destinationSelect.value = id;
  persist(); renderRoute(); renderTargets(); renderItemFarm(); renderAtlas();
  reveal('#live-title');
}

function renderJourney() {
  const bands = $('#journey-bands'), detail = $('#journey-detail');
  bands.replaceChildren(); detail.replaceChildren();
  const active = CLASSIC_BANDS.find(band => band.min === state.guideBandMin) ?? guideForLevel(state.level);
  for (const band of CLASSIC_BANDS) {
    const button = document.createElement('button'); button.type = 'button';
    button.className = `journey-band${active === band ? ' active' : ''}`;
    button.textContent = `${band.min}–${band.max}`;
    button.setAttribute('aria-pressed', String(active === band));
    button.addEventListener('click', () => { state.guideBandMin = band.min; renderJourney(); });
    bands.append(button);
  }
  if (!active) {
    const heading = document.createElement('h3'); heading.textContent = 'Beyond the Victoria Island starter route';
    const note = document.createElement('p'); note.textContent = 'The community guide used here covers roughly levels 10–55. For your level, use the live Training spots above and check current Classic World guides before traveling to new regions.';
    detail.append(heading, note); return;
  }
  const heading = document.createElement('h3'); heading.textContent = `Lv. ${active.min}–${active.max} · ${active.title}`;
  const why = document.createElement('p'); why.textContent = active.why;
  const tip = document.createElement('p'); tip.className = 'journey-tip'; tip.textContent = active.tip;
  detail.append(heading, why, tip);
  const list = document.createElement('div'); list.className = 'journey-options';
  for (const [index, choice] of resolveGuideMaps(state.data, active).entries()) {
    const row = document.createElement('div'); row.className = 'journey-option';
    const label = document.createElement('div');
    const name = document.createElement('strong'); name.textContent = choice.name;
    const meta = document.createElement('span');
    const route = choice.map && state.current ? shortestRoute(travel(), state.current, choice.map.id) : null;
    meta.textContent = `${index === 0 ? 'Suggested first' : 'Alternative'} · ${choice.map ? (route ? `${route.length} portal${route.length === 1 ? '' : 's'} from you` : state.current ? 'route not confirmed' : 'set your current map for distance') : 'not in this map feed'}`;
    label.append(name, meta); row.append(label);
    if (choice.map) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'button secondary'; button.textContent = 'Route here';
      button.addEventListener('click', () => routeToMap(choice.map.id)); row.append(button);
    }
    list.append(row);
  }
  detail.append(list);
}

const atlasPositions = [[360, 58], [558, 102], [638, 210], [558, 318], [360, 362], [162, 318], [82, 210], [162, 102]];
function showAtlasMap(id, remember = true) {
  if (!mapById(id)) return;
  if (remember && state.atlasCenter && state.atlasCenter !== id) state.atlasHistory.push(state.atlasCenter);
  state.atlasCenter = id; $('#atlas-query').value = ''; $('#atlas-results').replaceChildren(); renderAtlas();
}

function renderAtlasSearch() {
  const results = $('#atlas-results'); results.replaceChildren();
  const query = normalize($('#atlas-query').value);
  if (query.length < 2) return;
  const matches = state.data.maps.filter(map => normalize(map.name).includes(query) || normalize(map.area).includes(query))
    .sort((a, b) => Number(normalize(b.name).startsWith(query)) - Number(normalize(a.name).startsWith(query)) || a.name.localeCompare(b.name)).slice(0, 10);
  if (!matches.length) { results.textContent = 'No map found in the current feed.'; return; }
  for (const map of matches) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'atlas-search-option';
    const name = document.createElement('strong'); name.textContent = map.name;
    const area = document.createElement('span'); area.textContent = map.area;
    button.append(name, area); button.addEventListener('click', () => showAtlasMap(map.id)); results.append(button);
  }
}

function renderAtlas() {
  const canvas = $('#atlas-canvas'), detail = $('#atlas-detail');
  canvas.replaceChildren(); detail.replaceChildren();
  if (!mapById(state.atlasCenter)) state.atlasCenter = state.current && mapById(state.current) ? state.current : state.data.maps.find(map => normalize(map.name) === 'henesys')?.id ?? state.data.maps[0]?.id;
  const center = mapById(state.atlasCenter);
  $('#atlas-back').disabled = !state.atlasHistory.length;
  $('#atlas-current').disabled = !state.current;
  if (!center) { detail.textContent = 'No maps are available yet. Refresh map data.'; return; }
  const { neighbors, hiddenCount } = atlasNeighbors(state.data, center.id, 8);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 720 420'); svg.setAttribute('aria-hidden', 'true'); svg.classList.add('atlas-lines');
  const positions = neighbors.map((_, index) => atlasPositions[Math.round(index * 8 / neighbors.length) % 8]);
  for (const [index, neighbor] of neighbors.entries()) {
    const [x, y] = positions[index];
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '360'); line.setAttribute('y1', '210'); line.setAttribute('x2', String(x)); line.setAttribute('y2', String(y));
    line.setAttribute('class', neighbor.outgoing ? 'atlas-link outgoing' : 'atlas-link incoming'); svg.append(line);
  }
  canvas.append(svg);
  const makeNode = (map, x, y, kind, subtitle, onClick) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = `atlas-node ${kind}`;
    button.style.left = `${x / 720 * 100}%`; button.style.top = `${y / 420 * 100}%`;
    const name = document.createElement('strong'); name.textContent = map.name;
    const meta = document.createElement('span'); meta.textContent = subtitle;
    button.append(name, meta); button.title = `${map.name} · ${subtitle}`;
    button.addEventListener('click', onClick); canvas.append(button);
  };
  for (const [index, neighbor] of neighbors.entries()) {
    const [x, y] = positions[index];
    makeNode(neighbor.map, x, y, neighbor.outgoing ? 'reachable' : 'incoming', neighbor.outgoing && neighbor.incoming ? 'Both ways' : neighbor.outgoing ? 'Exit from here' : 'Arrives here only', () => showAtlasMap(neighbor.map.id));
  }
  makeNode(center, 360, 210, 'center', center.area || 'Selected map', () => {});
  const heading = document.createElement('h3'); heading.textContent = center.name;
  const meta = document.createElement('p'); meta.className = 'fine';
  meta.textContent = `${center.area || 'Region not listed'} · ${neighbors.filter(n => n.outgoing).length} shown exit${neighbors.filter(n => n.outgoing).length === 1 ? '' : 's'}${hiddenCount ? ` · ${hiddenCount} more connected map${hiddenCount === 1 ? '' : 's'} not shown` : ''}. Click a node to explore.`;
  const actions = document.createElement('div'); actions.className = 'action-row';
  const start = document.createElement('button'); start.type = 'button'; start.className = 'button light'; start.textContent = 'I’m here'; start.addEventListener('click', () => setCurrent(center.id));
  const route = document.createElement('button'); route.type = 'button'; route.className = 'button'; route.textContent = 'Route here'; route.addEventListener('click', () => routeToMap(center.id));
  actions.append(start, route); detail.append(heading, meta, actions);
}
$('#atlas-query').addEventListener('input', renderAtlasSearch);
$('#atlas-back').addEventListener('click', () => { const previous = state.atlasHistory.pop(); if (previous) showAtlasMap(previous, false); });
$('#atlas-current').addEventListener('click', () => { if (state.current) showAtlasMap(state.current); });

$('#player-level').addEventListener('change', () => { state.level = Math.max(1, Math.min(200, Number.parseInt($('#player-level').value, 10) || 1)); state.guideBandMin = null; persist(); renderGuide(); renderJourney(); renderDashboard(); renderPartyPlan(); renderRoute(); renderTripPlanner(); });
$('#guide-xp').addEventListener('click', () => { state.guideMode = 'xp'; persist(); renderGuide(); });
$('#guide-money').addEventListener('click', () => { state.guideMode = 'money'; persist(); renderGuide(); });

function showCandidates(matches, allowAutomatic = true) {
  const target = $('#candidates'); target.replaceChildren();
  if (!matches.length) { status('Could not read a map name in the selected area. Set the minimap area again or select your map.', true); return; }
  const best = matches[0], second = matches[1];
  if (allowAutomatic && best.score >= .95 && (!second || best.score - second.score > .14)) { setCurrent(best.map.id, true); return; }
  status('I found possible maps. Please confirm the right one.');
  for (const candidate of matches) {
    const button = document.createElement('button'); button.className = 'candidate'; button.type = 'button';
    const title = document.createElement('strong'); title.textContent = candidate.map.name;
    const detail = document.createElement('span'); detail.textContent = `${Math.round(candidate.score * 100)}% text match`;
    button.append(title, detail); button.addEventListener('click', () => setCurrent(candidate.map.id, true)); target.append(button);
  }
}

let pendingFrame = null;
let calibrateResolve = null;
let draftCrop = null;
function showCalibration(frame, reuseCrop = false) {
  pendingFrame = frame;
  $('#snapshot').src = frame.toDataURL('image/jpeg', .8);
  $('#calibration').classList.remove('hidden');
  draftCrop = reuseCrop ? state.crop : null;
  $('#crop-box').classList.toggle('hidden', !draftCrop);
  $('#use-area').disabled = !draftCrop;
  $('#crop-hint').textContent = 'Drag a tight rectangle over the map-name text.';
  if (draftCrop) updateCropBox(draftCrop);
  return new Promise(resolve => { calibrateResolve = resolve; });
}
function hideCalibration(result) {
  $('#calibration').classList.add('hidden'); $('#snapshot').removeAttribute('src');
  pendingFrame = null; draftCrop = null; calibrateResolve?.(result); calibrateResolve = null;
}
function updateCropBox(crop) {
  draftCrop = crop;
  $('#crop-box').classList.remove('hidden'); $('#use-area').disabled = false;
  Object.assign($('#crop-box').style, { left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` });
}
let dragStart = null;
$('#snapshot').addEventListener('pointerdown', event => {
  const rect = event.currentTarget.getBoundingClientRect();
  dragStart = { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  event.currentTarget.setPointerCapture(event.pointerId);
});
$('#snapshot').addEventListener('pointermove', event => {
  if (!dragStart) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
  updateCropBox({ x: Math.min(x, dragStart.x), y: Math.min(y, dragStart.y), w: Math.max(.01, Math.abs(x - dragStart.x)), h: Math.max(.01, Math.abs(y - dragStart.y)) });
});
$('#snapshot').addEventListener('pointerup', () => { dragStart = null; });
$('#use-area').addEventListener('click', () => { if (!draftCrop || draftCrop.w < .02 || draftCrop.h < .02) { $('#crop-hint').textContent = 'Select a larger area around the map name.'; return; } state.crop = draftCrop; persist(); hideCalibration(state.crop); });
$('#cancel-area').addEventListener('click', () => hideCalibration(null));

async function captureFrame() {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Screen sharing is unavailable on this page. Use a screenshot file.');
  const policy = document.permissionsPolicy ?? document.featurePolicy;
  if (policy?.allowsFeature?.('display-capture') === false) throw new Error('The page’s display-capture policy blocks screen sharing. Use a screenshot file.');
  let stream;
  try { stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }); }
  catch (error) { throw captureFailure('requesting permission', error); }
  try {
    const track = stream?.getVideoTracks?.()[0];
    if (track && typeof ImageCapture !== 'undefined') {
      try {
        const bitmap = await new ImageCapture(track).grabFrame();
        const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
        canvas.getContext('2d').drawImage(bitmap, 0, 0);
        bitmap.close?.();
        if (canvas.width && canvas.height) return canvas;
      } catch { /* Use the video-element fallback below. */ }
    }
    try {
      const video = document.createElement('video'); video.srcObject = stream; video.muted = true; video.playsInline = true;
      await video.play();
      if (!video.videoWidth) await new Promise((resolve, reject) => { video.addEventListener('loadeddata', resolve, { once: true }); setTimeout(() => reject(new Error('No video frame appeared.')), 6000); });
      await new Promise(resolve => setTimeout(resolve, 150));
      if (!video.videoWidth || !video.videoHeight) throw new Error('No video frame appeared.');
      const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      video.srcObject = null;
      return canvas;
    } catch (error) { throw captureFailure('reading the selected window', error); }
  } finally { stream?.getTracks?.().forEach(track => track.stop()); }
}

function captureFailure(stage, error) {
  const kind = typeof error?.name === 'string' && error.name ? error.name : 'no error name';
  const detail = typeof error?.message === 'string' && error.message ? `: ${error.message}` : '';
  const failure = new Error(`Screen sharing failed while ${stage} (${kind}${detail}). Use a screenshot file if it keeps happening.`);
  failure.name = error?.name || 'CaptureError';
  return failure;
}

async function frameFromFile(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPEG, or WebP screenshot.');
  if (file.size > 20_000_000) throw new Error('Choose a screenshot smaller than 20 MB.');
  // createImageBitmap decodes reliably; HTMLImageElement.decode() can stall in some embedded browsers.
  const bitmap = await createImageBitmap(file);
  try {
    const frame = document.createElement('canvas');
    frame.width = bitmap.width; frame.height = bitmap.height;
    if (!frame.width || !frame.height) throw new Error('The screenshot is empty.');
    frame.getContext('2d').drawImage(bitmap, 0, 0);
    return frame;
  } finally { bitmap.close(); }
}

function cropForOCR(frame, crop, nativeSize = false) {
  const sw = Math.max(1, Math.floor(frame.width * crop.w)), sh = Math.max(1, Math.floor(frame.height * crop.h));
  const output = document.createElement('canvas');
  const scale = nativeSize ? 1 : Math.min(4, Math.max(2, 1000 / sw));
  output.width = Math.round(sw * scale); output.height = Math.round(sh * scale);
  const context = output.getContext('2d', { willReadFrequently: true });
  context.imageSmoothingEnabled = false;
  context.drawImage(frame, Math.floor(frame.width * crop.x), Math.floor(frame.height * crop.y), sw, sh, 0, 0, output.width, output.height);
  return output;
}

function isBlankFrame(frame) {
  const sample = document.createElement('canvas'); sample.width = 48; sample.height = 36;
  const context = sample.getContext('2d', { willReadFrequently: true });
  context.drawImage(frame, 0, 0, sample.width, sample.height);
  const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
  let total = 0, squared = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const light = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
    total += light; squared += light * light;
  }
  const count = pixels.length / 4, mean = total / count;
  sample.width = sample.height = 0;
  return mean < 30 && squared / count - mean * mean < 30;
}

function titleBand(frame, crop = null) {
  if (crop) {
    const insetX = crop.w * .12, insetY = crop.h * .075;
    return { x: crop.x + insetX, y: crop.y + insetY, w: crop.w * .84, h: crop.h * .39 };
  }
  const x = Math.min(40, frame.width * .016) / frame.width;
  const y = Math.min(20, frame.height * .014) / frame.height;
  const w = Math.min(400, Math.max(260, frame.width * .14)) / frame.width;
  const h = Math.min(110, Math.max(90, frame.height * .07)) / frame.height;
  return [{ x, y, w, h }, { x: 1 - x - w, y, w, h }];
}

async function scanArea(worker, frame, crop, singleLine = false, nativeSize = false) {
  const area = cropForOCR(frame, crop, nativeSize);
  try {
    $('#scan-crop').src = area.toDataURL('image/png');
    $('#scan-details').classList.remove('hidden');
    await worker.setParameters({ tessedit_pageseg_mode: singleLine ? PSM.SINGLE_LINE : PSM.SPARSE_TEXT });
    const result = await worker.recognize(area);
    const readText = result.data.text.trim();
    $('#scan-text').textContent = readText || '(nothing readable)';
    return matchMap(readText, state.data.maps, state.current);
  } finally { area.width = area.height = 0; }
}

async function ocrWorker() {
  if (!state.worker) {
    const base = new URL('ocr/', document.baseURI).href;
    state.worker = createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: `${base}worker.min.js`, corePath: `${base}core`, langPath: `${base}lang`, workerBlobURL: false,
      logger: progress => { if (progress.status && state.busy) status(`Reading map text locally… ${progress.status}`); }
    }).catch(error => { state.worker = null; throw new Error(`Map-text reader could not start${error?.message ? `: ${error.message}` : '. Please refresh and try again.'}`); });
  }
  return state.worker;
}

function screenError(error) {
  if (error?.name === 'NotAllowedError') return `${error.message || 'Screen selection was cancelled or blocked.'} Nothing was captured.`;
  if (error?.name === 'NotSupportedError' || error?.name === 'SecurityError') return error.message || 'Screen sharing was blocked. Use a screenshot file.';
  const detail = typeof error?.message === 'string' && error.message.trim() ? error.message.trim() : '';
  return detail || 'Screen check failed without an error description. Use a screenshot file.';
}

async function checkScreen(recalibrate = false, file = null) {
  if (state.busy) return;
  state.busy = true; $('#detect-map').disabled = true; $('#upload-screen').disabled = true; $('#candidates').replaceChildren();
  $('#scan-details').classList.add('hidden'); $('#scan-details').open = false; $('#scan-crop').removeAttribute('src'); $('#scan-text').textContent = '';
  let frame = null;
  try {
    status(file ? 'Opening your screenshot on this device…' : 'Choose the MapleStory window in your browser’s screen picker…');
    frame = file ? await frameFromFile(file) : await captureFrame();
    if (isBlankFrame(frame)) throw new Error('The selected window produced a blank frame. Try windowed or borderless game mode, or use a screenshot file.');
    const worker = await ocrWorker();
    if (!recalibrate) {
      status('Looking for the mini map…');
      const found = locateMinimap(frame, frame.width, frame.height);
      if (found) {
        const text = await readTitle(worker, frame, found, $('#scan-crop'));
        $('#scan-details').classList.remove('hidden'); $('#scan-text').textContent = text || '(nothing readable)';
        const matches = matchMap(text, state.data.maps, state.current);
        if (confident(matches)) { const id = preferredMatch(matches); setCurrent(id, true); updatePosition(found, id); return; }
        if (matches.length) { showCandidates(matches); return; }
      }
      const regions = [
        ...titleBand(frame).map(crop => ({ crop, nativeSize: true })),
        ...(state.crop && state.crop.h * frame.height >= 130 ? [{ crop: titleBand(frame, state.crop), nativeSize: true }] : []),
        { crop: { x: 0, y: 0, w: .52, h: .38 } },
        { crop: { x: .48, y: 0, w: .52, h: .38 } },
        ...(state.crop ? [{ crop: state.crop, singleLine: true }] : [])
      ];
      for (const { crop, singleLine = false, nativeSize = false } of regions) {
        status('Looking for the minimap title in this frame…');
        const matches = await scanArea(worker, frame, crop, singleLine, nativeSize);
        if (matches.length) { showCandidates(matches); $('#reset-area').classList.remove('hidden'); return; }
      }
    }
    status('The automatic scan missed the title. Drag a tight box around the map name on this same frame.');
    const crop = await showCalibration(frame);
    if (!crop) { status('Screen check cancelled.'); return; }
    status('Reading the title you selected…');
    let matches = await scanArea(worker, frame, crop.h * frame.height >= 130 ? titleBand(frame, crop) : crop, false, true);
    if (!matches.length) matches = await scanArea(worker, frame, crop, true);
    if (!matches.length) matches = await scanArea(worker, frame, crop, false);
    if (matches.length) showCandidates(matches);
    else { status('Still no map match. Open “See what the map reader saw.” If the title is visible there, send me a screenshot of that preview so I can tune the reader.', true); $('#scan-details').open = true; }
    $('#reset-area').classList.remove('hidden');
  } catch (error) {
    status(screenError(error), true);
  } finally { if (frame) frame.width = frame.height = 0; state.busy = false; $('#detect-map').disabled = false; $('#upload-screen').disabled = false; }
}

$('#detect-map').addEventListener('click', () => checkScreen());
$('#reset-area').addEventListener('click', () => checkScreen(true));
$('#upload-screen').addEventListener('click', () => $('#screen-file').click());
$('#screen-file').addEventListener('change', event => { const file = event.target.files?.[0]; if (file) checkScreen(false, file); event.target.value = ''; });
$('#plan-route').addEventListener('click', () => { state.current = currentSelect.value || null; releaseGuide(); state.destination = destinationSelect.value || null; if (state.current) state.atlasCenter = state.current; persist(); renderRoute(); renderJourney(); renderAtlas(); renderTripPlanner(); renderDashboard(); });
currentSelect.addEventListener('change', () => { state.current = currentSelect.value || null; if (state.current) state.atlasCenter = state.current; $('#start-query').value = state.current ? mapById(state.current).name : ''; $('#start-results').replaceChildren(); persist(); renderRoute(); renderTargets(); renderItemFarm(); renderJourney(); renderAtlas(); renderQuestGuide(); renderTripPlanner(); renderDashboard(); });
destinationSelect.addEventListener('change', () => { releaseGuide(); state.destination = destinationSelect.value || null; state.targetId = null; state.goalNpc = null; state.startingQuest = null; saveLive(); persist(); renderRoute(); renderTargets(); });

// ---------- Live GPS ----------
// Same-named maps (two "Mushroom Town"s) are not competitors; the next differently named map is.
const confident = matches => {
  if (!matches[0] || matches[0].score < .9) return false;
  const rival = matches.find(m => normalize(m.map.name) !== normalize(matches[0].map.name));
  return !rival || matches[0].score - rival.score > .03;
};
// Among same-named top matches prefer the destination, then a map on the route, then where we were.
function preferredMatch(matches) {
  const twins = matches.filter(m => normalize(m.map.name) === normalize(matches[0].map.name) && m.score === matches[0].score).map(m => m.map.id);
  return [state.destination, ...(state.route ?? []).map(step => step.to), state.current].find(id => twins.includes(id)) ?? twins[0];
}

function liveState(text, warn = false) {
  state.liveText = text; state.liveWarn = warn;
  $('#live-state').textContent = text; $('#live-state').classList.toggle('warn', warn);
  const pip = state.pipDoc?.getElementById('pip-status');
  if (pip) { pip.textContent = text; pip.classList.toggle('warn', warn); }
}

function setLiveUi() {
  const paused = Boolean(state.live?.paused);
  $('#live-start').classList.toggle('hidden', Boolean(state.live) && !paused);
  $('#live-start').textContent = paused ? 'Reconnect live GPS' : 'Start live GPS';
  $('#live-start').classList.toggle('pulse', paused);
  $('#live-stop').classList.toggle('hidden', !state.live);
  $('#live-voice').checked = state.voice;
}

function liveModel() {
  if (!state.destination) return { title: 'Choose a destination', body: 'Tap “Choose destination” to pick a map, quest, NPC, monster or training spot.', note: state.live && !livePosition() ? state.positionNote : null };
  if (!state.current) return { title: 'Where are you?', body: state.live ? 'Looking for the mini map title…' : 'Start Live GPS, or pick your current map under “Plan your route”.' };
  const route = state.route;
  if (route === null) return { map: mapById(state.current)?.name, title: 'No walking route', body: 'See Directions for the nearest map you can walk to.' };
  if (!route?.length) {
    const goal = goalSpot(), position = livePosition();
    if (goal && goal.mapId === state.current) {
      const hint = position ? guidance(position, goal) : null;
      if (!hint?.near) return { map: mapById(state.current)?.name, title: `Go to ${goal.name}${state.startingQuest ? ` to start ${state.startingQuest}` : ''}`, body: position ? null : `${goal.name} is marked on the map below.`, hint, kind: 'npc', npc: goal.name, note: !hint ? state.positionNote : null };
      return { arrived: true, details: arrivalModel(), npcHere: goal.name, starting: state.startingQuest };
    }
    return { arrived: true, details: arrivalModel() };
  }
  const [next, after] = route, words = describeStep(state.data, next, after, { level: state.level });
  // While live, a position not refreshed for 5 s is stale (mini map collapsed, dot hidden…).
  const position = livePosition();
  const hint = position && Number.isFinite(Number(next.x)) ? guidance(position, { x: Number(next.x), y: Number(next.y) }) : null;
  return { stale: !state.live, map: mapById(state.current)?.name, remaining: route.length, title: words.headline, body: words.how, arrival: words.arrival, hint, kind: next.kind, note: !hint && state.live ? state.positionNote : null };
}

function characterOffer() {
  const name = state.hud.characterName;
  if (!name || (state.hud.characterSeen ?? 0) < 2 || state.characterDismissed === name) return '';
  const current = character();
  if (current && current.toLowerCase() === name.toLowerCase()) return '';
  if (!current && !characters().length && state.characterDismissed !== '*') return `<div class="objective offer">Playing as <strong>${esc(name)}</strong>? <button type="button" class="link-button" data-character-name="${esc(name)}">Save progress as ${esc(name)}</button> · <button type="button" class="link-button" data-character-dismiss="${esc(name)}">not now</button></div>`;
  return `<div class="objective offer">You are playing <strong>${esc(name)}</strong>, but <strong>${esc(current || 'Main character')}</strong> is selected. <button type="button" class="link-button" data-character-name="${esc(name)}">Switch to ${esc(name)}</button> · <button type="button" class="link-button" data-character-dismiss="${esc(name)}">keep</button></div>`;
}

function hudHtml() {
  if (!state.live) return objectiveHtml();
  const parts = [], status = state.hud.status, fractions = state.hud.fractions;
  parts.push(characterOffer(), objectiveHtml());
  if (state.hud.turnIn && state.hud.turnIn.quest !== state.guide.quest) parts.push(`<div class="hud-quest">Quest ready: ${esc(state.hud.turnIn.quest)}${state.hud.turnIn.npc ? ` → ${esc(state.hud.turnIn.npc)}` : ''}${state.hud.turnIn.mapId && state.hud.turnIn.mapId !== state.destination ? ` <button type="button" class="link-button" data-route="${esc(state.hud.turnIn.mapId)}" data-route-npc="${esc(state.hud.turnIn.npc ?? '')}">take me there</button>` : ''}</div>`);
  const bits = [];
  const tracker = state.hud.tracker;
  if (tracker?.last) { const s = expSummary(tracker); bits.push(`EXP ${s.percent.toFixed(2)}%`); if (s.minutes >= 2) bits.push(`${Math.round(s.perHour).toLocaleString()} EXP/h`); }
  if (bits.length) parts.push(`<div class="hud-strip">${bits.map(esc).join(' · ')}</div>`);
  return parts.join('');
}

const POSITION_NOTES = {
  collapsed: 'No mini map on this map (or it is collapsed), so only the map name is read here.',
  'few-portals': 'Can’t place you on this map right now. Go through any portal and you’ll be picked up at the other side.',
  'no-dot': 'Your dot is not visible on the mini map.',
  covered: 'A game window (inventory, stats…) is covering the mini map. Move it off the mini map and tracking picks up again.'
};

// The NPC you were sent to on the destination map: a quest step's NPC, the NPC picked under
// "Find a mob or NPC", or the hand-in NPC while guiding a quest. Placed from OSMS NPC positions.
function goalSpot() {
  const map = mapById(state.destination);
  if (!map?.npcs?.length) return null;
  const objective = state.guide.quest ? currentObjective() : null;
  const target = state.data.targets.find(t => t.id === state.targetId && t.kind === 'npc');
  // Any quest reason to be on this map points at its NPC, not just the map: the NPC you picked, the
  // guided quest's hand-in, a quest ready to hand in, the quest you are starting, and the givers,
  // hand-ins and step NPCs of your active and selected quests.
  const catalog = name => state.quests.find(q => q.name === name);
  const ready = (state.hud.quests ?? []).filter(q => q.complete && q.name).map(q => catalog(q.name)).filter(Boolean);
  const questNpcs = name => { const q = catalog(name); return q ? [q.turnIn, q.giver, ...(state.questDetails[name]?.steps ?? []).map(step => step.npc)] : []; };
  const candidates = [
    state.goalNpc, target?.name, objective?.npc, state.hud.turnIn?.npc,
    ...ready.flatMap(q => [q.turnIn, q.giver]),
    state.startingQuest && catalog(state.startingQuest)?.giver,
    ...(state.guide.quest ? questNpcs(state.guide.quest) : []),
    ...state.activeQuests.flatMap(questNpcs),
    ...(state.selectedQuest ? [...state.questSteps.map(step => step.npc), state.selectedQuest.turnIn, state.selectedQuest.giver] : [])
  ];
  const name = candidates.find(n => n && map.npcs.some(npc => normalize(npc.name) === normalize(n)));
  const npc = name && map.npcs.find(n => normalize(n.name) === normalize(name));
  return npc && Number.isFinite(Number(npc.x)) ? { name: npc.name, x: Number(npc.x), y: Number(npc.y), mapId: map.id } : null;
}

function nearText(kind, npc = null) {
  if (kind === 'npc') return `You are at ${npc ?? 'the NPC'}. Double-click them to talk.`;
  return kind === 'walk' ? 'You are at the exit. Walk into it.' : kind === 'taxi' ? 'You are at the taxi stand. Talk to the driver.' : 'You are at the portal. Press ↑.';
}

function liveHtml(model) {
  if (model.arrived && model.details) return `${model.npcHere ? `<div class="live-hint near"><span class="live-arrow" aria-hidden="true">●</span><span>${esc(nearText('npc', model.npcHere))}</span></div>` : ''}${model.starting ? `<div class="objective offer">Accept <strong>${esc(model.starting)}</strong>. Once it shows in your Quest Helper, the GPS moves on to the next step by itself, or <button type="button" class="link-button" data-guide="${esc(model.starting)}">guide me now</button>.<br>No quest offered? <button type="button" class="link-button" data-start-none="done">I already did it</button> · <button type="button" class="link-button" data-start-none="hide">not in my game, hide it</button></div>` : ''}${arrivalHtml(model.details)}`;
  const hint = model.hint, arrow = !hint ? '' : hint.near ? '●' : hint.side === 'left' ? '←' : hint.side === 'right' ? '→' : hint.vertical === 'up' ? '↑' : '↓';
  return `<div class="live-where">${model.map ? `${model.stale ? 'Last known: ' : 'On '}<strong>${esc(model.map)}</strong>${model.remaining ? ` · ${model.remaining} map${model.remaining === 1 ? '' : 's'} to go` : ''}${model.stale ? ' · <button type="button" class="link-button" data-share-now>share screen to update</button>' : ''}` : '&nbsp;'}</div>
    <div class="live-headline${model.arrived ? ' arrived' : ''}">${esc(model.title)}</div>
    ${hint ? `<div class="live-hint${hint.near ? ' near' : ''}"><span class="live-arrow" aria-hidden="true">${arrow}</span><span>${esc(hint.near ? nearText(model.kind, model.npc) : `${hint.text}${model.kind === 'npc' ? ` to ${model.npc}` : ''}`)}</span></div>` : ''}
    ${model.note ? `<p class="live-position-note">${esc(model.note)}</p>` : ''}${model.body ? `<p class="live-how">${esc(model.body)}</p>` : ''}${model.arrival ? `<p class="live-arrival">${esc(model.arrival)}</p>` : ''}`;
}

// Where you are heading, always shown at the top of the Live card, with a way to cancel it.
function destinationHtml() {
  const map = mapById(state.destination);
  if (!map) return '';
  const goal = goalSpot(), why = state.startingQuest ? `to start ${state.startingQuest}` : state.guide.quest ? `for ${state.guide.quest}` : '';
  return `<div class="dest-bar"><span class="dest-label">Destination</span><span class="dest-name">${goal ? `<strong>${esc(goal.name)}</strong> · ` : ''}<strong>${esc(map.name)}</strong>${why ? ` <small>${esc(why)}</small>` : ''}</span><button type="button" class="link-button" data-cancel-destination>Cancel</button></div>`;
}
function cancelDestination() {
  state.destination = null; state.targetId = null; state.goalNpc = null; state.startingQuest = null;
  if (state.guide.quest) setGuide(null);
  destinationSelect.value = ''; saveLive(); persist(); renderRoute(); renderTargets(); renderWorldMap(); renderLive();
}

function renderLive() {
  const html = destinationHtml() + hudHtml() + liveHtml(liveModel());
  const card = $('#live-step');
  if (card && card.dataset.html !== html) { card.innerHTML = html; card.dataset.html = html; }
  if (state.pipDoc) {
    const map = mapById(state.current), model = liveModel();
    const title = state.pipDoc.getElementById('pip-title'); if (title) title.innerHTML = map ? `${esc(map.area || '')}<br><b>${esc(map.name)}</b>` : '<b>Maple Route</b>';
    // Small corner tag: how many monsters spawn on this map (from map data, not read off the screen).
    const mobs = state.pipDoc.getElementById('pip-mobs');
    if (mobs) {
      const tally = map && state.tools.mobCount ? mobTally(state.data, map.id) : null, show = Boolean(tally?.total);
      mobs.classList.toggle('hidden', !show);
      if (show) {
        // One tiny greyed picture + spawn count per monster (OSMS thumbnails, shown as plain images).
        const text = tally.kinds.slice(0, 5).map(k => `<span class="pipmm-mob">${k.thumb ? `<img src="https://osmsdataexplorer.com/data/images/monsters/${k.thumb}.png" alt="${esc(k.name)}">` : `<i>${esc(k.name.slice(0, 1))}</i>`}${k.count}</span>`).join('');
        if (mobs.innerHTML !== text) { mobs.innerHTML = text; mobs.title = ['Spawn points on this map (map data, not what is alive right now):', ...tally.kinds.map(k => `${k.count} × ${k.name} (Lv ${k.level ?? '?'})`)].join('\n'); }
      }
    }
    // A whole-screen share sees this window too: over the mini map it hides it from the reader.
    const wholeScreen = state.live?.capture?.track?.getSettings?.().displaySurface === 'monitor';
    const status = state.pipDoc.getElementById('pip-status');
    if (status) status.title = wholeScreen ? 'You shared your whole screen, so this window blocks the mini map if it sits over it. Reconnect and pick the MapleStory window instead.' : '';
    state.pipDoc.body.classList.toggle('pip-whole-screen', wholeScreen);
    const next = state.pipDoc.getElementById('pip-next');
    const destMap = mapById(state.destination), destGoal = destMap ? goalSpot() : null;
    const destLine = destMap ? `<small class="pip-dest">To ${destGoal ? `${esc(destGoal.name)} · ` : ''}${esc(destMap.name)} <button type="button" class="link-button pip-cancel" data-pip="cancel">cancel</button></small><br>` : '<small class="pip-dest">No destination</small><br>';
    if (next) next.innerHTML = destLine + (model.arrived ? `<b>${model.npcHere ? esc(nearText('npc', model.npcHere)) : 'You are here.'}</b>` : `${model.hint ? `<b>${esc(model.hint.near ? nearText(model.kind, model.npc) : model.hint.text)}</b> · ` : ''}${esc(model.title ?? '')}${model.note ? `<br><small class="mv-lost">${esc(model.note)}</small>` : ''}${wholeScreen && !livePosition() ? '<br><small class="mv-lost">Whole screen shared: over the mini map this window blocks the reader. Share the MapleStory window instead.</small>' : ''}`);
  }
  renderMapView();
  if (state.pipWin && state.current && state.pipFitFor !== pipFitKey()) fitPip();
  if (state.world) renderWorldMap();
}

function livePosition() {
  const ttl = state.position?.estimated ? 20_000 : 5000;
  return state.position?.mapId === state.current && (!state.live || Date.now() - state.position.at < ttl) ? state.position : null;
}

const MAPVIEW_LEGEND = '<span class="mv-key visible"></span>Portal <span class="mv-key walk"></span>Walk-in <span class="mv-key hidden"></span>Hidden <span class="mv-key special"></span>Scripted <span class="mv-key taxi"></span>NPC ride <span class="mv-key you"></span>You';

// Mini map pictures come through the same-origin /osms-img relay (vite.config.js) so their pixels can
// be read once per map to line them up with map coordinates. The alignment is cached in this browser.
// v2: earlier live alignments drifted with misread portal rings and are dropped.
const PICTURE_CAL_KEY = 'maple-route-picture-cal-v2';
const GROUND_LIFT = 7.5;
// In-game mini map markers sit this far (mini map px) from the picture art; measured by matching live
// frames against the art on Henesys (-1.5, -9.6) and Deep Forest (-2.4, -8.6).
const MARKER_SHIFT = { x: -2, y: -9.1 };
// Drawing on the art itself: undo the in-game marker shift (or the ground lift of a guessed alignment)
// so exits stand on the ground they belong to.
const artCalibration = cal => cal.source === 'ground' ? { ...cal, oy: cal.oy + GROUND_LIFT } : { ...cal, ox: cal.ox - MARKER_SHIFT.x, oy: cal.oy - MARKER_SHIFT.y };

// Full OSMS map renders (portal coordinates are their pixels). The manifest maps ids to files.
let mapManifest = null, manifestPromise = null;
function loadManifest() {
  manifestPromise ??= fetch(osmsUrl('current/map_manifest.json')).then(r => r.ok ? r.json() : {}).catch(() => ({})).then(m => { mapManifest = m; renderMapView(); return m; });
  return manifestPromise;
}
// OSMS pictures load politely: at most two at a time, and a failed one (OSMS answers "busy" when
// many maps are asked for at once) is retried later, 3 s, 6 s, 12 s... while the map view says so.
const imageQueue = [];
let imagesLoading = 0;
function queueImage(image, src) { image.crossOrigin = 'anonymous'; imageQueue.push({ image, src }); pumpImages(); }
function pumpImages() {
  while (imagesLoading < 2 && imageQueue.length) {
    const { image, src } = imageQueue.shift(); imagesLoading++;
    const done = () => { imagesLoading--; image.removeEventListener('load', done); image.removeEventListener('error', done); pumpImages(); };
    image.addEventListener('load', done); image.addEventListener('error', done);
    image.src = src;
  }
}
function retryImage(entry, attempt, load) {
  if (attempt >= 6) { entry.status = 'failed'; renderMapView(); return; }
  state.osmsBusyUntil = Date.now() + 15_000; entry.status = 'loading';
  setTimeout(() => load(attempt + 1), 3000 * 2 ** attempt);
  renderMapView();
}

const renderCache = new Map();
function loadRender(map) {
  if (renderCache.has(map.id)) return renderCache.get(map.id);
  if (!mapManifest) { loadManifest(); return null; }
  const hash = mapManifest[map.id];
  if (!hash) { renderCache.set(map.id, { status: 'missing' }); return renderCache.get(map.id); }
  const entry = { status: 'loading' }; renderCache.set(map.id, entry);
  const image = new Image();
  image.onload = () => {
    Object.assign(entry, { status: 'ready', src: image.src, width: image.naturalWidth, height: image.naturalHeight });
    // A 1/16 copy to line the mini map picture up with exactly.
    try {
      const w = Math.round(entry.width / 16), h = Math.round(entry.height / 16), canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
      const context = canvas.getContext('2d', { willReadFrequently: true }); context.imageSmoothingQuality = 'high'; context.drawImage(image, 0, 0, w, h);
      entry.small = context.getImageData(0, 0, w, h);
    } catch { entry.small = null; }
    registerWithRender(map);
    renderMapView();
  };
  const fetchRender = attempt => { image.onerror = () => retryImage(entry, attempt, fetchRender); queueImage(image, `${osmsUrl(`maps/${hash}.webp`)}${attempt ? `?retry=${attempt}` : ''}`); };
  fetchRender(0);
  return entry;
}

// Mini map picture → map units via the full render: exact for every map before it is ever visited.
// Live frames (rings + match) still refine it.
function registerWithRender(map) {
  const picture = pictureCache.get(map.id), render = renderCache.get(map.id);
  // The render alignment is exact, so it also replaces a live one (live ones could drift).
  if (!picture?.rgba || !render?.small || pictureCalibrations[map.id]?.source === 'render') return;
  const reg = registerPictures(render.small, picture.rgba);
  if (!reg || reg.margin < .05) return;
  const cal = { scale: 1 / 16, ox: -reg.dx + MARKER_SHIFT.x, oy: -reg.dy + MARKER_SHIFT.y, confidence: reg.score, source: 'render', w: picture.width, h: picture.height };
  pictureCalibrations[map.id] = cal; picture.calibration = cal; picture.status = 'ready';
  try { localStorage.setItem(PICTURE_CAL_KEY, JSON.stringify(pictureCalibrations)); } catch { /* optional */ }
}
const pictureCache = new Map();
let pictureCalibrations = {};
try { pictureCalibrations = JSON.parse(localStorage.getItem(PICTURE_CAL_KEY) || '{}') || {}; } catch { pictureCalibrations = {}; }

function loadPicture(map) {
  if (!map?.picture) return null;
  if (pictureCache.has(map.id)) return pictureCache.get(map.id);
  const entry = { status: 'loading' };
  pictureCache.set(map.id, entry);
  const image = new Image();
  image.onload = () => {
    entry.width = image.naturalWidth; entry.height = image.naturalHeight; entry.src = image.src;
    let calibration = pictureCalibrations[map.id];
    try {
      const canvas = document.createElement('canvas'); canvas.width = entry.width; canvas.height = entry.height;
      const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0);
      entry.rgba = context.getImageData(0, 0, entry.width, entry.height);
    } catch { entry.rgba = null; }
    if (!calibration || !calibration.source || calibration.w !== entry.width || calibration.h !== entry.height) {
      calibration = null;
      try {
        const canvas = document.createElement('canvas'); canvas.width = entry.width; canvas.height = entry.height;
        const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0);
        const rgba = context.getImageData(0, 0, entry.width, entry.height).data, alpha = new Uint8Array(entry.width * entry.height);
        for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
        const points = [...Object.values(map.spots ?? {}), ...(map.npcs ?? [])];
        const found = calibratePicture(alpha, entry.width, entry.height, points);
        // Markers sit about 7.5 picture px above the ground they stand on (measured against live frames).
        if (found) { calibration = { ...found, oy: found.oy - GROUND_LIFT, source: 'ground', w: entry.width, h: entry.height }; pictureCalibrations[map.id] = calibration; try { localStorage.setItem(PICTURE_CAL_KEY, JSON.stringify(pictureCalibrations)); } catch { /* optional */ } }
      } catch { calibration = null; } // pixels unreadable (no relay): fall back to the drawn map
    }
    entry.calibration = calibration && (['live', 'render'].includes(calibration.source) || calibration.confidence >= .55) ? calibration : null;
    entry.status = entry.calibration ? 'ready' : 'unaligned';
    registerWithRender(map);
    renderMapView();
  };
  const fetchPicture = attempt => { image.onerror = () => retryImage(entry, attempt, fetchPicture); queueImage(image, `${osmsUrl(`current/${map.picture}`)}${attempt ? `?retry=${attempt}` : ''}`); };
  fetchPicture(0);
  return entry;
}

// The picture box is kept between renders (only its drawing is swapped) so scrolling stays smooth.
// During Live GPS it follows your character on both axes; scrolling it yourself pauses that for 5 s.
function showPicture(container, svg, picture, mapId) {
  let box = container.querySelector(':scope > .mv-picture');
  const fresh = !box || container.dataset.map !== mapId;
  if (!box) {
    container.innerHTML = '<div class="mv-picture"></div>';
    box = container.querySelector('.mv-picture');
    const mark = () => { box.dataset.userAt = String(Date.now()); };
    for (const type of ['wheel', 'pointerdown', 'touchstart', 'keydown']) box.addEventListener(type, mark, { passive: true });
  }
  container.dataset.map = mapId;
  if (box.dataset.svg === svg && !fresh) return;
  box.innerHTML = svg; box.dataset.svg = svg;
  const drawing = box.querySelector('svg'), focus = box.querySelector('.mv-player circle') ?? box.querySelector('.mv-next circle');
  if (!drawing || !focus || !picture.width) return;
  const userRecently = Date.now() - Number(box.dataset.userAt || 0) < 5000;
  if (!fresh && (!state.live || userRecently)) return;
  const scale = drawing.clientWidth / picture.width;
  const left = Number(focus.getAttribute('cx')) * scale - box.clientWidth / 2, top = Number(focus.getAttribute('cy')) * scale - box.clientHeight / 2;
  // Instant, not smooth: smooth-scroll animations stall while the game (not this page) is in front.
  box.scrollLeft = Math.max(0, left); box.scrollTop = Math.max(0, top);
}

// Maps one portal (or ride) away. Their mini map pictures are preloaded so a map change can be
// recognised from the picture straight away, before the title text is read.
const neighborIds = mapId => [...new Set(state.data.portals.filter(p => p.from === mapId).map(p => p.to))];
// Their renders too, so the picture is lined up before you arrive and the map view does not swap
// (and resize) from the render to the mini map art right after a map change.
function preloadNeighbors(mapId) { for (const id of neighborIds(mapId)) { const map = mapById(id); if (map) { loadPicture(map); if (pictureCalibrations[id]?.source !== 'render') loadRender(map); } } }

function cropBody(image, body) {
  const crop = { width: body.w, height: body.h, data: new Uint8ClampedArray(body.w * body.h * 4) };
  for (let y = 0; y < body.h; y++) crop.data.set(image.data.subarray(((body.y + y) * image.width + body.x) * 4, ((body.y + y) * image.width + body.x + body.w) * 4), y * body.w * 4);
  return crop;
}

// Which of these maps is the in-game mini map showing? Clear winners only.
function identifyByPicture(found, ids) {
  const body = findMarkers(found.image, found.band).body;
  if (!body) return null;
  const k = recallScale(state.pictureScales, minimapLayout(found.band, body));
  if (!k) return null;
  const crop = cropBody(found.image, body), scored = [];
  for (const id of ids) {
    const entry = pictureCache.get(id);
    if (!entry?.rgba) continue;
    const hit = locateInPicture(entry.rgba, crop, k);
    if (hit && !hit.ambiguous) scored.push({ id, score: hit.score });
  }
  scored.sort((a, b) => b.score - a.score);
  if (!scored.length || scored[0].score < .5 || (scored[1] && scored[0].score - scored[1].score < .1)) return null;
  return scored[0];
}

function renderMapView() {
  const target = $('#mapview'); if (!target) return;
  const map = state.current ? mapById(state.current) : null;
  if (!map) { target.innerHTML = '<div class="empty">Pick your current map or start Live GPS to see it here.</div>'; $('#mapview-note').textContent = ''; return; }
  const goal = goalSpot();
  const model = mapViewModel(state.data, map.id, { route: state.route, position: livePosition(), goal: goal?.mapId === map.id ? goal : null });
  const picture = loadPicture(map), render = loadRender(map);
  const art = picture?.status === 'ready' && picture.calibration ? { ...picture, calibration: artCalibration(picture.calibration) } : null;
  if (state.mapStyle !== 'render' && art) {
    // Default: the clean mini map art (never shows monsters), lined up exactly via the render.
    const svg = pictureOverlaySvg(model, art, esc);
    showPicture(target, svg, art, map.id);
    const pip = state.pipDoc?.getElementById('pip-map'); if (pip) showPicture(pip, svg, art, map.id);
  } else if (render?.status === 'ready') {
    // Full render: exits at their exact coordinates.
    const svg = renderOverlaySvg(model, render, esc);
    showPicture(target, svg, render, map.id);
    const pip = state.pipDoc?.getElementById('pip-map'); if (pip) showPicture(pip, svg, render, map.id);
  } else if (picture?.status === 'ready') {
    const svg = pictureOverlaySvg(model, picture, esc);
    showPicture(target, svg, picture, map.id);
    const pip = state.pipDoc?.getElementById('pip-map'); if (pip) showPicture(pip, svg, picture, map.id);
  } else {
    const svg = mapViewSvg(model, esc);
    target.innerHTML = svg; delete target.dataset.map;
    const pip = state.pipDoc?.getElementById('pip-map'); if (pip) { pip.innerHTML = svg; delete pip.dataset.map; }
  }
  setTimeout(fitLivePage, 0);
  const credit = state.mapStyle !== 'render' && art ? `Mini map art from <a href="https://osmsdataexplorer.com/" target="_blank" rel="noopener">OSMS Data Explorer</a> (game art © Nexon), ${picture.calibration?.source === 'render' || picture.calibration?.source === 'live' ? 'lined up exactly with the map' : 'lined up approximately'}. `
    : render?.status === 'ready' ? 'Map render from <a href="https://osmsdataexplorer.com/" target="_blank" rel="noopener">OSMS Data Explorer</a> (game art © Nexon); exits are drawn at their exact coordinates. '
    : render?.status === 'loading' ? 'Downloading this map’s picture… Maps load slower the first time and are saved, so they open quickly after that. '
    : picture?.status === 'ready' ? `Mini map picture from <a href="https://osmsdataexplorer.com/" target="_blank" rel="noopener">OSMS Data Explorer</a> (game art © Nexon), ${picture.calibration?.source === 'live' ? 'lined up exactly from your live mini map' : 'lined up automatically (Live GPS makes it exact)'}. `
    : picture?.status === 'loading' ? 'Downloading this map’s picture… Maps load slower the first time and are saved, so they open quickly after that. '
    : picture ? 'The mini map picture could not be lined up here, so the map is drawn from coordinates. ' : '';
  const lost = state.live && !livePosition() && state.positionNote ? `<strong class="mv-lost">${esc(state.positionNote)}</strong><br>` : '';
  // How many of each monster spawn here (the map's spawn list, not what is alive right now).
  const spawnColor = spawnColors(map.mobSpots ?? []);
  const tally = mobTally(state.data, map.id), spawns = tally.kinds.length ? `<div class="mv-spawns"><strong>Spawns here:</strong> ${tally.kinds.map(k => `${spawnColor.has(k.name) ? `<i class="spawn-dot" style="background:${spawnColor.get(k.name)}"></i>` : ''}${k.count || '?'} × ${esc(k.name)}${k.level ? ` <small>Lv ${k.level}</small>` : ''}`).join(' · ')}</div>` : '<div class="mv-spawns">No monsters spawn here.</div>';
  const busy = Date.now() < (state.osmsBusyUntil ?? 0) ? '<div class="mv-busy">OSMS is busy right now; map pictures will keep loading in the background.</div>' : '';
  $('#mapview-note').innerHTML = `${busy}${lost}${spawns}${MAPVIEW_LEGEND}<br>${credit}Click an exit to set its map as your destination.`;
}

$('#map-detailed').checked = state.mapStyle === 'render';
$('#map-detailed').addEventListener('change', event => { state.mapStyle = event.target.checked ? 'render' : 'art'; saveLive(); renderMapView(); });
$('#mapview').addEventListener('click', event => {
  const exit = event.target.closest('.mv-exit'); if (!exit?.dataset.to || !mapById(exit.dataset.to)) return;
  releaseGuide(); state.destination = exit.dataset.to; state.targetId = null; destinationSelect.value = exit.dataset.to; persist(); renderRoute(); renderTargets();
});
$('#mapview').addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && event.target.closest('.mv-exit')) { event.preventDefault(); event.target.closest('.mv-exit').dispatchEvent(new MouseEvent('click', { bubbles: true })); } });

// Where the in-game mini map sits inside the OSMS picture: gives the player's picture position even
// with no portal ring in view. Screen-to-picture scale is learned once per mini map size.
function pictureMatch(found, map, located) {
  const entry = loadPicture(map), body = located.markers.body, dot = located.markers.player;
  if (!entry?.rgba || !body || !dot || !located.layout) return null;
  // Narrow/short maps sit centred in the window between see-through strips: drop those, and the
  // map's visible width (or height) then gives the exact screen/picture scale.
  const trimmed = trimSeeThrough(cropBody(found.image, body)), crop = trimmed.crop;
  // A game window (inventory…) over part of the mini map: compare only what is still visible.
  located.covered = maskCovered(crop);
  if (located.covered > .6) return null;
  const exactK = trimmed.trimmedX ? crop.width / entry.rgba.width : trimmed.trimmedY ? crop.height / entry.rgba.height : null;
  // The game draws its picture 1366 px wide and stretches it to the window: screen px per picture px
  // is the window width / 1366 (2560 -> 1.874, 2000 -> 1.464), verified on every saved capture.
  const frameK = state.live?.frameW ? state.live.frameW / 1366 : null;
  let k = exactK ?? frameK ?? recallScale(state.pictureScales, located.layout), hit = null;
  const last = state.live?.lastPicture?.mapId === map.id && Math.abs(state.live.lastPicture.k - (k ?? 0)) < .03 ? state.live.lastPicture : null;
  if (k && last) {
    hit = locateInPicture(entry.rgba, crop, k, { near: last });
    if (hit && hit.score < last.score - .15) hit = null; // moved too far (dropped a ledge): full search
  }
  if (k && !hit) hit = locateInPicture(entry.rgba, crop, k);
  if (!hit && !exactK) {
    const best = findPictureScale(entry.rgba, crop);
    if (!best) return null;
    hit = best; k = best.k; state.pictureScales = rememberScale(state.pictureScales, located.layout, k); saveLive();
  }
  if (!hit) return null;
  // Repeating scenery: the spot you are known to be at (the arrival spot of the portal you came
  // through, or a moment ago) picks between the look-alike places.
  const known = state.position?.mapId === map.id && Date.now() - state.position.at < 30_000 ? state.position : null;
  if (hit.ambiguous && !hit.local && known && entry.calibration && k) {
    const near = { x: known.x / 16 + entry.calibration.ox - (dot.x - body.x - trimmed.dx) / k, y: known.y / 16 + entry.calibration.oy - (dot.y - body.y - trimmed.dy) / k };
    const local = locateInPicture(entry.rgba, crop, k, { near });
    if (local) hit = local;
  }
  if (hit.ambiguous && !hit.local) return { ambiguous: true, k, score: hit.score }; // repeating scenery: do not guess
  // A much weaker fit than usual for this map means the mini map is showing something else (a new map).
  if (last && hit.score < Math.max(.42, last.score - .2)) return null;
  if (state.live) state.live.lastPicture = { mapId: map.id, x: hit.x, y: hit.y, k, score: hit.score };
  return { x: hit.x + (dot.x - body.x - trimmed.dx) / k, y: hit.y + (dot.y - body.y - trimmed.dy) / k, k, score: hit.score };
}

function updatePosition(found, mapId) {
  const map = mapById(mapId), located = locatePlayer(found, map, state.minimapScales);
  // The mini map suddenly a different size right after a good reading: something (inventory…) is
  // covering part of it, not a real resize. Read nothing from it, and learn no scale from it, until
  // it is back to its size or the new size has held for a few seconds.
  const live = state.live, lay = located.layout, trusted = live?.trustedLayout;
  const resized = lay && trusted && (Math.abs(lay.w - trusted.w) / trusted.w > .05 || Math.abs(lay.h - trusted.h) / trusted.h > .05);
  if (resized) live.resizedSince ??= Date.now(); else if (live) live.resizedSince = null;
  // The in-game mini map's size on screen (title strip to bottom edge), for sizing the pop-out over it.
  if (live && !resized && located.markers?.body && found.band) { const b = located.markers.body, band = found.band; live.minimapBox = { w: Math.max(band.w, b.x + b.w - band.x), h: b.y + b.h - band.y }; }
  // Covered for real when a flat window panel sits where the mini map was: then it stays suspect for
  // as long as the panel is there; a true resize (no panel) is accepted after 4 s.
  let panel = 0;
  if (resized && found.band && found.image) {
    const h = found.band.h, area = { x: Math.max(0, found.band.x), y: Math.min(found.image.height - 1, found.band.y + h), w: Math.round(trusted.w * h), h: Math.round(trusted.h * h) };
    area.w = Math.min(area.w, found.image.width - area.x); area.h = Math.min(area.h, found.image.height - area.y);
    if (area.w > 20 && area.h > 20) panel = maskCovered(cropBody(found.image, area));
  }
  const suspect = resized && (panel > .08 || (Date.now() - trusted.at < 15_000 && Date.now() - live.resizedSince < 4000));
  if (suspect) { located.world = null; located.covered = Math.max(located.covered ?? 0, .5); }
  if (!suspect && located.world && located.fit.inliers >= 2) { state.minimapScales = rememberScale(state.minimapScales, located.layout, located.fit.scalePerUnit); saveLive(); }
  let picture = null;
  if (!suspect) try { picture = pictureMatch(found, map, located); } catch { picture = null; }
  const ambiguousPicture = Boolean(picture?.ambiguous);
  if (ambiguousPicture) picture = null;
  const entry = pictureCache.get(mapId);
  // The render alignment is exact for every map: live data never overrides it. A live alignment is
  // only refined by small steps, so one misread ring cannot shift every portal on the map.
  const fixedCal = pictureCalibrations[mapId]?.source === 'render';
  const steady = (old, next) => !old || Math.hypot(next.ox - old.ox, next.oy - old.oy) <= 4;
  if (!fixedCal && picture && located.world && located.fit.inliers >= 3 && entry && steady(pictureCalibrations[mapId]?.source === 'live' ? pictureCalibrations[mapId] : null, { ox: picture.x - located.world.x / 16, oy: picture.y - located.world.y / 16 })) {
    // Rings and picture agree on this frame: that is the exact picture alignment for this map.
    const exact = { ox: picture.x - located.world.x / 16, oy: picture.y - located.world.y / 16 };
    const old = pictureCalibrations[mapId]?.source === 'live' ? pictureCalibrations[mapId] : null;
    const cal = { scale: 1 / 16, ox: old ? old.ox * .7 + exact.ox * .3 : exact.ox, oy: old ? old.oy * .7 + exact.oy * .3 : exact.oy, confidence: 1, source: 'live', w: entry.width, h: entry.height };
    pictureCalibrations[mapId] = cal; entry.calibration = cal; entry.status = 'ready';
    try { localStorage.setItem(PICTURE_CAL_KEY, JSON.stringify(pictureCalibrations)); } catch { /* optional */ }
  }
  // One ring is enough once the picture match is known: it is one of the map's portals, and the
  // portal that fits best (closest to the current alignment) gives the exact alignment.
  if (!fixedCal && !pictureCalibrations[mapId]?.source?.match(/live/) && picture && entry && !located.world && located.markers.portals.length && map?.marks?.length && located.markers.body) {
    const b = located.markers.body, base = entry.calibration ?? { ox: -8, oy: -11.5 };
    let best = null;
    for (const ring of located.markers.portals) {
      const ringPic = { x: picture.x + (ring.x - located.markers.player.x) / picture.k, y: picture.y + (ring.y - located.markers.player.y) / picture.k };
      for (const mark of map.marks) {
        const off = { ox: ringPic.x - mark.x / 16, oy: ringPic.y - mark.y / 16 }, d = Math.hypot(off.ox - base.ox, off.oy - base.oy);
        if (!best || d < best.d) best = { ...off, d };
      }
    }
    if (best && best.d < 10) {
      const old = pictureCalibrations[mapId]?.source === 'live' ? pictureCalibrations[mapId] : null;
      const cal = { scale: 1 / 16, ox: old ? old.ox * .7 + best.ox * .3 : best.ox, oy: old ? old.oy * .7 + best.oy * .3 : best.oy, confidence: 1, source: 'live', w: entry.width, h: entry.height };
      pictureCalibrations[mapId] = cal; entry.calibration = cal; entry.status = 'ready';
      try { localStorage.setItem(PICTURE_CAL_KEY, JSON.stringify(pictureCalibrations)); } catch { /* optional */ }
    }
  }
  let world = located.world;
  const pictureWorld = picture && entry?.calibration ? { x: (picture.x - entry.calibration.ox) * 16, y: (picture.y - entry.calibration.oy) * 16 } : null;
  if (!world && pictureWorld) world = pictureWorld;
  // One portal ring is a guess about WHICH portal it is (Kerning City: 1991 vs 5420). A good picture
  // match says where you are directly, so it wins over a lone ring that disagrees with it.
  // A strong picture match also beats a 2-ring fit that disagrees (Henesys: rings said -998, the
  // picture 2637): the rings' scale was learned wrong for this mini map size, so forget that scale.
  const disagrees = world && pictureWorld && Math.hypot(world.x - pictureWorld.x, world.y - pictureWorld.y) > 300;
  if (disagrees && ((located.fit?.inliers ?? 0) < 2 || picture.score >= .7)) {
    if ((located.fit?.inliers ?? 0) >= 2 && located.layout) { state.minimapScales = state.minimapScales.filter(e => Math.abs(e.w - located.layout.w) > .15 || Math.abs(e.h - located.layout.h) > .15); saveLive(); }
    world = pictureWorld;
  }
  // Never outside the map itself.
  if (world && map?.bounds && (world.x < map.bounds.minX - 200 || world.x > map.bounds.maxX + 200 || world.y < map.bounds.minY - 300 || world.y > map.bounds.maxY + 300)) world = pictureWorld && pictureWorld !== world ? pictureWorld : null;
  state.positionPic = picture ? { mapId, x: picture.x, y: picture.y, at: Date.now() } : state.positionPic?.mapId === mapId ? state.positionPic : null;
  if (state.live) logTest('picture', { map: map?.name, matched: Boolean(picture), ambiguous: ambiguousPicture, k: picture?.k, score: picture && +picture.score.toFixed(3), pic: picture && `${picture.x.toFixed(1)},${picture.y.toFixed(1)}`, calibration: entry?.calibration && `${entry.calibration.source ?? 'ground'} ${entry.calibration.ox.toFixed(1)},${entry.calibration.oy.toFixed(1)}` });
  // Dev only: one full-size copy of an unmatched mini map per map and size, so the matcher can be tuned on it.
  if (import.meta.env.DEV && state.live && !picture && located.markers.body && located.layout) {
    const key = `${mapId}@${located.layout.w.toFixed(1)}x${located.layout.h.toFixed(1)}`;
    state.live.unmatchedSent ??= new Set();
    if (!state.live.unmatchedSent.has(key) && (state.live.unmatchedCount = (state.live.unmatchedCount ?? 0) + 1) >= 5) {
      state.live.unmatchedSent.add(key); state.live.unmatchedCount = 0;
      try {
        const canvas = document.createElement('canvas'); canvas.width = found.image.width; canvas.height = found.image.height;
        canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(found.image.data), found.image.width, found.image.height), 0, 0);
        if (isLocalHost()) fetch('/__live-log', { method: 'POST', body: JSON.stringify({ kind: 'minimap-raw', map: map?.name, mapId, band: found.band, body: located.markers.body, player: located.markers.player, layout: located.layout, image: canvas.toDataURL('image/png') }) }).catch(() => {});
      } catch { /* diagnostics only */ }
    }
  }
  if (world) located.world = world;
  if (state.live) logTest('position', { map: mapById(mapId)?.name, reason: located.reason, rings: located.markers.portals.length, dot: Boolean(located.markers.player), inliers: located.fit?.inliers ?? 0, layout: located.layout && `${located.layout.w.toFixed(2)}x${located.layout.h.toFixed(2)}`, world: located.world && `${Math.round(located.world.x)},${Math.round(located.world.y)}` });
  // One portal ring and no picture match is a guess about which portal it is: never let that throw
  // the dot across the map from a position seen a moment ago.
  const weak = located.world && !picture && (located.fit?.inliers ?? 0) < 2;
  if (weak && state.position?.mapId === mapId && !state.position.estimated && Date.now() - state.position.at < 3000 && Math.hypot(located.world.x - state.position.x, located.world.y - state.position.y) > 500) located.world = null;
  // Nobody runs 900+ map units in a second: such a jump only counts once the next reading agrees.
  if (located.world && live && state.position?.mapId === mapId && !state.position.estimated && Date.now() - state.position.at < 1000 && Math.hypot(located.world.x - state.position.x, located.world.y - state.position.y) > 900) {
    const pending = live.pendingJump;
    if (!pending || pending.mapId !== mapId || Math.hypot(located.world.x - pending.x, located.world.y - pending.y) > 200) { live.pendingJump = { mapId, x: located.world.x, y: located.world.y }; located.world = null; }
    else live.pendingJump = null;
  } else if (live) live.pendingJump = null;
  if (located.world && live && lay && !suspect) live.trustedLayout = { w: lay.w, h: lay.h, at: Date.now() };
  if (located.world) state.position = { mapId, x: located.world.x, y: located.world.y, at: Date.now() };
  else if (state.position?.mapId !== mapId) state.position = null;
  if (located.world) located.reason = null;
  if (!located.world && located.covered > .15) located.reason = 'covered';
  coveredReminder(located.reason === 'covered');
  state.positionNote = located.world ? null : POSITION_NOTES[located.reason] ?? null;
  if (!state.live) renderLive(); // the live loop renders once at the end of its tick
  const next = state.route?.[0];
  const goal = !next && live && state.voice && state.position ? goalSpot() : null;
  if (goal && goal.mapId === mapId && guidance(state.position, goal)?.near && live.nearSpoken !== `npc:${goal.name}`) { live.nearSpoken = `npc:${goal.name}`; sayPart('npc', nearText('npc', goal.name)); }
  if (!live || !state.voice || !next || !state.position || next.from !== mapId) return;
  const hint = guidance(state.position, { x: Number(next.x), y: Number(next.y) }), key = `${next.from}>${next.to}`;
  // (No spoken "you are at the portal": the screen shows it.)
}

// Spoken on entering a map: just the monsters on it.
function mobsSpoken(mapId) {
  const kinds = mobTally(state.data, mapId).kinds.map(k => k.count ? `${k.count} ${k.count === 1 || /s$/i.test(k.name) ? k.name : `${k.name}s`}` : k.name);
  return kinds.length ? `This map has ${kinds.length > 1 ? `${kinds.slice(0, -1).join(', ')} and ${kinds.at(-1)}` : kinds[0]}.` : '';
}

// Said once when the mini map has been covered (or not found) for ~3 s; again only after it was seen.
function coveredReminder(covered) {
  const live = state.live; if (!live) return;
  if (!covered) { live.coveredSince = null; live.coveredSaid = false; return; }
  live.coveredSince ??= Date.now();
  if (!live.coveredSaid && Date.now() - live.coveredSince > 8000 && Date.now() - (live.mapChangedAt ?? 0) > 8000) { live.coveredSaid = true; sayPart('warnings', 'I cannot see your mini map. Move any window off it.'); }
}

function onLiveMap(id) {
  // Each map's mini map is a different size: a new map is not "something covering the mini map".
  if (state.live) Object.assign(state.live, { mapChangedAt: Date.now(), trustedLayout: null, resizedSince: null, pendingJump: null, coveredSince: null });
  const arrived = id === state.destination && state.current !== id;
  const step = state.route?.[0], spot = step?.to === id && step.arrive ? mapById(id)?.spots?.[step.arrive] : null;
  setCurrent(id, true);
  applyObjective();
  // Just came through a known portal: you are standing at its arrival spot until the mini map says otherwise.
  if (spot) { state.position = { mapId: id, x: spot.x, y: spot.y, at: Date.now(), estimated: true }; renderLive(); }
  if (!state.voice) return;
  const next = !arrived && state.route?.[0]?.from === id ? state.route[0] : null;
  const words = [arrived && voiceOn('arrival') ? 'You have arrived.' : '', next && voiceOn('directions') ? spokenStep(state.data, next, state.route[1], { level: state.level }) : '', (arrived ? voiceOn('monstersDest') : voiceOn('monstersAll')) ? mobsSpoken(id) : ''].filter(Boolean).join(' ');
  if (words) say(words);
}

async function liveTick() {
  const live = state.live;
  if (!live || live.paused) return;
  // Watchdog: a tick stuck for 12 s (a frame or OCR call that never returned) must not stop Live GPS.
  if (live.busy && Date.now() - live.busySince < 12_000) return;
  if (live.busy) logTest('stalled-tick-reset', { stuckFor: Date.now() - live.busySince });
  live.busy = true; live.busySince = Date.now(); const t0 = performance.now();
  let grabbed = null;
  try {
    grabbed = await live.capture.grab();
    live.frameW = grabbed.width;
    const found = locateMinimap(grabbed.source, grabbed.width, grabbed.height, live.side, live.lastFound);
    if (found) live.lastFound = { offsetX: found.offsetX, side: found.side, band: found.band };
    if (!found) { coveredReminder(Date.now() - (live.minimapSeenAt ?? 0) < 60_000); logTest('no-minimap', { frame: `${grabbed.width}x${grabbed.height}`, misses: live.misses + 1 }); if (live.misses === 2) snapshotCorner(grabbed.source, grabbed.width, grabbed.height, 'no mini map found', true); if (++live.misses >= 3) liveState('Can’t see the mini map: is a game window covering it?', true); return; }
    live.misses = 0; live.side = found.side; live.minimapSeenAt = Date.now();
    const signature = titleSignature(found), since = Date.now() - live.lastOcr, changed = signatureChanged(signature, live.signature);
    let titleRead = false;
    // Re-read on a title change (title text first: ~0.3 s), and every 5 s regardless as a safety net.
    if ((changed && since > 350) || (!live.mapId && since > 1500) || since > 5000) {
      live.lastOcr = Date.now(); live.signature = signature; titleRead = true;
      const titleText = await readTitle(live.worker, grabbed.source, found, $('#scan-crop'));
      const matches = matchMap(titleText, state.data.maps, state.current);
      logTest('title', { text: titleText, side: found.side, band: found.band, frame: `${grabbed.width}x${grabbed.height}`, matches: matches.slice(0, 3).map(m => `${m.map.name} ${m.score.toFixed(2)}`), accepted: confident(matches) ? matches[0].map.name : null });
      if (!confident(matches)) snapshotCorner(grabbed.source, grabbed.width, grabbed.height, `title not matched: ${titleText.slice(0, 40)}`);
      if (confident(matches)) {
        // A different map must be read twice in a row before we switch, so one misread cannot pull you off your destination.
        const id = preferredMatch(matches);
        // Maps you can walk into from here are accepted on the first read; others must be read twice.
        // A one-line read that is only an area name ("Victoria Road", seen while the mini map redraws)
        // is never trusted on its own: it needs a second read like any far-away map.
        const areaOnly = titleText.trim().split(/\r?\n/).filter(Boolean).length < 2 && state.data.maps.some(m => (m.aliases ?? []).some(a => normalize(a).startsWith(`${normalize(mapById(id)?.name ?? '')} `)));
        if (!live.mapId || id === live.mapId || live.pendingMap === id || (!areaOnly && neighborIds(live.mapId).includes(id))) { live.mapId = id; live.pendingMap = null; }
        else { live.pendingMap = id; live.signature = null; logTest('pending', { map: mapById(id)?.name }); }
        if (live.mapId !== state.current) onLiveMap(live.mapId);
      } else if (changed && live.mapId) {
        // Title unreadable mid-transition: ask the preloaded pictures of the connected maps.
        const hit = identifyByPicture(found, neighborIds(live.mapId));
        if (hit) { logTest('picture-identify', { map: mapById(hit.id)?.name, score: +hit.score.toFixed(3) }); live.mapId = hit.id; live.pendingMap = null; onLiveMap(hit.id); }
      }
    }
    const t1 = performance.now();
    // The title changed but the new map is not confirmed yet: do not draw new movement on the old map.
    const settling = signatureChanged(signature, live.signature);
    if (live.mapId && !settling) { updatePosition(found, live.mapId); liveState(`Live · ${mapById(live.mapId)?.name ?? ''}`); }
    else liveState('Reading the map name…');
    const t2 = performance.now(), t3 = t2; // HUD reading runs in its own loop (hudLoop)
    renderLive();
    const t4 = performance.now();
    live.timing = { grabAndFind: Math.round(t1 - t0), position: Math.round(t2 - t1), hud: Math.round(t3 - t2), render: Math.round(t4 - t3) };
    if ((live.ticks = (live.ticks ?? 0) + 1) % 10 === 0) logTest('timing', live.timing);
  } catch (error) {
    logTest('tick-error', { message: String(error?.message ?? error) });
    if (error?.message === 'OCR timeout') {
      // Replace the stuck text reader with a fresh one.
      const stuck = state.worker; state.worker = null; stuck?.then?.(worker => worker.terminate()).catch?.(() => {});
      try { live.worker = await ocrWorker(); } catch { /* next tick retries */ }
    } else liveState(error?.message || 'Frame read failed', true);
  } finally { grabbed?.release(); if (state.live === live) live.busy = false; }
}

async function startLive() {
  countEvent('live-gps-started');
  if (state.live && !state.live.paused) return;
  let capture = null;
  try {
    liveState(state.live?.paused ? 'Pick the MapleStory window again to reconnect…' : 'Choose the MapleStory window (best) or Entire screen…');
    capture = await startCapture();
    // A browser tab was shared (the auto-pick matched a tab with "MapleStory" in its title): it can
    // never show the mini map, so stop and say how to fix it.
    if (capture.track.getSettings?.().displaySurface === 'browser') {
      logTest('wrong-share', { surface: 'browser', label: capture.track.label });
      capture.track.stop();
      liveState('That shared a browser tab, not the game. Close any browser tab with “MapleStory” in its title, then start again.', true);
      sayPart('warnings', 'That shared a browser tab, not the game. Close any browser tab with MapleStory in its title, then start again.');
      return;
    }
    liveState('Starting the map reader…');
    const worker = await ocrWorker();
    if (state.live?.paused) {
      // Reconnect: keep the route, EXP run, scales and everything else from before.
      Object.assign(state.live, { capture, paused: false, busy: false, misses: 0, signature: null });
      logTest('reconnected', { surface: capture.track.getSettings?.().displaySurface ?? null });
    } else {
      const audio = typeof AudioContext !== 'undefined' ? new AudioContext() : null; audio?.resume?.();
      state.live = { capture, worker, audio, jobs: {}, tracker: null, busy: false, misses: 0, side: null, signature: null, lastOcr: 0, mapId: null, nearSpoken: null, stopTicker: null, paused: false };
      logTest('started', { surface: capture.track.getSettings?.().displaySurface ?? null, label: capture.track.label });
      // Remember what was shared so the next prompt can say which screen to pick again.
      try { const settings = capture.track.getSettings?.() ?? {}; localStorage.setItem('maple-route-last-share', JSON.stringify({ surface: settings.displaySurface ?? null, label: capture.track.label, width: settings.width ?? null, height: settings.height ?? null })); } catch { /* optional */ }
    }
    const live = state.live;
    capture.track.addEventListener('ended', () => { if (state.live === live && live.capture === capture) pauseLive('ended'); });
    capture.track.addEventListener('mute', () => logTest('track-muted', {}));
    capture.track.addEventListener('unmute', () => logTest('track-unmuted', {}));
    if (state.current) preloadNeighbors(state.current);
    live.stopTicker?.(); live.stopTicker = ticker(400, liveTick);
    live.stopHudTicker?.(); live.stopHudTicker = ticker(1000, hudLoop);
    setLiveUi(); liveTick();
  } catch (error) {
    capture?.stop();
    if (!state.live?.paused) state.live = null;
    setLiveUi();
    liveState(error?.name === 'NotAllowedError' ? (state.live?.paused ? 'Paused · press Reconnect' : 'Off (sharing cancelled)') : screenError(error), error?.name !== 'NotAllowedError');
  }
}

// The share ended (the game rebuilt its window, or sharing was stopped from the browser bar): pause
// instead of switching off, and offer a one-click reconnect.
function pauseLive(reason) {
  const live = state.live; if (!live || live.paused) return;
  logTest('share-ended', { reason, surface: live.capture.track.getSettings?.().displaySurface ?? null });
  live.paused = true; live.stopTicker?.(); live.stopTicker = null; live.stopHudTicker?.(); live.stopHudTicker = null; live.capture.stop();
  setLiveUi(); liveState('Sharing stopped · press Reconnect', true);
  sayPart('warnings', 'Screen sharing stopped. Press reconnect to continue.');
}

function stopLive() {
  const live = state.live;
  if (!live) return;
  state.live = null; live.stopTicker?.(); live.stopHudTicker?.(); if (!live.paused) live.capture.stop(); live.audio?.close?.(); live.hudWorker?.terminate?.();
  renderLiveExp(); renderQuestHelper();
  setLiveUi(); liveState('Off');
}

// ---------- World map ----------
state.world = { center: null, query: '' };
function worldHtml() {
  const center = state.world.center ?? state.current ?? state.data.maps.find(m => m.name === 'Henesys')?.id;
  return worldMapHtml(worldMapModel(state.data, center, { currentId: state.current, destinationId: state.destination, query: state.world.query }), esc);
}
function renderWorldMap() {
  const html = worldHtml();
  // Live GPS re-renders often: only touch the DOM when something changed.
  const put = el => { if (el && el.dataset.html !== html) { el.dataset.html = html; keepSearchFocus(el, () => { el.innerHTML = html; }); } };
  put($('#world-map'));
  const pip = state.pipDoc?.getElementById('pip-world'); if (pip && !pip.classList.contains('hidden')) put(pip);
}
// Re-rendering replaces the search box: keep typing focus and caret.
function keepSearchFocus(container, render) {
  const active = container.ownerDocument.activeElement, typing = active?.matches?.('[data-wm-search]') && container.contains(active), caret = typing ? active.selectionStart : null;
  render();
  if (typing) { const box = container.querySelector('[data-wm-search]'); box.focus(); box.setSelectionRange(caret, caret); }
}
function wireWorldMap(root) {
  root.addEventListener('click', event => {
    const explore = event.target.closest('[data-wm-center]'), go = event.target.closest('[data-wm-go]');
    if (explore) { state.world.center = explore.dataset.wmCenter; state.world.query = ''; renderWorldMap(); }
    if (go && mapById(go.dataset.wmGo)) { state.guide.quest = null; routeToMap(go.dataset.wmGo); state.world.query = ''; renderWorldMap(); root.ownerDocument.querySelector('[data-pip="mini"]')?.click(); }
  });
  root.addEventListener('input', event => { if (event.target.matches('[data-wm-search]')) { state.world.query = event.target.value; renderWorldMap(); } });
}
wireWorldMap($('#world-map'));

// Sizes the pop-out to cover the in-game mini map, about 10% larger, so it can sit right over it.
// The shared window is captured in device pixels: divided by the screen scale for window sizes.
// Without Live GPS it falls back to the map drawn in the pop-out. Browsers only allow resizing right
// after a click, so on a map change it is tried and, if refused, the Fit button lights up instead.
const pipFitKey = () => { const box = state.live?.minimapBox; return `${state.current}|${box ? `${Math.round(box.w / 8)}x${Math.round(box.h / 8)}` : '-'}`; };
function pipTargetSize(doc, win) {
  const chrome = ['.pipmm-head', '#pip-next', '#pip-status'].reduce((sum, sel) => sum + (doc.querySelector(`#pip-mini ${sel}`)?.offsetHeight ?? 0), 0) + 4;
  const box = state.live?.minimapBox, scale = window.devicePixelRatio || 1;
  const maxW = Math.round((win.screen?.availWidth || 1600) * .8), maxH = Math.round((win.screen?.availHeight || 900) * .8);
  if (box) {
    const w = box.w / scale, h = box.h / scale;
    // At least the mini map's size with the map area itself about as tall as the in-game one.
    return { width: Math.round(Math.min(maxW, Math.max(240, w * 1.1))), height: Math.round(Math.min(maxH, Math.max(180, h * 1.1, h + chrome))) };
  }
  const svg = doc.querySelector('#pip-map svg'); if (!svg) return null;
  const mapW = parseFloat(svg.style.width) || svg.getBoundingClientRect().width, mapH = parseFloat(svg.style.height) || svg.getBoundingClientRect().height;
  return { width: Math.round(Math.min(760, Math.max(340, mapW + 8))), height: Math.round(Math.min(640, Math.max(260, Math.min(mapH, 460) + chrome))) };
}
function fitPip(fromClick = false) {
  const win = state.pipWin, doc = state.pipDoc;
  if (!win || !doc || doc.getElementById('pip-mini')?.classList.contains('hidden')) return;
  const size = pipTargetSize(doc, win); if (!size) return;
  const extraW = Math.max(0, win.outerWidth - win.innerWidth), extraH = Math.max(0, win.outerHeight - win.innerHeight);
  const button = doc.querySelector('[data-pip="fit"]');
  if (Math.abs(win.innerWidth - size.width) < 8 && Math.abs(win.innerHeight - size.height) < 8) { state.pipFitFor = pipFitKey(); button?.classList.remove('nudge'); return; }
  try { win.resizeTo(size.width + extraW, size.height + extraH); state.pipFitFor = pipFitKey(); button?.classList.remove('nudge'); }
  catch { if (!fromClick) button?.classList.add('nudge'); }
}

async function openPip() {
  if (state.pipDoc) return;
  const note = text => { $('#live-note').textContent = text; $('#live-note').classList.toggle('hidden', !text); };
  note('');
  if (!('documentPictureInPicture' in window)) { note('The pop-out window needs Chrome or Edge 116 or newer.'); return; }
  try {
    // Sized like the in-game mini map so it can sit over it (drag it there once; Edge remembers).
    const box = state.live?.minimapBox, scale = window.devicePixelRatio || 1;
    const pip = await documentPictureInPicture.requestWindow(box ? { width: Math.round(Math.max(240, box.w / scale * 1.1)), height: Math.round(Math.max(180, box.h / scale * 1.1 + 60)) } : { width: 420, height: 380 });
    for (const sheet of document.styleSheets) {
      try { const style = pip.document.createElement('style'); style.textContent = [...sheet.cssRules].map(rule => rule.cssText).join('\n'); pip.document.head.append(style); } catch { /* cross-origin sheet */ }
    }
    pip.document.title = 'Maple Route';
    pip.document.body.className = 'pip-body';
    pip.document.body.innerHTML = `<div id="pip-mini"><div class="pipmm-head"><div class="pipmm-title" id="pip-title"></div><span class="pipmm-btns"><button type="button" class="pipmm-btn fit" data-pip="fit" title="Size this window to cover the in-game mini map">Fit</button><button type="button" class="pipmm-btn" data-pip="world">World map</button></span></div>
      <div class="pipmm-stage"><div id="pip-map" class="pip-map"></div><div id="pip-mobs" class="pipmm-mobs hidden"></div></div><div id="pip-next" class="pipmm-next"></div><div class="pip-status pill" id="pip-status"></div></div>
      <div id="pip-world" class="hidden"></div><div id="pip-world-bar" class="pipmm-head hidden"><div class="pipmm-title"><b>World map</b></div><button type="button" class="pipmm-btn" data-pip="mini">Back</button></div>`;
    pip.document.body.addEventListener('click', event => {
      const mode = event.target.closest('[data-pip]')?.dataset.pip;
      if (!mode) return;
      if (mode === 'fit') { fitPip(true); return; }
      if (mode === 'cancel') { cancelDestination(); return; }
      const world = mode === 'world', doc = pip.document;
      doc.getElementById('pip-mini').classList.toggle('hidden', world);
      doc.getElementById('pip-world').classList.toggle('hidden', !world);
      doc.getElementById('pip-world-bar').classList.toggle('hidden', !world);
      if (world) state.world.center = state.current;
      if (world) { try { pip.resizeTo(720, 640); } catch { /* resizing needs a click */ } } else { state.pipFitFor = null; fitPip(true); }
      renderWorldMap();
    });
    wireWorldMap(pip.document.getElementById('pip-world'));
    state.pipDoc = pip.document; state.pipWin = pip; state.pipFitFor = null;
    pip.addEventListener('pagehide', () => { state.pipDoc = null; state.pipWin = null; });
    renderLive(); liveState(state.liveText ?? 'Off', state.liveWarn);
  } catch (error) { note(`The browser blocked the pop-out window${error?.message ? ` (${error.message})` : ''}.`); }
}

// ---------- Feedback (pre-filled GitHub issues) ----------
function reportContext() {
  const g = state.guide.quest ? guideSteps() : null;
  return { version: APP_VERSION, browser: (navigator.userAgentData?.brands ?? []).filter(b => !/not/i.test(b.brand)).map(b => `${b.brand} ${b.version}`).join(', ') || navigator.userAgent.slice(0, 80),
    frame: state.live?.frameW ? `${state.live.frameW} px wide` : '', live: Boolean(state.live), current: mapById(state.current)?.name ?? '', destination: mapById(state.destination)?.name ?? '',
    quest: state.guide.quest ?? '', step: g?.step?.title ?? '', log: testLog };
}
function openIssue(report) { window.open(issueUrl(report), '_blank', 'noopener'); }
$('#report-problem').addEventListener('click', () => openIssue(problemReport({ ...reportContext(), what: $('#report-what').value.trim() })));
$('#live-report').addEventListener('click', () => { showView('settings'); $('#feedback-title').scrollIntoView({ block: 'start' }); $('#report-what').focus(); });
$('#report-drop').addEventListener('click', () => {
  const item = $('#drop-item').value.trim(), monster = $('#drop-monster').value.trim();
  if (!item || !monster) { $('#report-note').textContent = 'Type the item and the monster first.'; return; }
  openIssue(dropReport({ item, monster, map: mapById(state.current)?.name ?? '', version: APP_VERSION }));
});
// Only the mini map itself (title strip to bottom edge): no chat, no names over characters.
$('#report-copy').addEventListener('click', async () => {
  const note = text => { $('#report-note').textContent = text; };
  const live = state.live, found = live?.lastFound, box = live?.minimapBox;
  if (!live?.capture || !found?.band || !box) { note('Start Live GPS first, with the mini map open.'); return; }
  try {
    const frame = await live.capture.grab(), x = (found.offsetX ?? 0) + found.band.x, y = found.band.y;
    const canvas = document.createElement('canvas'); canvas.width = box.w; canvas.height = box.h;
    canvas.getContext('2d').drawImage(frame.source, x, y, box.w, box.h, 0, 0, box.w, box.h);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    note('Mini map picture copied. Paste it into the issue (Ctrl+V).');
  } catch { note('Could not copy the picture here; a screenshot of the mini map works too.'); }
});

// ---------- Market (player listings: src/market.js, src/marketstore.js) ----------
const market = { store: createMarketStore(), catalog: null, byId: new Map(), listings: [], mine: [], offers: [], offerFor: null, me: null, item: null, loading: false, error: '', loadedAt: 0, active: 0 };
// The item a listing is for: from the game files, or rebuilt from the name for a custom item.
const marketItem = listing => listing.item_id === 'custom' ? customItem(listing.item_name) : market.byId.get(listing.item_id);
const IGN_KEY = 'maple-route-market-ign';
try { $('#market-ign').value = localStorage.getItem(IGN_KEY) ?? ''; } catch { /* storage blocked */ }
for (const [key, label] of STATS) $('#market-stat').insertAdjacentHTML('beforeend', `<option value="${key}">${label}</option>`);
async function loadMarket(force = false) {
  if (market.loading || (!force && Date.now() - market.loadedAt < 30_000)) { renderMarket(); return; }
  market.loading = true; renderMarket();
  try {
    if (!market.catalog) {
      const [response, cash] = await Promise.all([fetch(MARKET_ITEMS), fetch(MARKET_CASH).then(r => r.ok ? r.json() : null).catch(() => null)]);
      if (!response.ok) throw new Error('The item list is unavailable right now.');
      market.catalog = fromOsmsItems(await response.json(), cash); market.byId = new Map(market.catalog.map(item => [item.id, item]));
      market.facets = catalogFacets(market.catalog.filter(item => item.tradeable !== false)); fillTypes();
    }
    market.me = await market.store.me();
    [market.listings, market.mine, market.offers] = await Promise.all([market.store.list(), market.store.mine(), market.store.offers().catch(() => [])]);
    market.error = ''; market.loadedAt = Date.now();
  } catch (error) { market.error = error?.message || 'The marketplace is unavailable right now.'; }
  finally { market.loading = false; renderMarket(); }
}
const ago = iso => { const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000)); return minutes < 60 ? `${minutes} min ago` : minutes < 1440 ? `${Math.round(minutes / 60)} h ago` : `${Math.round(minutes / 1440)} d ago`; };
function listingHtml(listing) {
  const item = marketItem(listing), mine = listing.owner === market.me;
  const lines = item?.equip && listing.side === 'sell' ? statLines(listing, item) : [];
  const detail = lines.length ? `<details class="market-stats"><summary>Stats</summary><ul>${lines.map(line => `<li>${esc(line.label)} <b>${line.value}</b>${line.delta ? ` <span class="${line.delta > 0 ? 'up' : 'down'}">(${line.delta > 0 ? '+' : ''}${line.delta})</span>` : ''}</li>`).join('')}</ul>${item.reqLevel && !item.custom ? `<small>Level ${item.reqLevel}${item.job && item.job !== 'All' ? ` · ${esc(item.job)}` : ''} · ${item.slots} upgrade slot${item.slots === 1 ? '' : 's'} when clean</small>` : ''}</details>` : '';
  const report = issueUrl({ title: `Listing report: ${listing.item_name} by ${listing.ign}`, body: `Listing ${listing.id}: ${listing.side} ${listing.item_name} for ${listing.price} mesos by ${listing.ign}.\n\nWhat is wrong with it?\n`, labels: ['listing'] });
  return `<li class="market-row"${mine ? ` id="listing-${esc(listing.id)}"` : ''}><div class="market-main"><span class="pill ${listing.side === 'sell' ? 'sell' : 'buy'}">${listing.side === 'sell' ? 'Selling' : 'Buying'}</span> <strong>${esc(listing.item_name)}</strong>${listing.item_id === 'custom' ? ' <small class="pill">custom</small>' : ''}${listing.quantity > 1 ? ` ×${listing.quantity}` : ''} <span class="market-price">${formatMesos(listing.price)}${listing.quantity > 1 ? ' each' : ''}</span>
    ${item?.equip && listing.side === 'sell' && equipSummary(listing, item) ? `<div class="fine">${esc(equipSummary(listing, item))}</div>` : ''}${detail}
    <div class="fine">${esc(listing.ign)}${listing.channel ? ` · ch ${listing.channel}` : ''} · ${ago(listing.created_at)}${listing.note ? ` · “${esc(listing.note)}”` : ''}${mine ? (isExpired(listing) ? ' · <strong class="market-expired">expired: hidden from others</strong>' : ` · expires in ${daysLeft(listing)} day${daysLeft(listing) === 1 ? '' : 's'}`) : ''}</div>
    ${offersHtml(listing, mine)}</div>
    <div class="market-actions"><button type="button" class="button light" data-market-find="${esc(listing.ign)}">Copy /find</button>${mine ? `${isExpired(listing) ? `<button type="button" class="button secondary" data-market-relist="${esc(listing.id)}">Relist for 7 days</button>` : ''}<button type="button" class="button light" data-market-remove="${esc(listing.id)}">Remove</button>` : `<a class="link-button subtle" href="${esc(report)}" target="_blank" rel="noopener">Report</a>`}</div></li>`;
}
// Offers under a listing. Others' selling listings: the terms, "Make an offer" (and your offer, if
// any). Your own: the offers received with Accept / Decline, and the offer settings to change.
const offerStatus = { open: 'waiting for the seller', accepted: 'accepted', declined: 'declined' };
function offersHtml(listing, mine) {
  if (listing.side !== 'sell') return '';
  const terms = `<div class="fine market-terms">${esc(offerTerms(listing))}</div>`;
  if (!mine) {
    const own = market.offers.find(o => o.listing_id === listing.id && o.owner === market.me);
    const form = market.offerFor === listing.id ? `<div class="market-offer-form"><div class="sell-fields"><label class="field">Your offer (mesos each)<input data-offer-price inputmode="numeric" placeholder="${listing.min_offer ? `at least ${formatMesos(listing.min_offer)}` : 'e.g. 1.2m'}"></label><label class="field">Your character name<input data-offer-ign maxlength="12" value="${esc(localStorage.getItem(IGN_KEY) ?? '')}"></label></div><label class="field">Note (optional)<input data-offer-note maxlength="120" placeholder="e.g. online now, Henesys ch 3"></label><div class="action-row"><button type="button" class="button" data-offer-send="${esc(listing.id)}">Send offer</button><button type="button" class="link-button" data-offer-cancel>Cancel</button></div><p class="fine" data-offer-note-out></p></div>` : '';
    const yours = own ? `<div class="fine market-my-offer">Your offer: <b>${formatMesos(own.price)}</b> · ${offerStatus[own.status] ?? own.status}${own.status === 'accepted' ? ` · whisper <b>${esc(listing.ign)}</b> in game to trade` : ''} <button type="button" class="link-button" data-offer-remove="${esc(own.id)}">withdraw</button></div>` : '';
    const button = listing.offers_allowed !== false && !own && market.offerFor !== listing.id && !isExpired(listing) ? `<button type="button" class="link-button" data-offer-open="${esc(listing.id)}">Make an offer</button>` : '';
    return terms + yours + button + form;
  }
  const received = market.offers.filter(o => o.listing_id === listing.id).sort((a, b) => b.price - a.price);
  const rows = received.map(o => `<li class="market-offer ${o.status}"><span><b>${formatMesos(o.price)}</b>${o.quantity > 1 ? ` ×${o.quantity}` : ''} from <b>${esc(o.ign)}</b> · ${ago(o.created_at)}${o.note ? ` · “${esc(o.note)}”` : ''} · ${o.status === 'open' ? 'new' : o.status}</span>
    <span class="market-offer-actions">${o.status === 'open' ? `<button type="button" class="button secondary" data-offer-answer="${esc(o.id)}" data-status="accepted">Accept</button><button type="button" class="button light" data-offer-answer="${esc(o.id)}" data-status="declined">Decline</button>` : ''}<button type="button" class="button light" data-market-find="${esc(o.ign)}">Copy /find</button><button type="button" class="link-button" data-offer-remove="${esc(o.id)}">clear</button></span></li>`).join('');
  const settings = `<div class="market-offer-edit"><label class="toggle"><input type="checkbox" data-offer-allowed="${esc(listing.id)}"${listing.offers_allowed !== false ? ' checked' : ''}> Accept offers</label><label class="field">Lowest offer<input data-offer-min="${esc(listing.id)}" inputmode="numeric" value="${listing.min_offer ? esc(String(listing.min_offer)) : ''}" placeholder="any"${listing.offers_allowed === false ? ' disabled' : ''}></label><button type="button" class="link-button" data-offer-save="${esc(listing.id)}">save</button></div>`;
  return terms + (rows ? `<ul class="market-offers">${rows}</ul>` : '<div class="fine">No offers yet.</div>') + settings;
}
// The bell: what needs you in the Market (offers waiting, answers to your offers, expired or ending
// listings), on the Market tab link and as a list at the top of the Market.
const SEEN_KEY = 'maple-route-market-seen';
const seenAlerts = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { return []; } };
function renderOfferBadge() {
  const alerts = marketAlerts({ mine: market.mine ?? [], offers: market.offers ?? [], listings: market.listings ?? [], me: market.me, seen: seenAlerts() });
  const link = document.querySelector('.top-link[href="#market"]');
  if (link) link.innerHTML = alerts.length ? `Market <span class="market-bell" title="${alerts.length} thing${alerts.length === 1 ? '' : 's'} need you in the Market">🔔 ${alerts.length}</span>` : 'Market';
  const box = $('#market-alerts'); if (!box) return;
  const action = a => a.kind === 'offer' ? `<button type="button" class="button secondary" data-alert-view="${esc(a.listingId)}">View</button>`
    : a.kind === 'accepted' ? `${a.ign ? `<button type="button" class="button secondary" data-market-find="${esc(a.ign)}">Copy /find</button>` : ''}<button type="button" class="link-button" data-alert-dismiss="${esc(a.id)}">OK</button>`
    : a.kind === 'declined' ? `<button type="button" class="link-button" data-alert-dismiss="${esc(a.id)}">OK</button>`
    : a.kind === 'expired' ? `<button type="button" class="button secondary" data-market-relist="${esc(a.listingId)}">Relist</button><button type="button" class="button light" data-market-remove="${esc(a.listingId)}">Remove</button>`
    : `<button type="button" class="button light" data-market-relist="${esc(a.listingId)}">Relist now</button>`;
  box.innerHTML = alerts.length ? `<div class="market-alerts"><strong>🔔 Needs your attention</strong><ul>${alerts.map(a => `<li class="alert-${a.kind}"><span>${esc(a.text)}</span><span class="market-offer-actions">${action(a)}</span></li>`).join('')}</ul></div>` : '';
}
// Checks the Market in the background every 2 minutes, but only for players who have used it.
async function refreshMarketAlerts() {
  if (market.loading || !market.store.hasSession?.()) return;
  try {
    market.me ??= await market.store.me();
    [market.listings, market.mine, market.offers] = await Promise.all([market.store.list(), market.store.mine(), market.store.offers().catch(() => [])]);
    if (document.querySelector('.view-market:not(.hidden)')) renderMarket(); else renderOfferBadge();
  } catch { /* offline or busy: try again next time */ }
}
setTimeout(refreshMarketAlerts, 4000); setInterval(refreshMarketAlerts, 120_000);

function renderMarket() {
  if (!$('#market-list')) return;
  $('#market-mode').textContent = market.store.shared ? 'Shared with all players' : 'Practice: only on this PC';
  if (market.error) { $('#market-list').innerHTML = `<p class="fine">${esc(market.error)} <button type="button" class="link-button" data-market-refresh>Try again</button></p>`; return; }
  if (market.loading && !market.listings.length) { $('#market-list').innerHTML = '<p class="fine">Loading listings…</p>'; return; }
  const stat = $('#market-stat').value, statMin = Number($('#market-stat-min').value) || 0, slots = $('#market-slots').value === '' ? null : Number($('#market-slots').value), max = $('#market-max').value.trim() ? parseMesos($('#market-max').value) : null;
  const num = id => $(id).value === '' ? null : Number($(id).value);
  const filters = { category: $('#market-category').value, type: $('#market-type').value, job: $('#market-job').value, minLevel: num('#market-level-min'), maxLevel: num('#market-level-max'), minSuccess: num('#market-success'), minStats: stat ? { [stat]: statMin } : {}, minSlots: slots, maxPrice: Number.isFinite(max) ? max : null };
  const active = Object.values(filters).filter(value => value !== '' && value != null && !(typeof value === 'object' && !Object.keys(value).length)).length;
  $('#market-filter-count').textContent = active ? `(${active} on)` : '';
  const shown = sortListings(filterListings(market.listings, { query: $('#market-query').value, side: $('#market-side').value, ...filters, itemOf: marketItem }), $('#market-sort').value);
  const ids = [...new Set(shown.map(l => l.item_id))];
  const book = ids.length === 1 ? priceBook(market.listings, ids[0]) : null;
  const chat = book ? summarizePrices(state.prices, shown[0].item_name, priceNamer()).find(row => normalize(row.item) === normalize(shown[0].item_name)) : null;
  const chatText = chat?.sell || chat?.buy ? ` · trade chat: ${chat.sell ? `asking about ${formatMesos(chat.sell.median)} (${chat.sell.count} ad${chat.sell.count === 1 ? '' : 's'})` : ''}${chat.sell && chat.buy ? ', ' : ''}${chat.buy ? `buying about ${formatMesos(chat.buy.median)}` : ''}` : '';
  $('#market-book').innerHTML = book ? `<p class="fine"><strong>${esc(shown[0].item_name)}:</strong> lowest asking ${book.lowestAsk ? formatMesos(book.lowestAsk) : '—'} (${book.sells} selling) · highest offer ${book.highestBid ? formatMesos(book.highestBid) : '—'} (${book.buys} buying)${esc(chatText)}</p>` : '';
  $('#market-list').innerHTML = shown.length ? `<ul class="market-rows">${shown.slice(0, 100).map(listingHtml).join('')}</ul>${shown.length > 100 ? `<p class="fine">${shown.length - 100} more: narrow the search.</p>` : ''}`
    : `<p class="fine">${market.listings.length ? 'No listings match.' : 'No listings yet. Be the first: list an item below.'} <button type="button" class="link-button" data-market-refresh>Refresh</button></p>`;
  // Your listings: live ones with the days left, expired ones (hidden from everyone else) to relist or remove.
  const mine = market.mine ?? [];
  renderOfferBadge();
  // Offers you made, with the seller's answer.
  const made = market.offers.filter(o => o.owner === market.me);
  $('#market-my-offers').innerHTML = made.length ? `<ul class="market-offers">${made.map(o => { const l = market.listings.find(x => x.id === o.listing_id);
    return `<li class="market-offer ${o.status}"><span><b>${formatMesos(o.price)}</b> for ${esc(l?.item_name ?? 'a listing that has ended')}${l ? ` from <b>${esc(l.ign)}</b>` : ''} · ${offerStatus[o.status] ?? o.status}${o.status === 'accepted' && l ? ' · whisper them in game to trade' : ''}</span><span class="market-offer-actions">${o.status === 'accepted' && l ? `<button type="button" class="button secondary" data-market-find="${esc(l.ign)}">Copy /find</button>` : ''}<button type="button" class="link-button" data-offer-remove="${esc(o.id)}">${o.status === 'open' ? 'withdraw' : 'clear'}</button></span></li>`; }).join('')}</ul>` : '<p class="fine">No offers made. Use "Make an offer" on a listing that takes offers.</p>';
  $('#market-mine').innerHTML = mine.length ? `<ul class="market-rows">${mine.map(listingHtml).join('')}</ul>` : '<p class="fine">Nothing listed. Listings stay up for 7 days; remove one when the item is gone, or relist it when it expires.</p>';
}
// The item picked for a new listing: its clean stats, and for selling equipment, fields for the real ones.
function renderMarketItem() {
  const item = market.item, box = $('#market-item-card'), side = document.querySelector('input[name="market-post-side"]:checked')?.value;
  if (!item) { box.innerHTML = ''; return; }
  const unsure = item.unsure ? '<p class="fine market-expired">Only list it if the game lets you trade it (cash items and some others cannot be traded).</p>' : '';
  const base = unsure + (item.custom ? '<p class="fine">Custom item: not in the game\'s item list. If it is equipment, add its stats and slots (all optional).</p>' : item.equip ? `<p class="fine">${esc(item.type || item.category)}${item.reqLevel ? ` · Level ${item.reqLevel}` : ''}${item.job && item.job !== 'All' ? ` · ${esc(item.job)}` : ''} · ${item.slots} upgrade slot${item.slots === 1 ? '' : 's'} clean${Object.keys(item.base).length ? ` · clean stats: ${STATS.filter(([k]) => item.base[k]).map(([k, label]) => `${label} ${item.base[k]}`).join(', ')}` : ''}</p>` : `<p class="fine">${esc(item.category === 'Consumable' ? 'Use' : item.category)}${item.type ? ` · ${esc(item.type)}` : ''}${item.success != null ? ` · ${item.success}% success` : ''}</p>`);
  const fields = item.equip && side === 'sell' ? `<p class="fine">${item.custom ? 'Its stats, if any:' : 'Enter the item\'s stats as they are now (they start at the clean values):'}</p><div class="market-stat-grid">${STATS.map(([key, label]) => `<label class="field">${label}<input type="number" data-market-stat="${key}" value="${item.base[key] ?? ''}" placeholder="0"></label>`).join('')}</div>
    <div class="sell-fields"><label class="field">Upgrade slots left<input id="market-slots-left" type="number" min="0" max="${item.custom ? 20 : item.slots + 2}" value="${item.custom ? '' : item.slots}" placeholder="${item.custom ? 'optional' : ''}"></label><label class="field">Scrolls passed<input id="market-scrolled" type="number" min="0" max="${item.custom ? 20 : item.slots + 2}" value="${item.custom ? '' : 0}" placeholder="${item.custom ? 'optional' : ''}"></label></div>` : '';
  box.innerHTML = `<div class="market-item"><strong>${esc(item.name)}</strong>${base}${fields}</div><div id="market-suggest-price"></div>`;
  renderPriceSuggestion();
}
// A suggested price for the item being listed: live listings, your trade-chat log, the shop price.
function renderPriceSuggestion() {
  const box = $('#market-suggest-price'), item = market.item; if (!box || !item) return;
  const side = document.querySelector('input[name="market-post-side"]:checked')?.value ?? 'sell';
  if (state.itemCatalogStatus === 'idle') ensureItemCatalog().then(renderPriceSuggestion);
  const chat = summarizePrices(state.prices, item.name, priceNamer()).find(row => normalize(row.item) === normalize(item.name));
  const shop = (state.items ?? []).find(i => i.id === item.id)?.npcPrice ?? null;
  const tip = suggestPrice({ side, chat, book: item.custom ? null : priceBook(market.listings, item.id), shop });
  box.innerHTML = tip ? `<p class="fine market-suggestion">Suggested ${side === 'sell' ? 'price' : 'offer'}: <b>${tip.price.toLocaleString()} mesos</b> <button type="button" class="link-button" data-use-price="${tip.price}">use it</button><br><small>Because ${esc(tip.basis.join('; '))}.${item.equip && !item.custom ? ' Better stats or more slots left are worth more.' : ''}</small></p>`
    : '<p class="fine">No price data for this item yet: check trade chat, or look it up in the Market.</p>';
}
// Item box: a dropdown of matching game items (arrow keys + Enter), and always a custom item option.
function renderItemSuggest() {
  const list = $('#market-item-suggest'), text = $('#market-item').value.trim();
  const found = market.catalog ? searchItems(market.catalog, text, 30) : [];
  // A game item that cannot be traded is never offered, not even typed in as a custom item.
  const blocked = market.catalog?.find(item => item.tradeable === false && normalize(item.name) === normalize(text));
  const custom = blocked ? null : customItem(text);
  const options = [...found.map(item => ({ id: item.id, html: `${esc(item.name)} <small>${esc(item.equip ? `${item.type || 'Equip'}${item.reqLevel ? ` · Lv ${item.reqLevel}` : ''}` : item.category)}</small>` })),
    ...(custom && !found.some(item => item.name.toLowerCase() === text.toLowerCase()) ? [{ id: 'custom', html: `<span class="market-custom">Custom item:</span> “${esc(custom.name)}” <small>not in the item list</small>` }] : [])];
  market.active = Math.min(market.active, Math.max(0, options.length - 1));
  list.innerHTML = blocked && !options.length ? `<li class="market-suggest-note">${esc(blocked.name)} cannot be traded in game, so it cannot be listed.</li>` : !market.catalog && text ? '<li class="market-suggest-note">Loading the item list…</li>'
    : options.map((option, i) => `<li role="option" id="market-opt-${i}" class="${i === market.active ? 'active' : ''}" aria-selected="${i === market.active}" data-market-pick="${esc(option.id)}">${option.html}</li>`).join('');
  list.hidden = !text || !list.innerHTML; $('#market-item').setAttribute('aria-expanded', String(!list.hidden));
  if (!list.hidden) list.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
}
function pickMarketItem(id) {
  const typed = $('#market-item').value, blocked = market.catalog?.some(item => item.tradeable === false && normalize(item.name) === normalize(typed));
  market.item = id === 'custom' ? (blocked ? null : customItem(typed)) : market.byId.get(id) ?? null;
  if (market.item) $('#market-item').value = market.item.name;
  $('#market-item-suggest').hidden = true; $('#market-item').setAttribute('aria-expanded', 'false');
  renderMarketItem();
}
$('#market-item').addEventListener('input', () => { market.active = 0; market.item = null; renderMarketItem(); if (!market.catalog) loadMarket().then(renderItemSuggest); renderItemSuggest(); });
$('#market-item').addEventListener('focus', () => { if ($('#market-item').value.trim() && !market.item) renderItemSuggest(); });
$('#market-item').addEventListener('keydown', event => {
  const options = [...document.querySelectorAll('#market-item-suggest [data-market-pick]')];
  if (!options.length || $('#market-item-suggest').hidden) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); market.active = (market.active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length; renderItemSuggest(); }
  else if (event.key === 'Enter') { event.preventDefault(); pickMarketItem(options[market.active]?.dataset.marketPick); }
  else if (event.key === 'Escape') { $('#market-item-suggest').hidden = true; }
});
document.addEventListener('pointerdown', event => { if (!event.target.closest('.market-combo')) $('#market-item-suggest').hidden = true; });
// Filter choices: categories, jobs and sorts are fixed; types follow the chosen category.
for (const [value, label] of SORTS) $('#market-sort').insertAdjacentHTML('beforeend', `<option value="${value}">${label}</option>`);
for (const [value, label] of CATEGORIES) $('#market-category').insertAdjacentHTML('beforeend', `<option value="${value}">${label}</option>`);
for (const [value, label] of JOBS) $('#market-job').insertAdjacentHTML('beforeend', `<option value="${value}">${label}</option>`);
function fillTypes() {
  const types = market.facets?.[$('#market-category').value] ?? [], select = $('#market-type'), keep = select.value;
  select.innerHTML = '<option value="">Any type</option>' + types.map(type => `<option value="${esc(type)}">${esc(type)}</option>`).join('');
  select.value = types.includes(keep) ? keep : ''; select.disabled = !types.length;
}
$('#market-category').addEventListener('change', () => { fillTypes(); renderMarket(); });
$('#market-clear').addEventListener('click', () => {
  for (const id of ['#market-category', '#market-type', '#market-job', '#market-level-min', '#market-level-max', '#market-stat', '#market-stat-min', '#market-slots', '#market-success', '#market-max']) $(id).value = '';
  fillTypes(); renderMarket();
});
for (const id of ['#market-query', '#market-side', '#market-sort', '#market-type', '#market-job', '#market-level-min', '#market-level-max', '#market-stat', '#market-stat-min', '#market-slots', '#market-success', '#market-max']) $(id).addEventListener('input', renderMarket);
const offerSettingsShown = () => { $('#market-offer-settings').hidden = document.querySelector('input[name="market-post-side"]:checked')?.value !== 'sell'; $('#market-min-offer').disabled = !$('#market-offers').checked; };
document.querySelectorAll('input[name="market-post-side"]').forEach(radio => radio.addEventListener('change', () => { renderMarketItem(); offerSettingsShown(); }));
document.addEventListener('click', event => {
  const use = event.target.closest('[data-use-price]'); if (use) { $('#market-price').value = Number(use.dataset.usePrice).toLocaleString(); $('#market-price').focus(); }
  const search = event.target.closest('[data-market-search]'); if (search) { $('#market-query').value = search.dataset.marketSearch; setTimeout(renderMarket, 50); }
});
$('#market-offers').addEventListener('change', offerSettingsShown);
// Reads the hovered item's tooltip off the shared game screen (the whole frame, then the catalog
// names and "STR : +3" lines in it). Nothing is sent anywhere: the picture is read on this PC.
async function readItemFromScreen(note) {
  const live = state.live;
  if (!live || live.paused) { note('Start Live GPS first: the item is read from the same shared game window.'); return null; }
  if (!market.catalog) await loadMarket(true);
  if (!market.catalog) { note('The item list is unavailable right now.'); return null; }
  // You cannot hover an item and press this button at once: count down, then read.
  for (let left = 3; left > 0; left--) { note(`Hover the item in game now so its tooltip shows… reading in ${left}`); await new Promise(resolve => setTimeout(resolve, 1000)); }
  note('Reading the screen… (a few seconds)');
  let worker = null;
  try {
    const grabbed = await live.capture.grab();
    worker = await createOcrWorker();
    // The top four fifths: the bottom of the screen is chat and the status bars, never the tooltip you want.
    const crop = document.createElement('canvas'); crop.width = grabbed.width; crop.height = Math.round(grabbed.height * .8);
    crop.getContext('2d').drawImage(grabbed.source, 0, 0, crop.width, crop.height, 0, 0, crop.width, crop.height);
    // Your own copy only (dev server): keep the exact picture read, so tooltip reading can be tuned.
    if (import.meta.env.DEV && isLocalHost()) fetch('/__live-log', { method: 'POST', body: JSON.stringify({ kind: 'item-frame', t: new Date().toISOString().slice(11, 19), image: crop.toDataURL('image/jpeg', .85) }) }).catch(() => {});
    const text = await readWholeFrame(worker, crop, crop.width, crop.height);
    const read = parseTooltip(text, market.catalog);
    logTest('item-read', { item: read.item?.name ?? null, stats: read.stats, slotsLeft: read.slotsLeft, candidates: read.candidates.map(i => i.name), text: text.slice(0, 1500) });
    if (!read.item) { note('No item name found on screen. Hover the item so its tooltip shows, then try again.'); return null; }
    return read;
  } catch { note('Could not read the screen right now.'); return null; }
  finally { try { await worker?.terminate(); } catch { /* already gone */ } }
}
$('#market-read').addEventListener('click', async () => {
  const note = text => { $('#market-read-note').innerHTML = text; };
  $('#market-read').disabled = true;
  const read = await readItemFromScreen(note);
  $('#market-read').disabled = false;
  if (!read) return;
  document.querySelector('input[name="market-post-side"][value="sell"]').checked = true; offerSettingsShown();
  market.item = read.item; $('#market-item').value = read.item.name; renderMarketItem();
  for (const [key, value] of Object.entries(read.stats)) { const input = document.querySelector(`[data-market-stat="${key}"]`); if (input) input.value = value; }
  if (read.slotsLeft != null && $('#market-slots-left')) $('#market-slots-left').value = read.slotsLeft;
  const statText = Object.entries(read.stats).map(([key, value]) => `${STATS.find(([k]) => k === key)?.[1]} ${value}`).join(', ');
  const others = read.candidates.slice(1).map(item => `<button type="button" class="link-button" data-market-pick="${esc(item.id)}">${esc(item.name)}</button>`).join(', ');
  note(`Read <b>${esc(read.item.name)}</b>${statText ? `: ${esc(statText)}` : ''}${read.slotsLeft != null ? `, ${read.slotsLeft} slots left` : ''}. Check everything before posting.${others ? ` Not it? ${others}` : ''}`);
});
$('#market-search-read').addEventListener('click', async () => {
  const button = $('#market-search-read'), label = button.textContent;
  const read = await readItemFromScreen(text => { button.textContent = text.length > 60 ? `${text.slice(0, 57)}…` : text; });
  setTimeout(() => { button.textContent = label; }, read ? 0 : 4000);
  if (read) { $('#market-query').value = read.item.name; renderMarket(); }
});

$('#market-post').addEventListener('click', async () => {
  const note = text => { $('#market-post-note').textContent = text; };
  const stats = {}; document.querySelectorAll('[data-market-stat]').forEach(input => { if (input.value !== '') stats[input.dataset.marketStat] = input.value; });
  const { listing, errors } = checkListing({ side: document.querySelector('input[name="market-post-side"]:checked')?.value, price: $('#market-price').value, quantity: $('#market-qty').value, ign: $('#market-ign').value, channel: $('#market-channel').value, note: $('#market-note').value, offersAllowed: $('#market-offers').checked, minOffer: $('#market-min-offer').value, stats, slotsLeft: $('#market-slots-left')?.value, scrolled: $('#market-scrolled')?.value }, market.item);
  if (errors) { note(errors.join(' ')); return; }
  try { localStorage.setItem(IGN_KEY, listing.ign); } catch { /* storage blocked */ }
  $('#market-post').disabled = true; note('Posting…');
  try { await market.store.add(listing); note(`Listed: ${listing.item_name} for ${formatMesos(listing.price)}.`); $('#market-price').value = ''; $('#market-note').value = ''; await loadMarket(true); }
  catch (error) { note(error?.message || 'Could not post that right now.'); }
  finally { $('#market-post').disabled = false; }
});
document.addEventListener('change', event => {
  const allowed = event.target.closest('[data-offer-allowed]'); if (allowed) { const min = document.querySelector(`[data-offer-min="${CSS.escape(allowed.dataset.offerAllowed)}"]`); if (min) min.disabled = !allowed.checked; }
});
document.addEventListener('click', async event => {
  const pick = event.target.closest('[data-market-pick]');
  if (pick) { pickMarketItem(pick.dataset.marketPick); return; }
  const find = event.target.closest('[data-market-find]');
  if (find) { const text = findCommand(find.dataset.marketFind); try { await navigator.clipboard.writeText(text); find.textContent = 'Copied'; setTimeout(() => { find.textContent = 'Copy /find'; }, 1500); } catch { find.textContent = text; } return; }
  const remove = event.target.closest('[data-market-remove]');
  if (remove) { remove.disabled = true; try { await market.store.remove(remove.dataset.marketRemove); } catch { /* shown on refresh */ } await loadMarket(true); return; }
  // Offers
  const openOffer = event.target.closest('[data-offer-open]');
  if (openOffer) { market.offerFor = openOffer.dataset.offerOpen; renderMarket(); document.querySelector('[data-offer-price]')?.focus(); return; }
  if (event.target.closest('[data-offer-cancel]')) { market.offerFor = null; renderMarket(); return; }
  const send = event.target.closest('[data-offer-send]');
  if (send) {
    const form = send.closest('.market-offer-form'), out = form.querySelector('[data-offer-note-out]'), listing = market.listings.find(l => l.id === send.dataset.offerSend);
    const { offer, errors } = checkOffer({ price: form.querySelector('[data-offer-price]').value, ign: form.querySelector('[data-offer-ign]').value, note: form.querySelector('[data-offer-note]').value }, listing, { me: market.me });
    if (errors) { out.textContent = errors.join(' '); return; }
    try { localStorage.setItem(IGN_KEY, offer.ign); } catch { /* storage blocked */ }
    send.disabled = true; out.textContent = 'Sending…';
    try { await market.store.makeOffer(offer); market.offerFor = null; await loadMarket(true); }
    catch (error) { send.disabled = false; out.textContent = /lowest|not taking|not open|own listing|too many/i.test(error?.message ?? '') ? error.message : 'Could not send that offer right now.'; }
    return;
  }
  const answer = event.target.closest('[data-offer-answer]');
  if (answer) { answer.disabled = true; try { await market.store.answerOffer(answer.dataset.offerAnswer, answer.dataset.status); } catch { /* shown on refresh */ } await loadMarket(true); return; }
  const view = event.target.closest('[data-alert-view]');
  if (view) { document.getElementById(`listing-${view.dataset.alertView}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  const dismiss = event.target.closest('[data-alert-dismiss]');
  if (dismiss) { try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seenAlerts(), dismiss.dataset.alertDismiss].slice(-200))); } catch { /* storage blocked */ } renderMarket(); return; }
  const removeOffer = event.target.closest('[data-offer-remove]');
  if (removeOffer) { removeOffer.disabled = true; try { await market.store.removeOffer(removeOffer.dataset.offerRemove); } catch { /* shown on refresh */ } await loadMarket(true); return; }
  const save = event.target.closest('[data-offer-save]');
  if (save) {
    const id = save.dataset.offerSave, listing = market.mine.find(l => l.id === id), allowed = document.querySelector(`[data-offer-allowed="${CSS.escape(id)}"]`).checked;
    const minText = document.querySelector(`[data-offer-min="${CSS.escape(id)}"]`).value.trim(), min = allowed && minText ? parseMesos(minText) : null;
    if (min !== null && (!Number.isFinite(min) || min < 1 || min > listing.price)) { save.textContent = 'lowest offer must be up to your price'; return; }
    save.textContent = 'saving…';
    try { await market.store.setOfferSettings(id, { offers_allowed: allowed, min_offer: min }); } catch { /* shown on refresh */ }
    await loadMarket(true); return;
  }
  // Relist: post it again for a fresh 7 days (the old copy is removed). Only ever done by the owner pressing it.
  const relist = event.target.closest('[data-market-relist]');
  if (relist) {
    const old = market.mine.find(l => String(l.id) === relist.dataset.marketRelist); if (!old) return;
    relist.disabled = true; relist.textContent = 'Relisting…';
    try { await market.store.add(relistCopy(old)); await market.store.remove(old.id); } catch (error) { $('#market-post-note').textContent = error?.message || 'Could not relist that right now.'; }
    await loadMarket(true); return;
  }
  if (event.target.closest('[data-market-refresh]')) loadMarket(true);
});

$('#live-start').addEventListener('click', startLive);
function renderCharacters() {
  const panel = $('#characters'); if (!panel) return;
  const current = character(), list = [...new Set(['', ...characters(), current])];
  panel.innerHTML = `<p>Playing as <strong>${esc(current || 'Main character')}</strong></p><div class="data-actions">${list.filter(name => name !== current).map(name => `<button type="button" class="button light" data-character="${esc(name)}">Switch to ${esc(name || 'Main character')}</button>`).join('')}</div>
    <label class="field">New character<input id="character-name" maxlength="24" placeholder="Character name"></label><button type="button" class="button secondary" data-character-new>Add and switch</button>`;
}
renderCharacters();
// Anonymous usage counts (public site only; see src/usage.js), with a switch to opt out.
startCounting({ local: isLocalHost() });
if (GOATCOUNTER_CODE && !isLocalHost()) {
  $('#usage-note').innerHTML = `The public site counts, anonymously and without cookies, only that the app was opened and that Live GPS was started (GoatCounter), so the author knows it is used. Nothing read from your game is ever sent. <label class="toggle"><input type="checkbox" id="usage-optout"${countingOptedOut() ? ' checked' : ''}> Don't count my visits</label>`;
  $('#usage-optout').addEventListener('change', event => setCountingOptOut(event.target.checked));
}
renderVoicePicker();
$('#voice-parts').innerHTML = Object.entries(VOICE_PARTS).map(([key, label]) => `<label class="toggle"><input type="checkbox" data-voice-part="${key}"${(state.voiceParts?.[key] ?? !VOICE_DEFAULT_OFF.has(key)) ? ' checked' : ''}> ${esc(label)}</label>`).join('');
$('#voice-parts').addEventListener('change', event => { const key = event.target.dataset.voicePart; if (!key) return; state.voiceParts = { ...(state.voiceParts ?? {}), [key]: event.target.checked }; saveLive(); });
if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', renderVoicePicker);
$('#voice-name').addEventListener('change', event => { state.voiceName = event.target.value || null; saveLive(); say('This map has Orange Mushroom and Blue Snail.'); });
$('#voice-rate').addEventListener('change', event => { state.voiceRate = Number(event.target.value) || 1; saveLive(); say('Head right, about two screens.'); });
$('#voice-test').addEventListener('click', () => say('Welcome to Henesys. Talk to Pia to start Pia and the Blue Mushroom.'));
// The open-with-MapleStory switch lives in the local server; hidden when the server has no such switch.
(isLocalHost() ? fetch('/__autostart') : Promise.resolve(null)).then(r => r.ok ? r.json() : null).then(status => {
  if (!status) return;
  $('#autostart-card').hidden = false; $('#autostart').checked = status.enabled;
  $('#autostart').addEventListener('change', async event => {
    try { const r = await fetch('/__autostart', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: event.target.checked }) }); event.target.checked = (await r.json()).enabled; }
    catch { event.target.checked = !event.target.checked; }
  });
}).catch(() => {});
$('#characters').addEventListener('click', event => {
  const pick = event.target.closest('[data-character]'); if (pick) { switchCharacter(pick.dataset.character); return; }
  if (event.target.closest('[data-character-new]')) { const name = $('#character-name').value.trim(); if (name) switchCharacter(name); }
});
$('#choose-destination').addEventListener('click', () => reveal('#plan-title'));

function lastShareText() {
  try {
    const last = JSON.parse(localStorage.getItem('maple-route-last-share') || 'null');
    if (!last) return '';
    const what = last.surface === 'monitor' ? `the screen ${last.width && last.height ? `that is ${last.width}×${last.height}` : 'you shared'}` : last.surface === 'window' ? 'the same game window' : 'the same source';
    return `<p class="fine">Last time you shared ${esc(what)}. The Maple Route desktop shortcut picks it for you automatically.</p>`;
  } catch { return ''; }
}

// Ask for the screen share as soon as the page opens. Browsers only open the picker from a click, so
// this is a one-click prompt; until sharing starts, positions shown are the last known ones.
{
  const ask = document.createElement('div');
  ask.className = 'share-ask'; ask.setAttribute('role', 'dialog'); ask.setAttribute('aria-modal', 'true'); ask.setAttribute('aria-labelledby', 'share-ask-title');
  ask.innerHTML = `<div class="share-ask-card"><div class="eyebrow">Live GPS</div><h2 id="share-ask-title">Share your game screen</h2>
    <p>Maple Route reads your mini map to know where you are. Pick the <strong>MapleStory window</strong> (best: the pop-out can then sit right over the mini map without blocking it) or Entire screen. Everything stays on this computer.</p>${lastShareText()}
    <div class="action-row"><button type="button" class="button" id="share-ask-go">Share screen</button><button type="button" class="button light" id="share-ask-later">Not now</button></div></div>`;
  document.body.append(ask);
  const close = () => ask.remove();
  ask.querySelector('#share-ask-go').addEventListener('click', () => { close(); startLive(); });
  ask.querySelector('#share-ask-later').addEventListener('click', close);
  ask.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  ask.querySelector('#share-ask-go').focus();
}
$('#live-stop').addEventListener('click', stopLive);
$('#live-pip').addEventListener('click', openPip);
$('#live-voice').addEventListener('change', event => { state.voice = event.target.checked; saveLive(); if (!state.voice) speechSynthesis?.cancel?.(); });
setLiveUi(); liveState('Off');

// ---------- Live tools: status bars, EXP, Quest Helper, trade chat ----------
const PRICE_KEY = 'maple-route-prices';
state.hud = { bars: null, status: null, level: null, tracker: null, quest: null, turnIn: null, full: {}, spokenTurnIn: null };
try { state.prices = JSON.parse(localStorage.getItem(PRICE_KEY) || '[]'); if (!Array.isArray(state.prices)) state.prices = []; } catch { state.prices = []; }
const savePrices = () => { try { localStorage.setItem(PRICE_KEY, JSON.stringify(state.prices.slice(0, 2000))); } catch { /* storage full */ } };

// Brightness thumbnails of the Quest Helper / chat: changed when the average difference is visible.
function hudChanged(a, b) {
  if (!a || !b || a.length !== b.length) return true;
  let total = 0; for (let i = 0; i < a.length; i++) total += Math.abs(a[i] - b[i]);
  return total / a.length > 6;
}

function hudSignature(image) {
  const cols = 48, rows = 12, out = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = Math.floor((c + .5) * image.width / cols), y = Math.floor((r + .5) * image.height / rows), i = (y * image.width + x) * 4;
    out[r * cols + c] = image.data[i] * .299 + image.data[i + 1] * .587 + image.data[i + 2] * .114;
  }
  return out;
}

// Bar fill relative to the longest bar seen at this spot: if the empty part of HP/MP is drawn in a colour
// the reader does not count as track, the remembered full length still gives the right fraction.
function barFraction(kind, bar) {
  const known = state.hud.full[kind];
  const full = known && Math.abs(known.x0 - bar.x0) <= 3 ? Math.max(known.length, bar.length) : bar.length;
  state.hud.full[kind] = { x0: bar.x0, length: full };
  return Math.min(1, bar.fillLength / full);
}

// Bar fill fractions for the status strip (no warnings: those would be playing for you).
function updateFractions(bars) {
  state.hud.fractions = { hp: barFraction('hp', bars.hp), mp: barFraction('mp', bars.mp), exp: bars.exp.fill };
}

// Status bars, Quest Helper and chat are read in their own loop with their own text reader, so a
// map change is never kept waiting behind them.
async function hudLoop() {
  const live = state.live;
  if (!live || live.paused || live.hudBusy) return;
  live.hudBusy = true;
  let grabbed = null;
  try {
    live.hudWorker ??= await createOcrWorker();
    grabbed = await live.capture.grab();
    await hudTick(live, grabbed, false);
  } catch (error) {
    logTest('hud-error', { message: String(error?.message ?? error) });
    if (error?.message === 'OCR timeout') { live.hudWorker?.terminate?.(); live.hudWorker = null; }
  } finally { grabbed?.release(); live.hudBusy = false; }
}

async function hudTick(live, grabbed, ocrUsed) {
  const { source, width, height } = grabbed, bottomY = Math.floor(height * .8);
  // The status bars do not move: read only their rows once found; rescan the bottom strip if lost.
  let bars = null;
  if (live.barsRect) { const r = live.barsRect; bars = findStatusBars(regionImage(source, r), { offsetY: r.y, offsetX: r.x }); }
  let bottomImage = null;
  const bottom = () => bottomImage ??= regionImage(source, { x: 0, y: bottomY, w: width, h: height - bottomY });
  if (!bars) bars = findStatusBars(bottom(), { offsetY: bottomY });
  live.barsRect = bars ? { x: Math.max(0, bars.hp.x0 - 20), y: Math.max(0, bars.y0 - 4), w: Math.min(width, bars.exp.x1 + 20) - Math.max(0, bars.hp.x0 - 20), h: bars.y1 - bars.y0 + 9 } : null;
  state.hud.bars = bars;
  if (!bars && !(live.jobs.noBarsLogged > Date.now() - 10_000)) { live.jobs.noBarsLogged = Date.now(); logTest('no-status-bars', { frame: `${width}x${height}` }); }
  if (bars) updateFractions(bars);
  if (ocrUsed) return;
  const now = Date.now(), due = (job, every) => now - (live.jobs[job] ?? 0) > every;
  if (now - (live.mapChangedAt ?? 0) < 1500) return; // let the new map settle first
  const settings = OCR_SETTINGS;
  if (bars && state.tools.exp && due('status', 5000)) {
    live.jobs.status = now;
    if (due('level', 30_000)) {
      live.jobs.level = now;
      const level = parseLevel(await readRegion(live.hudWorker, source, levelRect(bars), { ink: image => inkTitle(image, settings.level.threshold), scale: settings.level.scale, psm: 7, whitelist: '0123456789' }));
      if (level) { state.hud.level = level; if (level !== state.level && level >= state.level) { state.level = level; persist(); } }
      // Who is playing: offer the matching character profile (switching reloads, so it is your call).
      const name = parseName(await readRegion(live.hudWorker, source, nameRect(bars), { ink: image => inkTitle(image, 170), scale: 3, psm: 6 }));
      if (name) { state.hud.characterSeen = (state.hud.characterName === name ? (state.hud.characterSeen ?? 0) : 0) + 1; state.hud.characterName = name; logTest('character', { name }); }
    }
    const parsed = parseStatusText(await readRegion(live.hudWorker, source, statusTextRect(bars), { ink: image => inkTitle(image, settings.status.threshold), scale: settings.status.scale, psm: 7 }));
    state.hud.status = parsed; logTest('status', { level: state.hud.level, hp: parsed.hp && `${parsed.hp.now}/${parsed.hp.max}`, mp: parsed.mp && `${parsed.mp.now}/${parsed.mp.max}`, exp: parsed.exp && `${parsed.exp.value} ${parsed.exp.percent}%`, bars: bars && `hp ${bars.hp.fill.toFixed(2)} mp ${bars.mp.fill.toFixed(2)} exp ${bars.exp.fill.toFixed(3)}` });
    if (parsed.exp) {
      live.tracker ??= createExpTracker(now);
      live.tracker = addExpReading(live.tracker, { ...parsed.exp, barFill: bars.exp.fill, level: state.hud.level, mapId: state.current }, now).tracker;
      state.hud.tracker = live.tracker; renderLiveExp();
    }
    return;
  }
  // The quest window open on the Available or Completed tab: read its list whenever it changes.
  if (state.tools.quest && state.questCatalogStatus === 'loaded' && due('questwin', 4000) && now > (live.questWinQuietUntil ?? 0)) {
    live.jobs.questwin = now;
    const win = findQuestWindow(regionImage(source, { x: 0, y: 0, w: width, h: height }));
    if (win && (win.tab === 'available' || win.tab === 'completed')) {
      const sig = quickSignature(regionImage(source, win.list));
      // Read again only when the list really changed (scrolled, a town opened, another tab).
      if (win.tab !== live.questWinTab || listChange(sig, live.questWinSig) > .06) {
        live.questWinSig = sig; live.questWinTab = win.tab;
        const found = applyQuestWindow(win.tab, await readRegion(live.hudWorker, source, win.list, { scale: 2, ink: inkQuestList }), { auto: true });
        // Nothing that looks like a quest: another window with a red tab line (Character Stat…).
        if (!found) live.questWinQuietUntil = now + 30_000;
        return;
      }
    }
  }
  if (state.tools.quest && due('helper', 6000)) {
    live.jobs.helper = now;
    const right = Math.floor(width * .6), corner = regionImage(source, { x: right, y: 0, w: width - right, h: Math.floor(height * .45) });
    const helper = findQuestHelper(corner);
    if (!helper) { state.hud.quest = null; return; }
    const rect = { x: helper.x + right, y: helper.y, w: helper.w, h: helper.h };
    const signature = hudSignature(regionImage(source, rect));
    if (!hudChanged(signature, live.helperSignature) && !due('helperFull', 30_000)) return;
    live.helperSignature = signature; live.jobs.helperFull = now;
    const helperText = await readRegion(live.hudWorker, source, rect, { ink: image => inkDark(image, settings.helper.threshold), scale: settings.helper.scale });
    const parsed = parseQuestHelper(helperText);
    logTest('helper', { quests: parsed?.quests?.map(q => `${q.title}${q.truncated ? '…' : ''}: ${q.progress.map(p => `${p.have}/${p.need} ${p.name}`).join(', ')}`) ?? [], raw: helperText.slice(0, 600) });
    if (parsed) await syncQuestHelper(parsed);
    return;
  }
  if (state.tools.prices && due('chat', 4000)) {
    live.jobs.chat = now;
    const input = findChatInput(bottom(), { offsetY: bottomY });
    const rect = input ? chatLogRect(input) : bars ? collapsedChatRect(bars) : null;
    if (!rect) return;
    const signature = hudSignature(regionImage(source, rect));
    if (!hudChanged(signature, live.chatSignature)) return;
    live.chatSignature = signature;
    const chatSettings = input ? settings.chat : settings.chatLine;
    const trades = parseTradeChat(await readRegion(live.hudWorker, source, rect, { ink: image => inkByContrast(image, chatSettings.distance), scale: chatSettings.scale, ...(input ? {} : { psm: 7 }) }));
    logTest('chat', { trades: trades.map(t => `${t.kind} ${t.item} ${t.price}`) });
    if (trades.length) { state.prices = addTrades(state.prices, trades, now); savePrices(); renderPrices(); renderListingTable(); }
  }
}

async function syncQuestHelper(parsed) {
  if (state.questCatalogStatus === 'idle') await loadQuestCatalog();
  // Catalog still downloading: forget the signature so the next pass reads and matches again.
  if (!state.quests.length && state.live) state.live.helperSignature = null;
  // The Quest Helper shows quest-line titles ("Winston's Fossil Dig-up") or quest names; a line title
  // stands for the line's first quest not yet finished.
  const names = gameQuestNames(state.quests);
  const resolve = (title, truncated) => { const seen = matchQuestTitle(title, names, false) ?? (truncated ? matchQuestTitle(title, names, true) : null); return seen ? questsForGameNames(state.quests, [seen], { tab: 'available', finished: state.questsFinished })[0] ?? null : null; };
  // Every tracked quest on screen; lines that match no quest and have no counts are OCR noise.
  // A wrapped line read as its own heading goes back into the quest above it (hud.js mergeWrappedLines).
  const quests = mergeWrappedLines((parsed.quests ?? [parsed]).map(q => ({ ...q, name: resolve(q.title, q.truncated) })), name => state.quests.find(q => q.name === name)?.needs ?? []).filter(q => q.name || q.progress.length);
  // An unreadable or briefly hidden Quest Helper must not wipe the list on the Quests page: keep the
  // last quests seen for two minutes.
  if (!quests.some(q => q.name) && state.hud.quests?.some(q => q.name) && Date.now() - (state.hud.questsAt ?? 0) < 120_000) { renderQuestHelper(); return; }
  if (quests.some(q => q.name)) state.hud.questsAt = Date.now();
  // Complete only when every need the game lists was read (a wrapped line can hide an unfinished one).
  for (const q of quests) if (q.name) q.complete = helperComplete(q, state.quests.find(x => x.name === q.name)?.needs?.length || null);
  state.hud.quests = quests;
  state.hud.quest = quests[0] ?? null;
  // A quest seen ready to hand in that is gone on two reads in a row (others still shown) was turned in.
  const shown = new Set(quests.map(q => q.name).filter(Boolean));
  state.hud.readyQuests ??= {};
  for (const [name, misses] of Object.entries(state.hud.readyQuests)) {
    if (shown.has(name)) { state.hud.readyQuests[name] = 0; continue; }
    if (quests.length && misses + 1 >= 2) { delete state.hud.readyQuests[name]; markFinished(name); } else state.hud.readyQuests[name] = misses + 1;
  }
  // The quest you were sent to start now shows in the Quest Helper: it was accepted, so guide it.
  if (state.startingQuest && shown.has(state.startingQuest)) {
    const started = state.startingQuest; state.startingQuest = null;
    sayPart('quests', `${started} started. Taking you to the next step.`);
    setGuide(started);
  }
  for (const q of quests.filter(q => q.name)) {
    if (!state.activeQuests.includes(q.name) && state.activeQuests.length < 8) { state.activeQuests.push(q.name); ensureQuestDetails(q.name); }
    const details = state.questDetails[q.name];
    const done = new Set(state.questDone[q.name] ?? []), ready = new Set(state.questItemsReady[q.name] ?? []);
    // Singular/plural-insensitive: "Green Mushroom Caps" in a step matches "Green Mushroom Cap" on screen.
    const stem = text => normalize(text).split(' ').map(word => word.replace(/(es|s)$/, '')).join(' ');
    // A count only counts as done when two readings in a row say so, and it is believable (a
    // misread "0 / 15" as "15 / 15", or "150 / 15", must not tick a step).
    state.hud.doneSeen ??= {};
    const confirmed = q.progress.filter(p => {
      const key = `${q.name}|${normalize(p.name)}`, believable = believableDone(p);
      state.hud.doneSeen[key] = believable ? (state.hud.doneSeen[key] ?? 0) + 1 : 0;
      return state.hud.doneSeen[key] >= 2;
    });
    const words = text => ` ${stem(text)} `;
    for (const line of confirmed) {
      const key = stem(line.name);
      if (key.length < 4) continue;
      for (const step of details?.steps ?? []) if ([step.monster, step.title, step.notes].some(text => text && words(text).includes(` ${key} `))) done.add(step.number);
      for (const item of details?.items ?? []) if (stem(item.name) === key) ready.add(item.name);
    }
    // Every count done (and confirmed): all hunting/collecting steps are done too (only handing it in is left).
    q.confirmedComplete = q.complete && q.progress.length > 0 && confirmed.length === q.progress.length;
    if (q.confirmedComplete) for (const step of details?.steps ?? []) if (step.monster || /collect|hunt|defeat|gather|bring|obtain|get /i.test(step.title)) done.add(step.number);
    state.questDone[q.name] = [...done]; state.questItemsReady[q.name] = [...ready];
  }
  for (const q of quests) if (q.confirmedComplete && q.name) state.hud.readyQuests[q.name] ??= 0;
  persist(); renderQuestGuide(); renderTripPlanner(); renderDashboard();
  const ready = quests.find(q => q.confirmedComplete && q.name);
  state.hud.turnIn = null;
  if (ready) {
    const quest = state.quests.find(q => q.name === ready.name), npcName = quest?.turnIn || quest?.giver;
    const npc = npcName && state.data.targets.find(target => target.kind === 'npc' && normalize(target.name) === normalize(npcName));
    state.hud.turnIn = { quest: ready.name, npc: npcName || null, mapId: npc?.locations[0]?.mapId ?? null };
    if (state.voice && state.hud.spokenTurnIn !== ready.name && state.guide.quest !== ready.name) { state.hud.spokenTurnIn = ready.name; sayPart('quests', `${ready.name} is ready to turn in${npcName ? ` to ${npcName}` : ''}.`); }
  }
  // Guided quest no longer on screen after its hand-in stage: it was turned in.
  if (state.guide.quest && !quests.some(q => q.name === state.guide.quest) && state.guide.stage === 'turn-in') {
    const finished = state.guide.quest;
    markFinished(finished);
    // Done: stop guiding. The next quest is only guided when you pick it.
    sayPart('quests', `${finished} done.`);
    setGuide(null);
  }
  applyObjective();
  renderQuestHelper(); renderLive();
}

// ---------- Quest objective (Guide me) ----------
function loadItemSources(names) {
  for (const name of names) {
    if (name in state.itemSources || state.itemSources[`loading:${name}`]) continue;
    state.itemSources[`loading:${name}`] = true;
    fetchWikiDrops(name).then(monsters => { state.itemSources[name] = monsters; applyObjective(); renderQuestHelper(); renderLive(); })
      .catch(() => { state.itemSources[name] = []; });
  }
}

function currentObjective() {
  const quest = state.guide.quest;
  if (!quest) return null;
  const helperQuest = (state.hud.quests ?? []).find(q => q.name === quest) ?? null;
  const catalogQuest = state.quests.find(q => q.name === quest) ?? null;
  const objective = questObjective(travel(), { quest, helperQuest, catalogQuest, itemSources: state.itemSources, crafting: state.crafting, currentMapId: state.current, handIn: state.guide.handIn === quest && !helperQuest });
  if (objective.stage === 'hunt') loadItemSources(objective.goals.filter(g => g.pending).map(g => g.lookup ?? g.name));
  return objective;
}

// ---------- Quest steps on the Live card ----------
// The guided quest's steps (wiki list, else built from the game data) and which one is next. The
// GPS always heads for the next step; ticking a step (or Quest Helper counts) moves it on.
function guideSteps() {
  const name = state.guide.quest;
  if (!name) return null;
  ensureQuestDetails(name);
  const quest = state.quests.find(q => q.name === name) ?? null;
  const steps = buildSteps(quest, state.questDetails[name]?.steps ?? []);
  const accepted = state.activeQuests.includes(name) || (state.hud.quests ?? []).some(q => q.name === name);
  const { step, done } = currentStep(steps, state.questDone[name] ?? [], { accepted, giver: quest?.giver });
  return { name, quest, steps, step, done };
}
// Where a step happens: its NPC, the best map for its monster, its named map, or (collecting an
// item) the hunting map the objective picks.
function stepTarget(step, guide) {
  if (!step) return null;
  const npcMapId = name => state.data.targets.find(t => t.kind === 'npc' && normalize(t.name) === normalize(name))?.locations[0]?.mapId ?? null;
  if (step.npc && npcMapId(step.npc)) return { mapId: npcMapId(step.npc), npc: step.npc };
  if (state.guide.huntMap && mapById(state.guide.huntMap) && !step.npc) return { mapId: state.guide.huntMap, npc: null };
  const options = huntOptions(guide);
  const all = state.tripAll ? allQuestsTrip() : null;
  if (all?.trip?.stops.length) {
    const here = all.trip.stops.find(s => s.mapId === state.current);
    return { mapId: (here ?? all.trip.stops[0]).mapId, npc: null };
  }
  if (options?.maps.length) {
    // On a map of the trip (or any useful map): hunt here. Otherwise the trip's first stop.
    const here = options.trip?.stops.find(s => s.mapId === state.current) ?? options.maps.find(m => m.mapId === state.current);
    return { mapId: (here ?? options.trip?.stops[0] ?? options.maps[0]).mapId, npc: null };
  }
  const maps = questStepMaps(travel(), step, state.current);
  const here = maps.find(m => m.map.id === state.current);
  if (here || maps[0]) return { mapId: (here ?? maps[0]).map.id, npc: null };
  const objective = currentObjective();
  return objective?.mapId ? { mapId: objective.mapId, npc: objective.npc ?? null } : null;
}
// Every hunt/collect step still to do, as goals (Quest Helper counts where on screen), and the maps
// that cover them best: what you need, where, and how far.
function huntOptions(g) {
  if (!g?.step || !(g.step.monster || g.step.item || /defeat|hunt|collect|gather|bring|obtain/i.test(g.step.title))) return null;
  const helper = (state.hud.quests ?? []).find(q => q.name === g.name);
  const pending = g.steps.filter(step => !g.done.has(step.number) && (step.monster || step.item));
  const progress = pending.map(step => {
    const name = step.monster || step.item, seen = matchCount(helper?.progress, name);
    return { name, have: seen?.have ?? 0, need: seen?.need ?? step.count ?? 1, done: false };
  });
  // Wiki steps name the monster but not always the item: add the quest's game-data list, minus
  // anything already listed or whose step is ticked.
  const doneTitles = g.steps.filter(step => g.done.has(step.number)).map(step => normalize(step.title));
  for (const need of g.quest?.needs ?? []) {
    const key = normalize(need.name).replace(/s$/, '');
    if (progress.some(p => normalize(p.name).replace(/s$/, '') === key) || doneTitles.some(title => title.includes(key))) continue;
    const seen = matchCount(helper?.progress, need.name);
    progress.push({ name: need.name, have: seen?.have ?? 0, need: seen?.need ?? need.count, done: false });
  }
  if (!progress.length) return null;
  const goals = huntGoals(state.data, progress, state.itemSources, g.quest?.text, (g.quest?.needs ?? []).map(need => need.name), state.crafting);
  loadItemSources(goals.filter(goal => goal.pending).map(goal => goal.lookup ?? goal.name));
  // The trip ends where the quest is handed in, so stops on the way there are preferred.
  const endNpc = g.quest?.turnIn || g.quest?.giver, endMapId = endNpc ? state.data.targets.find(t => t.kind === 'npc' && normalize(t.name) === normalize(endNpc))?.locations[0]?.mapId ?? null : null;
  const key = JSON.stringify([goals.map(goal => [goal.name, goal.monsters]), state.current, endMapId, state.useTaxis, state.useNearestScroll, state.useTownScrolls]);
  if (state.tripCache?.key !== key) state.tripCache = { key, trip: planHuntTrip(travel(), goals, state.current, endMapId, { via: craftStops(state.data, goals) }), endNpc };
  return { goals, maps: rankObjectiveMaps(travel(), goals, state.current).slice(0, 4), trip: state.tripCache.trip, endNpc };
}
// "Plan all my quests together": every quest you are doing (guided, in the Quest Helper, or on your
// list) in one hunting trip, then each hand-in. The guided quest respects its ticked steps; others
// use the Quest Helper counts when on screen, else what the game data says they need.
function allQuestsTrip() {
  const names = [...new Set([state.guide.quest, ...(state.hud.quests ?? []).map(q => q.name), ...state.activeQuests].filter(Boolean))].slice(0, 8);
  const byName = new Map(), ends = new Map(), endQuests = new Map();
  for (const name of names) {
    const quest = state.quests.find(q => q.name === name);
    if (!quest || state.questsFinished?.includes?.(name)) continue;
    const helper = (state.hud.quests ?? []).find(q => q.name === name);
    let goals;
    const ticked = new Set((state.questDone[name] ?? []).filter(x => typeof x === 'string' && x.startsWith('need:')).map(x => normalize(x.slice(5))));
    const isTicked = goal => ticked.has(normalize(goal.name)) || (goal.craft && ticked.has(normalize(goal.craft.item)));
    if (name === state.guide.quest) goals = (huntOptions(guideSteps())?.goals ?? []).filter(goal => !isTicked(goal));
    else {
      if (!quest.needs?.length) continue;
      const progress = quest.needs.map(n => { const seen = matchCount(helper?.progress, n.name); return { name: n.name, have: seen?.have ?? 0, need: seen?.need ?? n.count, done: Boolean(seen && believableDone(seen)) || ticked.has(normalize(n.name)) }; });
      goals = huntGoals(state.data, progress, state.itemSources, quest.text, quest.needs.map(n => n.name), state.crafting);
      loadItemSources(goals.filter(g => g.pending).map(g => g.lookup ?? g.name));
    }
    for (const goal of goals) {
      const key = normalize(goal.name), seen = byName.get(key);
      if (seen) { seen.need += Math.max(0, (goal.need ?? 0) - (goal.have ?? 0)); seen.quests.push(name); }
      else byName.set(key, { ...goal, quests: [name] });
    }
    const npc = quest.turnIn || quest.giver, mapId = npc ? state.data.targets.find(t => t.kind === 'npc' && normalize(t.name) === normalize(npc))?.locations[0]?.mapId : null;
    if (mapId && (goals.length || helper?.complete)) { ends.set(mapId, [...(ends.get(mapId) ?? []), npc]); endQuests.set(mapId, [...(endQuests.get(mapId) ?? []), name]); }
  }
  const goals = [...byName.values()];
  const key = JSON.stringify([goals.map(g => [g.name, g.monsters, g.need]), [...ends.keys()], state.current, state.useTaxis, state.useNearestScroll, state.useTownScrolls]);
  if (state.allTripCache?.key !== key) state.allTripCache = { key, trip: planMultiTrip(travel(), goals, state.current, [...ends.keys()].map(mapId => ({ mapId, quests: endQuests.get(mapId) ?? [] })), { via: craftStops(state.data, goals) }) };
  return { goals, ends, quests: names, trip: state.allTripCache.trip };
}
// Every hunting and collecting need of every quest in the trip, with Quest Helper counts; tick one
// off by hand and it drops out of the trip (counts the Quest Helper shows as done are ticked for you).
function allChecklistHtml(all) {
  const rows = all.quests.map(name => {
    const quest = state.quests.find(q => q.name === name); if (!quest?.needs?.length) return '';
    const helper = (state.hud.quests ?? []).find(q => q.name === name);
    const ticked = new Set((state.questDone[name] ?? []).filter(x => typeof x === 'string' && x.startsWith('need:')).map(x => normalize(x.slice(5))));
    const items = quest.needs.map(need => {
      const seen = matchCount(helper?.progress, need.name), auto = Boolean(seen && believableDone(seen)), done = auto || ticked.has(normalize(need.name));
      const goal = all.goals.find(g => normalize(g.name) === normalize(need.name) || normalize(g.craft?.item ?? '') === normalize(need.name));
      const where = goal?.craft ? `craft at ${goal.craft.npc ?? goal.craft.town}` : goal?.given ? 'from an NPC' : goal?.monsters?.length && normalize(goal.monsters[0]) !== normalize(need.name) ? `from ${goal.monsters.slice(0, 2).join(', ')}${goal.guess ? ' (best guess)' : ''}` : '';
      const count = seen ? `${seen.have ?? '?'}/${seen.need ?? need.count}` : `0/${need.count}`;
      return `<li class="${done ? 'done' : ''}"><label><input type="checkbox" data-need-tick="${esc(name)}" data-need="${esc(need.name)}"${done ? ' checked' : ''}${auto ? ' disabled title="Done, says your Quest Helper"' : ''}> ${esc(need.name)} <small>${count}${where ? ` · ${esc(where)}` : ''}</small></label></li>`;
    }).join('');
    return `<li><strong>${esc(quest.arc && normalize(quest.arc) !== normalize(name) ? `${quest.arc} · ${name}` : name)}</strong><ul class="need-list">${items}</ul></li>`;
  }).join('');
  return rows ? `<details class="all-checklist" open><summary>Checklist (tick what you've done)</summary><ul class="live-steps">${rows}</ul></details>` : '';
}
function allTripHtml(all) {
  const trip = all?.trip;
  if (!trip) return `<p class="fine">${all?.goals.some(g => g.pending) ? 'Looking up which monsters drop what you need…' : 'Nothing left to hunt: hand your quests in.'}</p>${all ? allChecklistHtml(all) : ''}`;
  const npcsAt = mapId => [...new Set(all.ends.get(mapId) ?? [])].join(', ');
  const parts = [
    // In the order you go: hunting maps, each quest's hand-in as soon as it is done (when close), crafters.
    ...trip.order.map(step => step.type === 'hunt' ? `${esc(mapById(step.mapId)?.name ?? '?')} <small>(${esc(step.monsters.join(', '))} · ${esc(step.quests.join(', '))})</small>`
      : step.type === 'craft' ? `${esc(mapById(step.mapId)?.name ?? '?')} <small>(craft)</small>`
      : `${esc(npcsAt(step.mapId) || mapById(step.mapId)?.name || '?')} <small>(hand in${step.quests?.length ? `: ${esc(step.quests.join(', '))}` : ''}${step.noRoute ? '; no walking route there' : ''})</small>`)
  ];
  const first = trip.stops[0]?.mapId;
  return `<div class="fine hunt-trip"><strong>All quests trip:</strong> ${parts.join(' → ')} <small>· ${trip.hops} map${trip.hops === 1 ? '' : 's'} in all</small>${first && first !== state.destination ? ` <button type="button" class="button secondary wm-go" data-hunt-map="${esc(first)}">Go</button>` : ''}${trip.missing.length ? `<br><small>No known spot for: ${esc(trip.missing.join(', '))}</small>` : ''}</div>${allChecklistHtml(all)}`;
}
// Trade-chat adverts grouped under real item names (OCR slips split them otherwise), once the item
// list has loaded (game items, plus the Market's list with cash items when it is open).
let namerCache = { size: -1, namer: null }, cashNames = null;
function priceNamer() {
  if (state.itemCatalogStatus === 'idle') ensureItemCatalog();
  // Cash items (glasses, rings, beanies) are a big share of trade chat: their names too, fetched once.
  if (!cashNames) { cashNames = []; fetch(MARKET_CASH).then(r => r.ok ? r.json() : null).then(cash => { cashNames = (cash?.categories ?? []).flatMap(group => (group.items ?? []).map(item => item.name)).filter(Boolean); renderPrices(); }).catch(() => {}); }
  const names = [...(state.items ?? []).map(item => item.name), ...(market?.catalog ?? []).map(item => item.name), ...cashNames];
  if (!names.length) return null;
  if (namerCache.size !== names.length) namerCache = { size: names.length, namer: itemNamer(names) };
  return namerCache.namer;
}
// What players were asking for an item in your trade-chat log (Untested feature), to compare with hunting it.
function marketNote(itemName) {
  if (!state.prices?.length) return '';
  const row = summarizePrices(state.prices, itemName, priceNamer()).find(r => normalize(r.item) === normalize(itemName));
  return row?.sell ? `; market: about ${formatMesos(row.sell.median)} each (${row.sell.count} ad${row.sell.count === 1 ? '' : 's'} in your trade-chat log)` : '';
}
function huntOptionsHtml(options) {
  if (!options) return '';
  if (!options.maps.length) return `<p class="fine">${options.goals.some(goal => goal.pending) ? 'Looking up which monsters drop what you need…' : 'No mapped hunting spot for these yet.'}</p>`;
  const trip = options.trip?.stops.length > 1 || (options.trip && options.goals.some(goal => goal.craft)) || (options.trip && options.trip.stops[0]?.mapId !== options.maps[0]?.mapId) ? options.trip : null;
  const tripHtml = trip ? `<div class="fine hunt-trip"><strong>Best trip:</strong> ${trip.stops.map(stop => `${esc(mapById(stop.mapId)?.name ?? '?')} <small>(${esc(stop.monsters.join(', '))})</small>`).join(' → ')}${[...new Set(options.goals.filter(goal => goal.craft?.npc).map(goal => goal.craft.npc))].map(npc => ` → ${esc(npc)} <small>(make ${esc([...new Set(options.goals.filter(goal => goal.craft?.npc === npc).map(goal => goal.craft.item))].join(', '))})</small>`).join('')}${options.endNpc ? ` → ${esc(options.endNpc)}` : ''} <small>· ${trip.hops} map${trip.hops === 1 ? '' : 's'} in all</small>${trip.stops[0].mapId !== state.destination ? ` <button type="button" class="button secondary wm-go" data-hunt-map="${esc(trip.stops[0].mapId)}">Go</button>` : ''}</div>` : '';
  const toggle = `<label class="toggle trip-all"><input type="checkbox" data-trip-all${state.tripAll ? ' checked' : ''}> Plan all my quests together</label>`;
  if (state.tripAll) return `<div class="hunt-options">${toggle}${allTripHtml(allQuestsTrip())}</div>`;
  return `<div class="hunt-options">${toggle}${tripHtml}<div class="fine"><strong>Where to hunt:</strong> ${options.goals.map(goal => `${esc(goal.name)}${goal.craft ? ` <small>(${goal.need} for ${goal.craft.makes} ${esc(goal.craft.item)}: ${esc(goal.craft.discipline)} at ${esc(goal.craft.npc ?? goal.craft.town)}${goal.craft.town ? `, ${esc(goal.craft.town)}` : ''}${goal.craft.meso ? `, ${goal.craft.meso.toLocaleString()} mesos` : ''}; needs ${esc(goal.craft.discipline)} Lv ${goal.craft.level ?? 1}${goal.craft.master ? ` (profession master: ${esc(goal.craft.master)})` : ''}${marketNote(goal.name)})</small>` : ''}${goal.given ? ' <small>(no monster is known to drop it: probably handed to you during the quest)</small>' : ''}${goal.craft && goal.kind === 'collect' && !goal.pending && !goal.monsters.length ? ' <small>(no monster is known to drop it: try the shops or the market)</small>' : ''}${goal.kind === 'collect' && goal.monsters.length ? ` <small>(from ${esc(goal.monsters.slice(0, 2).join(', '))}${goal.guess ? ', best guess from the quest text' : ''})</small>` : ''}`).join(' · ')}</div>
    <ul>${options.maps.map(m => { const map = mapById(m.mapId), chosen = m.mapId === state.destination;
      return `<li class="${chosen ? 'chosen' : ''}"><span><strong>${esc(map?.name ?? '?')}</strong><small>${esc(m.goals.join(', '))} · ${m.spawns} spawns · ${m.hops === 0 ? 'you are here' : `${m.hops} map${m.hops === 1 ? '' : 's'} away`}</small></span>${chosen ? '<span class="pill">heading here</span>' : `<button type="button" class="button secondary wm-go" data-hunt-map="${esc(m.mapId)}">Go</button>`}</li>`; }).join('')}</ul></div>`;
}

function toggleStep(number) {
  const g = guideSteps(); if (!g) return;
  const done = new Set(g.done);
  if (done.has(number)) done.delete(number); else done.add(number);
  state.questDone[g.name] = [...done]; persist();
  applyObjective(); renderQuestGuide(); renderLive();
}
function stepsHtml(g) {
  if (!g.steps.length) return state.questDetails[g.name]?.status === 'loading' ? '<p class="fine">Loading the quest steps…</p>' : '';
  return `<ol class="live-steps">${g.steps.map(step => {
    const isDone = g.done.has(step.number), isNext = g.step?.number === step.number;
    return `<li class="${isDone ? 'done' : ''}${isNext ? ' next' : ''}"><label><input type="checkbox" data-step="${step.number}"${isDone ? ' checked' : ''}> ${esc(step.title)}</label>${isNext ? ' <span class="pill">now</span>' : ''}</li>`;
  }).join('')}</ol><p class="fine">Tick a step when it is done and the GPS moves on to the next one.</p>`;
}

// You picked a destination yourself: stop guiding the quest so it cannot pull you back on the next map.
function releaseGuide() {
  if (!state.guide.quest) return;
  state.guide = { quest: null, stage: null, spoken: null }; state.startingQuest = null; saveLive();
}

function setGuide(quest) {
  state.guide = { quest, stage: null, spoken: null }; saveLive();
  if (quest) { state.goalNpc = null; state.startingQuest = null; saveLive(); }
  applyObjective(); renderQuestHelper(); renderLive();
}

// While guiding, the objective owns the destination: the hunting map until every count is done,
// then the hand-in NPC. Spoken once per stage change.
function applyObjective() {
  const g = guideSteps();
  if (g?.steps.length) {
    if (!g.step) {
      // Every step ticked: the quest is done.
      const finished = g.name; sayPart('quests', `${finished} complete.`);
      markFinished(finished); setGuide(null); return;
    }
    // A new step forgets the hunting map picked for the last one (its monsters may be done); the
    // map you pick for this step is kept until the step is done.
    if (state.guide.stepNo !== g.step.number) { state.guide.stepNo = g.step.number; state.guide.huntMap = null; }
    const target = stepTarget(g.step, g);
    state.guide.stage = g.step.handIn ? 'turn-in' : g.step.monster || g.step.item ? 'hunt' : 'step';
    if (target && (target.mapId !== state.destination || (target.npc ?? null) !== (state.goalNpc ?? null))) {
      state.destination = target.mapId; state.targetId = null; state.goalNpc = target.npc; destinationSelect.value = target.mapId; saveLive(); persist(); renderRoute(); renderTargets();
    }
    const key = `${g.name}|${g.step.number}`;
    if (state.voice && state.guide.spoken !== key) { state.guide.spoken = key; { const options = huntOptions(g), stops = options?.trip?.stops ?? [], best = options?.maps?.[0];
      const where = stops.length > 1 ? ` Best trip: ${stops.map(stop => `${mapById(stop.mapId)?.name} for ${stop.monsters.join(' and ')}`).join(', then ')}.` : stops[0] ? ` Best spot: ${stops[0].mapId === state.current ? 'right here' : mapById(stops[0].mapId)?.name}.` : best ? ` Nearest spot: ${mapById(best.mapId)?.name}${best.hops ? `, ${best.hops} map${best.hops === 1 ? '' : 's'} away` : ', right here'}.` : '';
      sayPart('quests', `${g.step.title}.${where}`); } }
    return;
  }
  const objective = currentObjective();
  if (!objective) return;
  state.guide.stage = objective.stage;
  if (objective.mapId && objective.mapId !== state.destination) {
    state.destination = objective.mapId; state.targetId = null; destinationSelect.value = objective.mapId; persist(); renderRoute(); renderTargets();
  }
  const key = `${objective.quest}|${objective.stage}|${objective.here}|${objective.mapId}`;
  if (state.voice && state.guide.spoken !== key && (objective.stage !== 'hunt' || objective.goals.every(g => !g.pending))) {
    state.guide.spoken = key;
    const mapName = objective.mapId ? mapById(objective.mapId)?.name : null;
    if (objective.stage === 'turn-in') sayPart('quests', objective.here ? `All done. Talk to ${objective.npc} here to turn in ${objective.quest}.` : `All done. Head to ${mapName ?? objective.npc} to turn in ${objective.quest}.`);
    else if (objective.stage === 'hunt') {
      const list = objective.goals.map(g => g.kind === 'kill' ? `${g.need - g.have} more ${g.name}` : `${g.need - g.have} more ${g.name}`).join(', ');
      sayPart('quests', objective.here ? `Hunt here. You still need ${list}.` : `Head to ${mapName} to hunt. You need ${list}.`);
    }
  }
}

function objectiveHtml() {
  const objective = currentObjective();
  if (!objective) {
    const offer = (state.hud.quests ?? []).filter(q => q.name).slice(0, 3);
    return offer.length ? `<div class="objective offer">Guide a quest: ${offer.map(q => `<button type="button" class="link-button" data-guide="${esc(q.name)}">${esc(q.name)}</button>`).join(' · ')}</div>` : '';
  }
  // A quest in a line shows as the game names it: "Winston's Fossil Dig-up · Searching for Fossils".
  const arc = state.quests.find(q => q.name === objective.quest)?.arc, title = arc && normalize(arc) !== normalize(objective.quest) ? `${esc(arc)} <small>· ${esc(objective.quest)}</small>` : esc(objective.quest);
  const head = `<div class="objective-head"><span class="objective-tag">Quest</span> ${title} <button type="button" class="link-button" data-guide="">stop guiding</button></div>`;
  const g = guideSteps();
  if (g?.steps.length) {
    const counts = objective.stage === 'hunt' && !objective.countsUnknown && (g.step?.monster || g.step?.item) ? `<ul class="objective-goals">${[...objective.done, ...objective.goals].map(goal => `<li class="${goal.done ? 'done' : ''}"><span>${esc(goal.name)}</span><span class="objective-count">${goal.have} / ${goal.need}</span><span class="objective-bar"><span style="width:${Math.min(100, Math.round(goal.have / goal.need * 100))}%"></span></span></li>`).join('')}</ul>` : '';
    return `<div class="objective">${head}${stepsHtml(g)}${counts}${huntOptionsHtml(huntOptions(g))}</div>`;
  }
  if (objective.stage === 'turn-in') return `<div class="objective done">${head}<strong>All done. ${objective.here ? `Talk to ${esc(objective.npc)} here to turn it in.` : `Hand it in to ${esc(objective.npc ?? 'the quest NPC')}${objective.mapId ? ` in ${esc(mapById(objective.mapId)?.name ?? '')}` : ''}.`}</strong></div>`;
  if (objective.stage === 'hunt') {
    const bars = [...objective.done, ...objective.goals].map(g => {
      const pct = Math.min(100, Math.round(g.have / g.need * 100));
      const how = g.done ? 'done' : g.kind === 'kill' ? 'defeat' : g.pending ? 'looking up who drops it…' : g.monsters.length ? `from ${g.monsters.slice(0, 3).join(', ')}` : 'no recorded drops';
      return `<li class="${g.done ? 'done' : ''}"><span>${esc(g.name)} <small>${esc(how)}</small></span><span class="objective-count">${g.have} / ${g.need}</span><span class="objective-bar"><span style="width:${pct}%"></span></span></li>`;
    }).join('');
    const where = objective.here ? '<strong>Hunt here.</strong> Stay on this map until the counts are done.'
      : objective.mapId ? `Head to <strong>${esc(mapById(objective.mapId)?.name ?? '')}</strong> to hunt.` : 'No mapped hunting spot for these yet.';
    const unknown = objective.countsUnknown ? '<p class="fine">Your Quest Helper is not in view, so counts are not read. Open it in game, or <button type="button" class="link-button" data-hand-in>I have everything: take me to hand it in</button>.</p>' : '';
    return `<div class="objective">${head}<p>${where}</p><ul class="objective-goals">${bars}</ul>${unknown}</div>`;
  }
  return `<div class="objective">${head}<p>Open the quest in the in-game Quest Helper so its counts can be read.</p></div>`;
}

function renderQuestHelper() {
  const panel = $('#quest-helper'); if (!panel) return;
  const quests = state.hud.quests ?? (state.hud.quest ? [state.hud.quest] : []);
  if (!quests.length) {
    // Not on screen right now: still list the quests you are doing so Guide me is always here.
    const known = state.activeQuests.filter(name => !state.questsFinished.includes(name));
    panel.innerHTML = `<p class="fine">${state.live ? 'Quest Helper not in view right now. Open it in game to read live counts.' : 'Start Live GPS with Quest Helper sync on to read live counts.'}</p>`
      + (known.length ? `<p class="fine"><strong>Your quests</strong> (last seen in your Quest Helper):</p>${known.map(name => `<div class="qh-quest${state.guide.quest === name ? ' guiding' : ''}"><div class="qh-title">${esc(name)}</div><button type="button" class="button ${state.guide.quest === name ? 'light' : 'secondary'}" data-guide="${state.guide.quest === name ? '' : esc(name)}">${state.guide.quest === name ? 'Stop guiding' : 'Guide me'}</button></div>`).join('')}` : '');
    return;
  }
  panel.innerHTML = quests.map(q => {
    const guiding = state.guide.quest && state.guide.quest === q.name;
    return `<div class="qh-quest${guiding ? ' guiding' : ''}"><div class="qh-title">${esc(q.name ?? q.title)}${q.name ? '' : ' <span class="pill">not matched to the wiki catalog</span>'}${q.complete ? ' <span class="pill">ready to hand in</span>' : ''}</div>
      <ul class="qh-progress">${q.progress.map(p => `<li class="${p.done ? 'done' : ''}">${p.done ? '✓' : '○'} ${p.have} / ${p.need} ${esc(p.name)}</li>`).join('')}</ul>
      ${q.name ? `<button type="button" class="button ${guiding ? 'light' : 'secondary'}" data-guide="${guiding ? '' : esc(q.name)}">${guiding ? 'Stop guiding' : 'Guide me'}</button>` : ''}</div>`;
  }).join('') + '<p class="fine"><strong>Guide me</strong> routes you to the best map for what is left, tells you to hunt there with live counts, then sends you to hand the quest in once every count is done.</p>';
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-guide]');
  if (!button || !(button.closest('#quest-helper') || button.closest('#live-step'))) return;
  setGuide(button.dataset.guide || null);
  if (button.dataset.guide) reveal('#live-title');
});

function renderLiveExp() {
  const panel = $('#live-exp'); if (!panel) return;
  const tracker = state.hud.tracker ?? state.live?.tracker;
  if (!tracker?.last) { panel.innerHTML = `<p class="fine">${state.live ? 'Waiting for an EXP reading from the status bar…' : 'Start Live GPS with the EXP tracker on to log this run automatically.'}</p>`; return; }
  const s = expSummary(tracker), hm = m => m == null ? '—' : m >= 60 ? `${Math.floor(m / 60)}h ${Math.round(m % 60)}m` : `${Math.round(m)}m`;
  panel.innerHTML = `<div class="exp-stats"><span><strong>${Math.round(s.minutes)} min</strong>this run</span><span><strong>+${Math.round(s.gained).toLocaleString()}</strong>EXP</span><span><strong>${Math.round(s.perHour).toLocaleString()}</strong>EXP / hour</span><span><strong>${s.percentPerHour.toFixed(1)}%</strong>per hour</span><span><strong>${hm(s.minutesToLevel)}</strong>to next level</span></div>
    <p class="fine">${s.levelUps ? `${s.levelUps} level-up${s.levelUps === 1 ? '' : 's'} · ` : ''}${s.lost ? `${Math.round(s.lost).toLocaleString()} EXP lost · ` : ''}At ${s.percent?.toFixed(2)}%${s.level ? ` of level ${s.level}` : ''}. Mesos are not on the status bar, so they are not tracked.</p>
    <div class="action-row"><button type="button" class="button secondary" id="save-live-exp">Save as training session</button></div>`;
  $('#save-live-exp').addEventListener('click', () => {
    const row = sessionFromTracker(tracker, Date.now(), state.level);
    if (!row.mapId) row.mapId = state.current ?? '';
    state.sessions.unshift(row); state.sessions = state.sessions.slice(0, 100); persist(); renderSessionList(); renderDashboard();
    if (state.live) { state.live.tracker = createExpTracker(Date.now()); state.hud.tracker = null; }
    renderLiveExp();
  });
}

function renderPrices() {
  const panel = $('#price-table'); if (!panel) return;
  const rows = summarizePrices(state.prices, $('#price-query')?.value ?? '', priceNamer()).slice(0, 60);
  $('#price-count').textContent = `${state.prices.length} adverts logged`;
  if (!rows.length) { panel.innerHTML = `<p class="fine">${state.prices.length ? 'No item matches that search.' : 'Nothing logged yet. Keep Live GPS running with trade chat logging on and the chat visible.'}</p>`; return; }
  // The most recent players advertising this item, to contact in game.
  const who = item => { const key = normalize(item), seen = new Set(); return state.prices.filter(p => p.key === key && p.seller && !seen.has(p.seller) && seen.add(p.seller)).slice(0, 3).map(p => `${esc(p.seller)} <small>(${p.kind === 'buy' ? 'buying' : 'selling'} ${formatMesos(p.price)})</small>`).join('<br>') || '<span class="muted-cell">—</span>'; };
  const cell = stats => stats ? `${formatMesos(stats.median)}<small>${stats.count > 1 ? `${formatMesos(stats.low)}–${formatMesos(stats.high)} · ` : ''}${stats.count}×</small>` : '<span class="muted-cell">—</span>';
  panel.innerHTML = `<table class="price-grid"><thead><tr><th>Item</th><th>Selling for</th><th>Buying at</th><th>Who</th><th>Last seen</th></tr></thead><tbody>${rows.map(row => `<tr><td>${esc(row.item)}</td><td>${cell(row.sell)}</td><td>${cell(row.buy)}</td><td class="price-who">${who(row.item)}</td><td>${new Date(row.lastSeen).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td></tr>`).join('')}</tbody></table>`;
}

$('#price-query').addEventListener('input', renderPrices);
$('#price-clear').addEventListener('click', () => { if (!confirm('Delete the whole price log in this browser?')) return; state.prices = []; savePrices(); renderPrices(); });
for (const [id, key] of [['tool-exp', 'exp'], ['tool-quest', 'quest'], ['tool-prices', 'prices'], ['tool-mobcount', 'mobCount']]) {
  $(`#${id}`).checked = state.tools[key];
  $(`#${id}`).addEventListener('change', event => { state.tools[key] = event.target.checked; saveLive(); renderLive(); });
}
renderPrices(); renderQuestHelper(); renderLiveExp();
$('#download-test-log').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ saved: new Date().toISOString(), userAgent: navigator.userAgent, current: mapById(state.current)?.name ?? null, destination: mapById(state.destination)?.name ?? null, minimapScales: state.minimapScales, log: testLog, snapshots: testSnapshots }, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `maple-route-test-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
});

// ---------- Shop or players? ----------
state.sell = { item: null };

function sellSuggestions() {
  const box = $('#sell-suggest'), query = normalize($('#sell-query').value);
  box.replaceChildren();
  if (state.itemCatalogStatus !== 'loaded') { if (query.length >= 2) { box.textContent = 'Loading the item list…'; ensureItemCatalog().then(sellSuggestions); } return; }
  if (query.length < 2 || (state.sell.item && normalize(state.sell.item.name) === query)) return;
  const seen = new Set();
  const matches = state.items.filter(item => normalize(item.name).includes(query) && !seen.has(`${item.name}|${item.npcPrice}`) && seen.add(`${item.name}|${item.npcPrice}`))
    .sort((a, b) => Number(normalize(b.name).startsWith(query)) - Number(normalize(a.name).startsWith(query)) || a.name.localeCompare(b.name)).slice(0, 8);
  if (!matches.length) { box.textContent = 'No item with that name in the catalog.'; return; }
  for (const item of matches) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'start-option';
    const name = document.createElement('strong'); name.textContent = item.name;
    const meta = document.createElement('span'); meta.textContent = item.npcPrice ? `Shop pays ${item.npcPrice.toLocaleString()}` : item.category;
    button.append(name, meta);
    button.addEventListener('click', () => { state.sell.item = item; $('#sell-query').value = item.name; box.replaceChildren(); prefillSellPrice(); renderSellCheck(); });
    box.append(button);
  }
}

function loggedMarket(item) {
  if (!item) return null;
  return summarizePrices(state.prices, '', priceNamer()).find(row => findCatalogItem(row.item, [item])) ?? null;
}

function prefillSellPrice() {
  const logged = loggedMarket(state.sell.item);
  $('#sell-market').value = logged?.sell?.median ?? '';
  $('#sell-market').dataset.source = logged?.sell ? 'log' : '';
}

const SELL_LABEL = { players: 'List it for players', shop: 'Sell it to a shop', either: 'About the same', unknown: 'Need a player price' };

function renderSellCheck() {
  const panel = $('#sell-result'), item = state.sell.item;
  if (!item) { panel.innerHTML = '<p class="fine">Pick an item to compare what a shop pays with what players are asking.</p>'; renderListingTable(); return; }
  const logged = loggedMarket(item), typed = Number(String($('#sell-market').value).replace(/[^\d.]/g, ''));
  const market = typed > 0 ? typed : null;
  const verdict = sellVerdict({ shopPrice: item.npcPrice, marketPrice: market, quantity: $('#sell-qty').value });
  const source = market && $('#sell-market').dataset.source === 'log' && logged?.sell?.median === market
    ? `median of ${logged.sell.count} trade-chat advert${logged.sell.count === 1 ? '' : 's'} you logged (${formatMesos(logged.sell.low)}–${formatMesos(logged.sell.high)})`
    : market ? 'the price you entered' : null;
  panel.innerHTML = `<div class="sell-verdict sell-${verdict.choice}"><strong>${SELL_LABEL[verdict.choice]}</strong><span>${esc(verdict.reason)}</span></div>
    <div class="exp-stats"><span><strong>${verdict.shopTotal != null ? verdict.shopTotal.toLocaleString() : '—'}</strong>Shop pays${verdict.quantity > 1 && verdict.shopEach ? ` (${verdict.shopEach.toLocaleString()} each)` : ''}</span>
    <span><strong>${verdict.expectedTotal != null ? verdict.expectedTotal.toLocaleString() : '—'}</strong>Likely from players${verdict.marketEach ? ` (asking ${formatMesos(verdict.marketEach)} each)` : ''}</span></div>
    <p class="fine">${source ? `Player price: ${esc(source)}. ` : ''}"Likely" takes 15% off the asking price, since adverts usually sell below their ask. Check current listings on <a href="${MEOWDB_PRICE_CHECK}" target="_blank" rel="noopener">NiaMeowDB Price Check</a> before listing anything valuable.</p>`;
  renderListingTable();
}

// Shop or players? with an item picked: what players are doing with that item (Market listings,
// read without signing in, and your trade-chat log). Without one: the items worth listing.
function renderItemPlayers(panel, item) {
  const chat = summarizePrices(state.prices, item.name, priceNamer()).find(row => normalize(row.item) === normalize(item.name));
  const cached = state.sell.market?.id === item.id ? state.sell.market : null;
  if (!cached) { state.sell.market = { id: item.id, rows: null }; market.store.browse(item.id).then(rows => { if (state.sell.market?.id === item.id) { state.sell.market.rows = rows; renderListingTable(); } }).catch(() => { if (state.sell.market?.id === item.id) { state.sell.market.rows = []; renderListingTable(); } }); }
  const rows = cached?.rows;
  const listings = rows == null ? '<p class="fine">Checking the Market…</p>' : rows.length
    ? `<ul class="market-rows">${rows.slice(0, 8).map(l => `<li class="market-row"><div class="market-main"><span class="pill ${l.side}">${l.side === 'sell' ? 'Selling' : 'Buying'}</span> <span class="market-price">${formatMesos(l.price)}</span>${l.quantity > 1 ? ` ×${l.quantity}` : ''} <span class="fine">· ${esc(l.ign)} · ${ago(l.created_at)}</span></div><div class="market-actions"><button type="button" class="button light" data-market-find="${esc(l.ign)}">Copy /find</button></div></li>`).join('')}</ul>`
    : '<p class="fine">Nobody has it listed in the Market right now.</p>';
  const chatText = chat?.sell || chat?.buy ? `<p class="fine"><strong>Trade chat</strong> (your log): ${chat.sell ? `asking ${formatMesos(chat.sell.low)}–${formatMesos(chat.sell.high)}, usually ${formatMesos(chat.sell.median)} (${chat.sell.count} ad${chat.sell.count === 1 ? '' : 's'})` : ''}${chat.sell && chat.buy ? ' · ' : ''}${chat.buy ? `buying at about ${formatMesos(chat.buy.median)} (${chat.buy.count})` : ''}</p>`
    : `<p class="fine"><strong>Trade chat</strong>: no adverts for it in your log yet${state.tools.prices ? '' : ' (turn on Trade chat prices in Settings → Live tools to collect them)'}.</p>`;
  panel.innerHTML = `<h3>Players and ${esc(item.name)}</h3>${chatText}<h4 class="sub-title">In the Market</h4>${listings}<p class="fine"><a href="#market" data-market-search="${esc(item.name)}">Open it in the Market</a></p>`;
}
function renderListingTable() {
  const panel = $('#sell-opportunities'); if (!panel) return;
  if (state.sell.item) { renderItemPlayers(panel, state.sell.item); return; }
  if (state.itemCatalogStatus !== 'loaded') { panel.innerHTML = state.prices.length ? '<p class="fine">Loading shop prices…</p>' : ''; if (state.prices.length) ensureItemCatalog().then(renderListingTable); return; }
  const rows = listingOpportunities(summarizePrices(state.prices, '', priceNamer()), state.items);
  panel.innerHTML = rows.length ? `<h3>Worth listing for players</h3><table class="price-grid"><thead><tr><th>Item</th><th>Shop pays</th><th>Players ask</th><th>Adverts</th></tr></thead><tbody>${rows.map(row => `<tr><td>${esc(row.item)}</td><td>${row.shop ? row.shop.toLocaleString() : '—'}</td><td>${formatMesos(row.market)}</td><td>${row.adverts}</td></tr>`).join('')}</tbody></table>`
    : `<p class="fine">${state.prices.length ? 'Nothing in your price log beats the shop by much yet.' : 'Items from your trade-chat price log that players pay well above shop value will be listed here.'}</p>`;
}

$('#sell-query').addEventListener('input', () => { state.sell.item = null; sellSuggestions(); renderSellCheck(); });
$('#sell-query').addEventListener('focus', () => ensureItemCatalog());
$('#sell-qty').addEventListener('input', renderSellCheck);
$('#sell-market').addEventListener('input', () => { $('#sell-market').dataset.source = ''; renderSellCheck(); });
renderSellCheck();

// ---------- You're here ----------
state.dropCache = {};
function loadDrops(names) {
  for (const name of names) {
    if (state.dropCache[name]) continue;
    state.dropCache[name] = { status: 'loading', items: [] };
    fetchMonsterDrops(name).then(items => { state.dropCache[name] = { status: 'loaded', items }; renderLive(); })
      .catch(() => { state.dropCache[name] = { status: 'error', items: [] }; });
  }
}

function arrivalModel() {
  const questTasks = state.activeQuests.length ? pendingQuestTasks(state.data, state.activeQuests, state.quests, state.questDetails, state.questDone, state.current) : [];
  const details = arrivalDetails(state.data, state.current, { playerLevel: state.level, position: livePosition(), sessions: state.sessions, quests: state.quests, questTasks });
  if (details) loadDrops(details.mobs.slice(0, 5).map(mob => mob.name));
  if (state.questCatalogStatus === 'idle') loadQuestCatalog();
  return details;
}

const KIND_WORD = { visible: 'portal', walk: 'walk-in exit', hidden: 'hidden portal', special: 'scripted exit' };

function arrivalHtml(d) {
  const list = (items, empty) => items.length ? `<ul>${items.join('')}</ul>` : `<p class="fine">${empty}</p>`;
  // Monsters your guided quest needs come first, tagged.
  const objective = currentObjective(), wanted = new Set(objective?.stage === 'hunt' ? objective.goals.flatMap(g => g.monsters.map(normalize)) : []);
  const mobs = [...d.mobs].sort((a, b) => Number(wanted.has(normalize(b.name))) - Number(wanted.has(normalize(a.name)))).map(mob => {
    const drops = state.dropCache[mob.name];
    const dropText = drops?.status === 'loaded' ? (drops.items.length ? `Drops: ${drops.items.slice(0, 8).map(esc).join(', ')}${drops.items.length > 8 ? '…' : ''}` : 'No drops recorded') : drops?.status === 'loading' ? 'Looking up drops…' : '';
    return `<li${wanted.has(normalize(mob.name)) ? ' class="quest-mob"' : ''}><strong>${esc(mob.name)}</strong>${wanted.has(normalize(mob.name)) ? ' <span class="fit fit-quest">quest target</span>' : ''} <span class="pill">Lv ${mob.level ?? '?'}</span>${mob.fit ? ` <span class="fit fit-${mob.fit.replace(' ', '-')}">${esc(mob.fit)}</span>` : ''}<small>${mob.count ? `${mob.count} spawns · ` : ''}${mob.exp != null ? `${mob.exp} EXP · ` : ''}${mob.hp != null ? `${mob.hp.toLocaleString()} HP` : ''}${mob.special ? ' · special' : ''}</small>${dropText ? `<small>${dropText}</small>` : ''}</li>`;
  });
  const npcs = d.npcs.map(npc => `<li><strong>${esc(npc.name)}</strong>${npc.side ? ` <small class="inline">${npc.side} side</small>` : ''}${npc.quests.length ? `<small>${npc.quests.map(q => `${q.role === 'gives' ? 'Gives' : 'Takes'} ${esc(q.name)}${q.level ? ` (Lv ${q.level})` : ''}`).join(' · ')}</small>` : ''}</li>`);
  const exits = [...d.exits.map(e => `<li><button type="button" class="link-button" data-route="${esc(e.to)}">${esc(e.name)}</button> <small class="inline">${[e.where, KIND_WORD[e.kind]].filter(Boolean).join(' ')}</small></li>`),
    ...d.rides.map(r => `<li><button type="button" class="link-button" data-route="${esc(r.to)}">${esc(r.name)}</button> <small class="inline">${esc(r.npc)}${r.fare ? ` · ${(state.level < 20 ? r.fare[0] : r.fare[1]).toLocaleString()} mesos` : ''}</small></li>`)];
  const facts = [];
  if (d.training) facts.push(`<li>Good training for about <strong>level ${d.training.from}–${d.training.to}</strong> · ${d.training.spawns} monster spawns listed</li>`);
  if (d.bestRun) facts.push(`<li>Your best logged run here: <strong>${d.bestRun.expPerHour.toLocaleString()} EXP/h</strong> (${d.runs} run${d.runs === 1 ? '' : 's'})</li>`);
  for (const q of d.questSteps) facts.push(`<li>Quest step here: <strong>${esc(q.quest)}</strong> · ${esc(q.step)}</li>`);
  if (!facts.length) facts.push('<li class="fine">No training data, logged runs or active quest steps for this map yet.</li>');
  // At a glance: what lives here (with counts and fit), who has quests, where you can go. The full
  // lists (drops, HP, EXP, every NPC) stay one click away under "More about this map".
  const colors = spawnColors(mapById(d.map.id)?.mobSpots ?? []), dot = name => colors.has(name) ? `<i class="spawn-dot" style="background:${colors.get(name)}"></i>` : '';
  const chip = mob => `<span class="arr-chip${wanted.has(normalize(mob.name)) ? ' quest' : ''}${mob.fit ? ` fit-${mob.fit.replace(' ', '-')}` : ''}" title="${esc(`${mob.fit ?? ''}${mob.exp != null ? ` · ${mob.exp} EXP` : ''}${mob.hp != null ? ` · ${mob.hp} HP` : ''}`)}">${dot(mob.name)}${mob.count ? `${mob.count} × ` : ''}${esc(mob.name)} <small>Lv ${mob.level ?? '?'}</small>${wanted.has(normalize(mob.name)) ? ' ★' : ''}</span>`;
  const sortedMobs = [...d.mobs].sort((a, b) => Number(wanted.has(normalize(b.name))) - Number(wanted.has(normalize(a.name))) || (b.count ?? 0) - (a.count ?? 0));
  const questNpcs = d.npcs.filter(npc => npc.quests.length).slice(0, 3).map(npc => `<span class="arr-line"><strong>${esc(npc.name)}</strong> ${npc.quests.slice(0, 2).map(q => `${q.role === 'gives' ? 'gives' : 'takes'} ${esc(q.name)}`).join(', ')}${npc.quests.length > 2 ? ` +${npc.quests.length - 2}` : ''}</span>`);
  const exitChips = [...d.exits.map(e => ({ to: e.to, name: e.name, note: e.where })), ...d.rides.map(r => ({ to: r.to, name: r.name, note: r.npc }))];
  const glance = `<div class="arr-head"><span class="arrive-tag">You're here</span> <strong class="arr-name">${esc(d.map.name)}</strong>${d.where ? ` <small>· ${esc(d.where)}</small>` : ''}${d.training ? ` <span class="pill">good for Lv ${d.training.from}–${d.training.to}</span>` : ''}</div>
    ${sortedMobs.length ? `<div class="arr-row"><span class="arr-label">Monsters</span>${sortedMobs.slice(0, 4).map(chip).join('')}${sortedMobs.length > 4 ? `<small>+${sortedMobs.length - 4} more</small>` : ''}</div>` : '<div class="arr-row"><span class="arr-label">Monsters</span><small>none here</small></div>'}
    ${questNpcs.length || d.questSteps.length ? `<div class="arr-row"><span class="arr-label">Quests</span>${d.questSteps.slice(0, 2).map(q => `<span class="arr-line">★ ${esc(q.quest)}: ${esc(q.step)}</span>`).join('')}${questNpcs.join('')}</div>` : ''}
    ${exitChips.length ? `<div class="arr-row"><span class="arr-label">Exits</span>${exitChips.slice(0, 6).map(e => `<button type="button" class="arr-exit" data-route="${esc(e.to)}" title="${esc(e.note ?? '')}">${esc(e.name)}</button>`).join('')}${exitChips.length > 6 ? `<small>+${exitChips.length - 6}</small>` : ''}</div>` : ''}
    ${d.bestRun ? `<div class="arr-row"><span class="arr-label">You</span><small>best run here ${d.bestRun.expPerHour.toLocaleString()} EXP/h</small></div>` : ''}`;
  return `<div class="arrive">${glance}
    <details class="arr-more"><summary>More about this map</summary>
    <div class="arrive-grid">
      <section><h4>Monsters (${d.mobs.length})</h4>${list(mobs, 'No monsters listed here.')}</section>
      <section><h4>NPCs (${d.npcs.length})</h4>${list(npcs, 'No NPCs listed here.')}</section>
      <section><h4>Ways out (${exits.length})</h4>${list(exits, 'No exits listed.')}</section>
      <section><h4>This map for you</h4><ul>${facts.join('')}</ul></section>
    </div>
    <p class="fine">Monsters, NPCs and exits from OSMS Data Explorer; drops and quests from MapleClassic Wiki contributors (CC BY-NC-SA 4.0).</p></details></div>`;
}

$('#live-step').addEventListener('click', event => { if (event.target.closest('[data-share-now]')) { startLive(); return; }
  if (event.target.closest('[data-cancel-destination]')) { cancelDestination(); return; }
  const pickName = event.target.closest('[data-character-name]');
  if (pickName) {
    // The progress so far belongs to this character when nothing was set up yet: keep it under its name.
    const name = pickName.dataset.characterName;
    if (!character() && !characters().length) { try { localStorage.setItem(profileKey(name), localStorage.getItem(PROFILE_KEY) ?? JSON.stringify(snapshotProfile(state))); } catch { /* storage blocked */ } }
    switchCharacter(name); return;
  }
  const dismiss = event.target.closest('[data-character-dismiss]'); if (dismiss) { state.characterDismissed = dismiss.dataset.characterDismiss; renderLive(); return; }
  const needTick = event.target.closest('[data-need-tick]');
  if (needTick) {
    const quest = needTick.dataset.needTick, key = `need:${needTick.dataset.need}`, done = new Set(state.questDone[quest] ?? []);
    if (needTick.checked) done.add(key); else done.delete(key);
    state.questDone[quest] = [...done]; state.allTripCache = null; persist(); applyObjective(); renderLive(); return;
  }
  const tripAll = event.target.closest('[data-trip-all]'); if (tripAll) { state.tripAll = tripAll.checked; state.allTripCache = null; saveLive(); applyObjective(); renderLive(); return; }
  const stepBox = event.target.closest('[data-step]'); if (stepBox) { toggleStep(Number(stepBox.dataset.step)); return; }
  const huntMap = event.target.closest('[data-hunt-map]'); if (huntMap) { state.guide.huntMap = huntMap.dataset.huntMap; applyObjective(); renderLive(); return; }
  if (event.target.closest('[data-hand-in]') && state.guide.quest) { state.guide.handIn = state.guide.quest; saveLive(); applyObjective(); renderLive(); return; }
  const none = event.target.closest('[data-start-none]');
  if (none && state.startingQuest) {
    const quest = state.startingQuest; state.startingQuest = null; state.goalNpc = null; saveLive();
    if (none.dataset.startNone === 'done') markFinished(quest); else { state.questsHidden = [...new Set([...state.questsHidden, quest])]; persist(); renderQuestRecs(); }
    reveal('#recs-title'); renderLive(); return;
  }
  const button = event.target.closest('[data-route]'); if (!button || !mapById(button.dataset.route)) return;
  routeToMap(button.dataset.route, button.dataset.routeNpc || null);
});

async function loadPublicData(force = false) {
  if (state.data.portals.length && state.data.targets.length && !force) return;
  $('#refresh-data').disabled = true;
  try { const data = await fetchOsms(); state.data = data; state.dataFetchedAt = Date.now(); persist(); populateMaps(); }
  catch (error) { $('#data-status').textContent = `${error.message} You can import an authorized JSON file or try refreshing later.`; }
  finally { $('#refresh-data').disabled = false; }
}
$('#refresh-data').addEventListener('click', () => loadPublicData(true));
$('#add-goal').addEventListener('click', () => {
  const title = $('#goal-name').value.trim(), mapId = $('#goal-map').value;
  if (!title || !mapId) { status('Enter a stop name and choose its map first.', true); return; }
  state.goals.push({ id: crypto.randomUUID(), title, mapId, done: false });
  $('#goal-name').value = ''; $('#goal-map').value = ''; persist(); renderGoals();
});
$('#import-data').addEventListener('click', () => $('#data-file').click());
$('#data-file').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    if (file.size > 10_000_000) throw new Error('Choose a JSON file under 10 MB.');
    state.data = validateDataset(JSON.parse(await file.text())); state.dataFetchedAt = Date.now(); persist(); populateMaps(); status(`Imported ${state.data.maps.length} maps and ${state.data.portals.length} portals.`);
  } catch (error) { status(`Could not import: ${error.message}`, true); }
  event.target.value = '';
});

$('#export-progress').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(makeProfileBackup(state), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `maple-route-progress-${new Date().toISOString().slice(0, 10)}.json`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
  $('#progress-status').textContent = 'Progress backup downloaded. Keep this file somewhere safe.';
});
$('#import-progress').addEventListener('click', () => $('#progress-file').click());
$('#progress-file').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    if (file.size > 2_000_000) throw new Error('Choose a progress backup under 2 MB.');
    const profile = parseProfileBackup(await file.text());
    if (!confirm('Restore this backup? It will replace the quests, goals, and session progress currently saved in this browser.')) return;
    localStorage.setItem(profileKey(), JSON.stringify(profile));
    location.reload();
  } catch (error) { $('#progress-status').textContent = `Could not restore: ${error.message}`; }
  finally { event.target.value = ''; }
});

try {
  const legacy = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  const saved = JSON.parse(localStorage.getItem(profileKey()) || 'null') || (character() ? null : legacy);
  if (legacy?.data) state.data = validateDataset(legacy.data);
  // Data cached before monster thumbnails existed is refreshed once so the pop-out can show them.
  const hasThumbs = state.data?.targets?.some(t => t.thumb);
  state.dataFetchedAt = hasThumbs ? Number(legacy?.savedAt) || 0 : 0;
  state.current = saved?.current ?? null; state.destination = saved?.destination ?? null;
  state.routeStyle = ['fewest', 'level', 'cautious'].includes(saved?.routeStyle) ? saved.routeStyle : 'fewest'; $('#route-style').value = state.routeStyle;
  state.targetId = saved?.targetId ?? null;
  state.level = Number.isInteger(saved?.level) && saved.level >= 1 && saved.level <= 200 ? saved.level : 15;
  state.job = ['Any', 'Beginner', 'Warrior', 'Magician', 'Bowman', 'Thief'].includes(saved?.job) ? saved.job : 'Any';
  state.focus = ['quests', 'training', 'money', 'item'].includes(saved?.focus) ? saved.focus : 'quests';
  state.guideMode = saved?.guideMode === 'money' ? 'money' : 'xp';
  state.goals = Array.isArray(saved?.goals) ? saved.goals.filter(goal => goal && typeof goal.id === 'string' && typeof goal.title === 'string' && typeof goal.mapId === 'string').slice(0, 200) : [];
  state.questDone = saved?.questDone && typeof saved.questDone === 'object' && !Array.isArray(saved.questDone) ? saved.questDone : {};
  state.activeQuests = Array.isArray(saved?.activeQuests) ? [...new Set(saved.activeQuests.filter(name => typeof name === 'string' && name.length <= 180))].slice(0, 8) : [];
  state.questItemsReady = saved?.questItemsReady && typeof saved.questItemsReady === 'object' && !Array.isArray(saved.questItemsReady) ? saved.questItemsReady : {};
  state.questsAvailable = Array.isArray(saved?.questsAvailable) ? [...new Set(saved.questsAvailable.filter(name => typeof name === 'string' && name.length <= 180))].slice(0, 500) : [];
  state.questsHidden = Array.isArray(saved?.questsHidden) ? [...new Set(saved.questsHidden.filter(name => typeof name === 'string' && name.length <= 180))].slice(0, 500) : [];
  state.questsFinished = Array.isArray(saved?.questsFinished) ? [...new Set(saved.questsFinished.filter(name => typeof name === 'string' && name.length <= 180))].slice(-2000) : [];
  state.gearOwned = saved?.gearOwned && typeof saved.gearOwned === 'object' && !Array.isArray(saved.gearOwned) ? saved.gearOwned : {};
  const partyKeys = new Set([...PARTY_QUEST.preparation.map(row => `prep:${row[0]}`), ...PARTY_QUEST.stages.map(row => `stage:${row[0]}`)]);
  state.partyDone = Array.isArray(saved?.partyDone) ? [...new Set(saved.partyDone.filter(key => partyKeys.has(key)))] : [];
  state.sessions = Array.isArray(saved?.sessions) ? saved.sessions.filter(row => row && typeof row.id === 'string' && typeof row.mapId === 'string' && ['startLevel', 'endLevel', 'minutes', 'expGained', 'mesoChange', 'expPerHour', 'mesosPerHour'].every(key => Number.isFinite(row[key]))).slice(0, 100) : [];
  if (typeof saved?.selectedQuest === 'string' && saved.selectedQuest.length <= 180) { state.selectedQuest = { name: saved.selectedQuest }; $('#quest-query').value = saved.selectedQuest; }
  if (typeof saved?.selectedItemName === 'string' && saved.selectedItemName.length <= 160) selectItem({ name: saved.selectedItemName });
  if (state.selectedQuest || state.activeQuests.length) loadQuestCatalog();
  if (saved?.crop && [saved.crop.x, saved.crop.y, saved.crop.w, saved.crop.h].every(n => Number.isFinite(n) && n >= 0 && n <= 1) && saved.crop.x + saved.crop.w <= 1.001 && saved.crop.y + saved.crop.h <= 1.001) state.crop = saved.crop;
  $('#session-start-level').value = state.level; $('#session-end-level').value = state.level;
  populateMaps();
  if (!legacy?.data || (state.data.source === 'https://osmsdataexplorer.com/' && (!state.data.targets.length || !state.data.portals.some(portal => portal.x !== null && portal.y !== null) || !state.data.portals.some(portal => portal.kind !== 'visible') || !state.data.portals.some(portal => portal.npc) || !state.data.portals.some(portal => portal.boat) || !state.data.maps.some(map => map.mobSpots?.length) || !state.data.maps.some(map => map.returnTo) || !state.data.maps.some(map => map.picture) || !state.data.maps.some(map => map.capacity) || Date.now() - state.dataFetchedAt > 24 * 60 * 60 * 1000))) loadPublicData(true);
} catch { populateMaps(); loadPublicData(true); }
bootstrapping = false;
persist();

// Dev server only: stream new test-log entries to fixtures/live/session.jsonl on this computer so a
// play session can be followed while it happens (see vite.config.js).
if (import.meta.env.DEV) {
  let sentSeq = 0;
  setInterval(() => {
    const fresh = testLog.filter(entry => entry.seq > sentSeq);
    for (const snap of testSnapshots.filter(snap => !snap.sent)) { snap.sent = true; fetch('/__live-log', { method: 'POST', body: JSON.stringify({ kind: 'snapshot', t: snap.t, why: snap.why, image: snap.image }) }).catch(() => {}); }
    if (!fresh.length) return;
    sentSeq = fresh[fresh.length - 1].seq;
    const context = { current: mapById(state.current)?.name ?? null, destination: mapById(state.destination)?.name ?? null, live: Boolean(state.live) };
    fetch('/__live-log', { method: 'POST', body: fresh.map(entry => JSON.stringify({ ...entry, ...context })).join('\n') }).catch(() => {});
  }, 2000);
}

window.addEventListener('beforeunload', () => { stopLive(); if (state.worker?.then) state.worker.then(worker => worker.terminate()).catch(() => {}); });
