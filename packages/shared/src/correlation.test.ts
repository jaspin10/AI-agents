import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correlate, ideaEdges, median, pairEvidence, perPlatform, standingCaution, type InsightVideo } from './correlation.js';

let seq = 0;
const vid = (platform: string, rate: number | null, extra: Partial<InsightVideo> & { format?: string; ideaSource?: string; adBoosted?: boolean | null } = {}): InsightVideo => {
  seq += 1;
  const { format, ideaSource, adBoosted, ...rest } = extra;
  return {
    id: `v${seq}`,
    platform,
    title: `video ${seq}`,
    postedAt: '2026-08-01T00:00:00.000Z',
    views: 1000,
    engagementRatePct: rate,
    hypothesis: null,
    analysis: { description: 'd', hookText: null, format: format ?? 'Talking head', hasModel: null, hasCta: null, ctaType: null, adBoosted: adBoosted ?? false, ideaSource: ideaSource ?? 'Jas' },
    twinIds: [],
    adRunCount: 0,
    ...rest,
  };
};

test('median: odd, even, empty', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
});

test('perPlatform: never blends platforms; small groups are skipped, not claimed', () => {
  const videos: InsightVideo[] = [];
  for (let i = 0; i < 8; i += 1) videos.push(vid('tiktok', 5, { format: 'Skit' }));
  for (let i = 0; i < 8; i += 1) videos.push(vid('tiktok', 2, { format: 'Talking head' }));
  for (let i = 0; i < 3; i += 1) videos.push(vid('youtube', 9, { format: 'Skit' }));
  const reports = perPlatform(videos);
  assert.deepEqual(reports.map((r) => r.platform), ['tiktok', 'youtube']);
  const tt = reports[0];
  const yt = reports[1];
  assert.ok(tt !== undefined && yt !== undefined);
  assert.equal(tt.enoughData, true);
  assert.equal(tt.platformMedianPct, 3.5);
  const skit = tt.claims.find((c) => c.dimension === 'format' && c.value === 'Skit');
  assert.ok(skit !== undefined);
  assert.equal(skit.n, 8);
  assert.equal(skit.direction, 'works');
  assert.equal(skit.strength, 'pooled');
  assert.equal(skit.evidence.videoIds.length, 8);
  // YouTube has only 3 scored videos → no median, no claims, and it never borrows TikTok's numbers.
  assert.equal(yt.enoughData, false);
  assert.equal(yt.claims.length, 0);
  assert.equal(yt.platformMedianPct, null);
});

test('perPlatform: a group under the minimum is listed as skipped', () => {
  const videos: InsightVideo[] = [];
  for (let i = 0; i < 8; i += 1) videos.push(vid('tiktok', 4, { format: 'Skit' }));
  for (let i = 0; i < 2; i += 1) videos.push(vid('tiktok', 40, { format: 'Duet/Stitch' }));
  const tt = perPlatform(videos)[0];
  assert.ok(tt !== undefined);
  assert.equal(tt.claims.some((c) => c.value === 'Duet/Stitch'), false);
  assert.ok(tt.skipped.some((s) => s.value === 'Duet/Stitch' && s.n === 2 && s.reason === 'too_few_videos'));
});

test('perPlatform: videos under the view floor are unscored', () => {
  const videos: InsightVideo[] = [];
  for (let i = 0; i < 8; i += 1) videos.push(vid('tiktok', 4));
  videos.push(vid('tiktok', 99, { views: 50 }));
  const tt = perPlatform(videos)[0];
  assert.ok(tt !== undefined);
  assert.equal(tt.analysedVideos, 9);
  assert.equal(tt.scoredVideos, 8);
  assert.equal(tt.platformMedianPct, 4);
});

test('pairEvidence: one entry per unordered pair, winner by rate, ad confound flagged', () => {
  const a = vid('tiktok', 6, { id: 'a', twinIds: ['b'] });
  const b = vid('youtube', 3, { id: 'b', twinIds: ['a'], adBoosted: true });
  const pairs = pairEvidence([a, b]);
  assert.equal(pairs.length, 1);
  const p = pairs[0];
  assert.ok(p !== undefined);
  assert.equal(p.strength, 'pair');
  assert.equal(p.winner, 'tiktok');
  assert.equal(p.adConfounded, true);
  assert.equal(p.heldConstant.format, 'Talking head');
});

test('pairEvidence: unscored side → no winner', () => {
  const a = vid('tiktok', null, { id: 'a', twinIds: ['b'] });
  const b = vid('youtube', 3, { id: 'b', twinIds: ['a'] });
  assert.equal(pairEvidence([a, b])[0]?.winner, null);
});

test('ideaEdges: auto-match only AI-agent videos posted after the suggestion', () => {
  const before = vid('tiktok', 8, { id: 'before', hypothesis: 'skit+model', postedAt: '2026-08-01T00:00:00.000Z' });
  const after = vid('tiktok', 8, { id: 'after', hypothesis: 'skit+model', ideaSource: 'AI agent', postedAt: '2026-09-05T00:00:00.000Z' });
  const afterNotAi = vid('tiktok', 8, { id: 'notai', hypothesis: 'skit+model', ideaSource: 'Jas', postedAt: '2026-09-05T00:00:00.000Z' });
  const afterByFormat = vid('tiktok', 1, { id: 'byformat', format: 'Skit', ideaSource: 'ai agent', postedAt: '2026-09-06T00:00:00.000Z' });
  const reports = [{ platform: 'tiktok', analysedVideos: 4, scoredVideos: 4, platformMedianPct: 5, enoughData: true, claims: [], skipped: [] }];
  const edges = ideaEdges(
    [{ id: 's1', status: 'posted', createdAt: '2026-09-01T00:00:00.000Z', hypothesis: 'skit+model', theme: 't', format: 'Skit' }],
    [before, after, afterNotAi, afterByFormat],
    reports
  );
  const e = edges[0];
  assert.ok(e !== undefined);
  assert.deepEqual(e.sourceVideoIds, ['before']);
  assert.equal(e.matching, 'auto');
  assert.deepEqual(e.outcomes.map((o) => o.contentId), ['after', 'byformat']);
  assert.equal(e.outcomes[0]?.matchedOn, 'hypothesis');
  assert.equal(e.outcomes[0]?.verdict, 'above_median');
  assert.equal(e.outcomes[1]?.matchedOn, 'format');
  assert.equal(e.outcomes[1]?.verdict, 'below_median');
});

test('standingCaution: B2 and no-pairs lines appear when they apply', () => {
  const withB2 = standingCaution({ analysed: 50, adBoosted: 0, adUnknown: 5, pairs: 0, b2Unresolved: true });
  assert.ok(withB2.some((l) => l.includes('B2')));
  assert.ok(withB2.some((l) => l.includes('No cross-platform ref pairs')));
  assert.ok(withB2.some((l) => l.includes('time-correlation only')));
  const resolved = standingCaution({ analysed: 50, adBoosted: 0, adUnknown: 5, pairs: 2, b2Unresolved: false });
  assert.equal(resolved.some((l) => l.includes('B2')), false);
  assert.ok(resolved.some((l) => l.includes('2 cross-platform ref pair')));
});

test('correlate: caution and method always present, totals count analysed vs scored', () => {
  const videos: InsightVideo[] = [vid('tiktok', 4), vid('tiktok', null, { analysis: null })];
  const report = correlate(videos, [], { b2Unresolved: true, now: '2026-09-10T00:00:00.000Z' });
  assert.equal(report.generatedAt, '2026-09-10T00:00:00.000Z');
  assert.equal(report.totals.videos, 2);
  assert.equal(report.totals.analysed, 1);
  assert.equal(report.totals.scored, 1);
  assert.ok(report.caution.length >= 4);
  assert.ok(report.method.includes('engagement rate'));
});
