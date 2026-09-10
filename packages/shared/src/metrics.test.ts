import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adSplit, AD_SPLIT_LABEL, ageDays, followerNormalised, rates, velocity, type Snapshot } from './metrics.js';

const snap = (capturedDate: string, views: number, extra: Partial<Snapshot> = {}): Snapshot => ({
  capturedDate,
  views,
  likes: 0,
  comments: 0,
  shares: 0,
  saves: null,
  followersAtCapture: null,
  ...extra,
});

test('rates: % of views, null on zero views, null share when unreported', () => {
  const r = rates(snap('2026-09-01', 1000, { likes: 50, comments: 10, shares: 5, saves: 5 }));
  assert.equal(r.commentRatePct, 1);
  assert.equal(r.shareRatePct, 0.5);
  assert.equal(r.engagementRatePct, 7);
  assert.equal(rates(snap('2026-09-01', 0)).commentRatePct, null);
  const yt = rates(snap('2026-09-01', 100, { likes: 10 }), { sharesReported: false });
  assert.equal(yt.shareRatePct, null);
  assert.equal(yt.engagementRatePct, 10);
});

test('ageDays: same day is 0, ignores time of day', () => {
  assert.equal(ageDays('2026-09-01T23:59:00Z', '2026-09-01'), 0);
  assert.equal(ageDays('2026-09-01T23:59:00Z', '2026-09-08'), 7);
});

test('velocity: exact, approx (flagged with real age), too_new, no_snapshot', () => {
  const posted = '2026-08-01T10:00:00Z';
  const snaps = [snap('2026-08-02', 100), snap('2026-08-06', 500), snap('2026-08-20', 900)];
  const v = velocity(snaps, posted, '2026-08-25');
  assert.deepEqual(v.day1, { status: 'exact', views: 100, day: 1 });
  assert.deepEqual(v.day7, { status: 'approx', views: 500, day: 5 });
  assert.deepEqual(v.day30, { status: 'too_new' });
  const none = velocity([snap('2026-08-20', 900)], posted, '2026-09-10');
  assert.deepEqual(none.day1, { status: 'no_snapshot' });
  assert.deepEqual(none.day7, { status: 'no_snapshot' });
  assert.deepEqual(none.day30, { status: 'approx', views: 900, day: 19 });
});

test('followerNormalised: uses earliest post-date snapshot with followers, reports the date', () => {
  const f = followerNormalised(
    [snap('2026-08-02', 100, { followersAtCapture: 2000 }), snap('2026-08-10', 800, { followersAtCapture: 2500 })],
    '2026-08-01T00:00:00Z'
  );
  assert.equal(f.viewsPerFollower, 0.4);
  assert.equal(f.followersFromDate, '2026-08-02');
  assert.equal(followerNormalised([snap('2026-08-02', 100)], '2026-08-01T00:00:00Z').viewsPerFollower, null);
});

test('adSplit: combined inside/outside across multiple runs, open run runs to today, label always present', () => {
  const snaps = [
    snap('2026-08-01', 0),
    snap('2026-08-05', 100), // (1,5] no run → outside
    snap('2026-08-10', 400), // (5,10] overlaps run A 8–9 → inside
    snap('2026-08-15', 450), // (10,15] → outside
    snap('2026-08-20', 900), // (15,20] overlaps run B 18–open → inside
  ];
  const s = adSplit(snaps, [{ startDate: '2026-08-08', endDate: '2026-08-09' }, { startDate: '2026-08-18', endDate: null }, { startDate: null, endDate: null }], '2026-08-25');
  assert.equal(s.label, AD_SPLIT_LABEL);
  assert.equal(s.insideAdWindows, 750);
  assert.equal(s.outsideAdWindows, 150);
  assert.equal(s.runsUsed, 2);
  assert.equal(s.runsIgnoredNoStart, 1);
  assert.equal(s.computable, true);
  assert.equal(adSplit(snaps, [], '2026-08-25').computable, false);
  assert.equal(adSplit([snaps[0] as Snapshot], [{ startDate: '2026-08-01', endDate: null }], '2026-08-25').computable, false);
});
