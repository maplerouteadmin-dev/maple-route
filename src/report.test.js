import test from 'node:test';
import assert from 'node:assert/strict';
import { issueUrl, problemReport, dropReport } from './report.js';

test('a problem report carries app facts only and stays a valid GitHub link', () => {
  const log = [{ kind: 'chat', trades: ['sell Ilbi 5m'] }, { kind: 'title', text: 'Henesys\nHunting Ground I', accepted: 'Henesys Hunting Ground I', matches: ['Henesys Hunting Ground I 0.97'] }];
  const report = problemReport({ version: '0.2.0', current: 'Henesys Hunting Ground I', live: true, frame: '2560x1440', log });
  assert.match(report.body, /Henesys Hunting Ground I 0\.97/);
  assert.doesNotMatch(report.body, /Ilbi/); // chat never goes in
  const url = issueUrl(report);
  assert.ok(url.startsWith('https://github.com/maplerouteadmin-dev/maple-route/issues/new?'));
  assert.equal(new URL(url).searchParams.get('labels'), 'bug');
  assert.ok(issueUrl({ title: 'x', body: 'y'.repeat(20000) }).length <= 7000);
});

test('a drop report names the item, monster and map', () => {
  const report = dropReport({ item: 'Diamond Ore', monster: 'Stone Golem', map: 'Excavation Site' });
  assert.equal(report.title, 'Drop: Diamond Ore from Stone Golem');
  assert.match(report.body, /\*\*Map:\*\* Excavation Site/);
});
