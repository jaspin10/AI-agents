import { rates, ageDays, type Rates } from './metrics.js';
import { median, MIN_GROUP_SIZE, MIN_VIEWS, CALL_OUT_THRESHOLD } from './correlation.js';
import type { ContentRow } from './schemas/content.js';
import type { PerformanceRecord, VideoMetrics } from './schemas/performance.js';
import type { CreativeMemory } from './creative-memory.js';

/** Display-only diagnosis. Does not change X2 rates, X6 scores, or persisted reports. */
export interface BrainAnalysis {
  contentId: string; format: string | null; adBoosted: boolean | null;
  hookText: string | null; ctaType: string | null; description: string | null;
}
export type BrainOutcome = 'above' | 'below' | 'typical' | 'insufficient' | 'unmeasured';
export interface BrainComparison {
  day: number | null; capturedDate: string | null; targetRate: number | null;
  medianRate: number | null; relativeDelta: number | null; n: number;
  peers: Array<{ id: string; title: string | null; rate: number; capturedDate: string }>;
  reason: string; scope: string;
}
export interface BrainVideo {
  id: string; title: string | null; platform: string; postedAt: string; platformVideoId: string;
  hypothesis: string | null; format: string | null; exposure: 'boosted' | 'reported_not_boosted' | 'unknown';
  analysed: boolean; snapshotCount: number; capturedDate: string | null; stale: boolean;
  metrics: VideoMetrics | null; rates: Rates | null; provenance: PerformanceRecord['provenance'];
  outcome: BrainOutcome; comparison: BrainComparison; cautions: string[];
  possibleCauses: Array<{ category: string; hypothesis: string; evidence: string }>;
  unknowns: string[]; nextTest: string;
}
export const BRAIN_OUTCOME_LABELS: Record<BrainOutcome, string> = {
  above: 'Above baseline', below: 'Below baseline', typical: 'Near baseline',
  insufficient: 'More data needed', unmeasured: 'No snapshot',
};
/** Preserve raw snapshots for provenance, but never display an explicitly unavailable counter as zero. */
export function brainMetricValue(v: Pick<BrainVideo,'metrics'|'provenance'>, key: keyof VideoMetrics): number | null {
  const availability=v.provenance?.[key]?.availability;
  return availability && availability!=='observed' ? null : v.metrics?.[key]??null;
}

/** Canonical UUID + platform only: native IDs are never evidence joins. */
export function brainHistory(content: readonly ContentRow[], performance: readonly PerformanceRecord[]) {
  const platforms = new Map(content.filter(c => c.id).map(c => [c.id!, c.platform]));
  const grouped = new Map<string, PerformanceRecord[]>();
  for (const p of performance) {
    if (!p.contentUuid || platforms.get(p.contentUuid) !== p.platform) continue;
    const rows = grouped.get(p.contentUuid) ?? [];
    rows.push(p); grouped.set(p.contentUuid, rows);
  }
  for (const [id, rows] of grouped) {
    rows.sort((a, b) => a.capturedDate.localeCompare(b.capturedDate) || a.capturedAt.localeCompare(b.capturedAt));
    // One UTC-day observation per video. Deterministic even for malformed duplicate inputs.
    grouped.set(id, [...new Map(rows.map(p => [p.capturedDate, p])).values()]);
  }
  return grouped;
}

const normalized = (s: string | null | undefined) => s?.trim().toLocaleLowerCase('en') || null;
const exposure = (a: BrainAnalysis | undefined) => a?.adBoosted === true ? 'boosted' as const : a?.adBoosted === false ? 'reported_not_boosted' as const : 'unknown' as const;
function usableMetrics(p: PerformanceRecord, sharesReported: boolean): boolean {
  return ['views', 'likes', 'comments', ...(sharesReported ? ['shares'] : []), ...(p.metrics.saves === null ? [] : ['saves'])]
    .every(k => !p.provenance?.[k] || p.provenance[k]!.availability === 'observed');
}
function definition(p: PerformanceRecord, sharesReported: boolean): string {
  // A verified native definition cannot silently be pooled with a legacy or differently defined metric.
  return JSON.stringify(['views', 'likes', 'comments', ...(sharesReported ? ['shares'] : []), ...(p.metrics.saves === null ? [] : ['saves'])].map(k => {
    const v = p.provenance?.[k];
    return v ? [k, v.availability, v.nativeName, v.source, v.denominator, v.definitionVersion, v.observationWindow] : [k, 'legacy-unverified'];
  }));
}

export function diagnoseVideos(input: {
  content: readonly ContentRow[]; performance: readonly PerformanceRecord[]; analyses: readonly BrainAnalysis[];
  memories?: ReadonlyMap<string, CreativeMemory>; today: string;
  focusId?: string; peerLimit?: number;
}): BrainVideo[] {
  const { content, performance, analyses, today } = input;
  const history = brainHistory(content, performance);
  const analysisById = new Map(analyses.map(a => [a.contentId, a]));
  const shares = new Set(performance.filter(p => p.metrics.shares > 0).map(p => p.platform));
  const rateCache = new Map<PerformanceRecord, Rates>();
  const definitionCache = new Map<PerformanceRecord, string>();
  const rate = (p: PerformanceRecord) => {
    if (!rateCache.has(p)) rateCache.set(p, rates({ ...p.metrics, capturedDate: p.capturedDate }, { sharesReported: shares.has(p.platform) }));
    return rateCache.get(p)!;
  };
  const signature = (p: PerformanceRecord) => {
    if (!definitionCache.has(p)) definitionCache.set(p, definition(p, shares.has(p.platform)));
    return definitionCache.get(p)!;
  };
  const atDay = new Map<string, Map<number, PerformanceRecord>>();
  for (const c of content) if (c.id) {
    atDay.set(c.id, new Map((history.get(c.id) ?? []).map(p => [ageDays(c.postedAt, p.capturedDate), p])));
  }
  return content.filter((c): c is ContentRow & { id: string } => !!c.id && (!input.focusId || c.id === input.focusId)).map(c => {
    const a = analysisById.get(c.id), cm = input.memories?.get(c.id);
    const snapshots = history.get(c.id) ?? [], latest = snapshots.at(-1);
    const format = a?.format ?? c.format;
    const cautions = [
      'Observational comparison, not a cause or a statistical confidence estimate.',
      'Engagement uses the existing X2 calculation and availability heuristic, including available saves.',
      'Calendar-day captures are not exact elapsed 24-hour windows.',
    ];
    if (['views','likes','comments'].some(k=>!latest?.provenance?.[k])) cautions.push('Some native metric definitions were not recorded for these legacy snapshots.');
    if (exposure(a) === 'unknown') cautions.push('Ad exposure is unknown; this is not an organic-only comparison.');
    if (!cm?.durationSeconds) cautions.push('Duration is unrecorded; peers with unknown duration may differ in length.');
    const stale = !!latest && ageDays(latest.capturedDate, today) > 2;
    if (stale) cautions.push('Latest snapshot is more than two calendar days old.');
    const candidateDays = [30, 7, 1].filter(day => atDay.get(c.id)?.has(day));
    let comparison: BrainComparison = {
      day: null, capturedDate: null, targetRate: null, medianRate: null, relativeDelta: null, n: 0, peers: [],
      reason: !latest ? 'No recorded performance snapshot.' : !normalized(format) ? 'Add a format in Content notes before comparing videos.' : 'No exact day 1, 7 or 30 snapshot. Approximate history remains available in Metrics.',
      scope: 'Same platform, format, calendar-day age, ad status and compatible metric definitions. Known durations must be within 20%; unknown matches unknown.',
    };
    let outcome: BrainOutcome = latest ? 'insufficient' : 'unmeasured';
    if (normalized(format)) for (const day of candidateDays) {
      const target = atDay.get(c.id)!.get(day)!;
      const targetRate = rate(target).engagementRatePct;
      if (target.metrics.views < MIN_VIEWS || targetRate === null || !usableMetrics(target, shares.has(c.platform))) {
        if (comparison.day === null) comparison = { ...comparison, day, capturedDate: target.capturedDate, targetRate, reason: target.metrics.views < MIN_VIEWS ? 'This observation has fewer than 100 views; it is not scored.' : 'Native metric availability is incomplete; this observation is not scored.' };
        continue;
      }
      const peers: BrainComparison['peers'] = [];
      for (const other of content) {
        if (!other.id || other.id === c.id || other.platform !== c.platform) continue;
        const oa = analysisById.get(other.id);
        if (normalized(oa?.format ?? other.format) !== normalized(format) || exposure(oa) !== exposure(a)) continue;
        const duration = cm?.durationSeconds ?? null, otherDuration = input.memories?.get(other.id)?.durationSeconds ?? null;
        if ((duration === null) !== (otherDuration === null) || (duration !== null && otherDuration !== null && Math.abs(otherDuration - duration) / duration > 0.2)) continue;
        const p = atDay.get(other.id)?.get(day);
        if (!p || p.metrics.views < MIN_VIEWS || !usableMetrics(p, shares.has(c.platform)) || signature(p) !== signature(target)) continue;
        const r = rate(p).engagementRatePct;
        if (r !== null) peers.push({ id: other.id, title: other.title, rate: r, capturedDate: p.capturedDate });
      }
      peers.sort((x, y) => x.id.localeCompare(y.id));
      const enough = peers.length >= MIN_GROUP_SIZE, baseline = enough ? median(peers.map(p => p.rate)) : null;
      const delta = baseline !== null && baseline > 0 ? (targetRate - baseline) / baseline : null;
      const candidate: BrainComparison = { day, capturedDate: target.capturedDate, targetRate, medianRate: baseline, relativeDelta: delta, n: peers.length, peers: peers.slice(0, input.peerLimit ?? 60),
        scope: comparison.scope,
        reason: !enough ? 'Need at least 8 other comparable scored videos; found ' + peers.length + '.' : baseline === 0 ? 'The peer median is zero; a relative comparison is not meaningful.' : 'Day ' + day + ' engagement against ' + peers.length + ' other comparable videos. Eight is a reporting floor, not proof.',
      };
      // Prefer the longest available window with enough evidence. Otherwise show the most mature attempted window.
      if (comparison.day === null || enough) comparison = candidate;
      if (delta !== null) {
        outcome = delta >= CALL_OUT_THRESHOLD ? 'above' : delta <= -CALL_OUT_THRESHOLD ? 'below' : 'typical';
        break;
      }
    }
    const possibleCauses: BrainVideo['possibleCauses'] = [];
    if (a?.hookText || cm?.openingLine) possibleCauses.push({
      category: 'Opening', evidence: 'A human recorded this opening: ' + (cm?.openingLine || a?.hookText),
      hypothesis: outcome === 'above' ? 'The opening may be worth repeating in a matched follow-up. This result does not isolate its effect.' : 'A clearer opening promise is a candidate to test. No opening-retention measurement identifies it as the cause.',
    });
    if (a?.ctaType) possibleCauses.push({
      category: 'Call to action', evidence: 'Recorded CTA type: ' + a.ctaType,
      hypothesis: 'Test one alternative CTA while keeping the lesson and format stable; the recorded CTA does not establish why viewers responded.',
    });
    const unknowns = [
      'Timestamp-level retention, early hold, completion and replay are not supplied by this dataset.',
      'Audience fit, packaging, posting context and creative fatigue have no isolated causal measurement here.',
      'A video cannot be linked to enrollments or revenue from the available data.',
      ...(!a ? ['No human content analysis is recorded.'] : []),
      ...(exposure(a) === 'unknown' ? ['Whether ads affected these results has not been confirmed.'] : []),
    ];
    const nextTest = outcome === 'above'
      ? 'Repeat the useful lesson structure in another episode on this platform. Keep the format and comparison day; change one element and check whether the result repeats.'
      : outcome === 'below'
      ? 'Keep the topic and lesson; test one documented element (' + (possibleCauses[0]?.category.toLowerCase() ?? 'format') + '). Compare engagement at the same recorded age. Treat the explanation as a hypothesis.'
      : 'Collect missing content notes and comparable snapshots before declaring a winner. A new brief can be labelled creative exploration.';
    const displayedRates=latest?{...rate(latest)}:null;
    if(latest&&displayedRates) {
      const available=(key:string)=>!latest.provenance?.[key]||latest.provenance[key]!.availability==='observed';
      if(!usableMetrics(latest,shares.has(c.platform)))displayedRates.engagementRatePct=null;
      if(!available('views')||!available('comments'))displayedRates.commentRatePct=null;
      if(!available('views')||!available('shares'))displayedRates.shareRatePct=null;
    }
    return { id: c.id, title: c.title, platform: c.platform, postedAt: c.postedAt, platformVideoId: c.platformVideoId, hypothesis: c.hypothesis,
      format, exposure: exposure(a), analysed: !!a, snapshotCount: snapshots.length, capturedDate: latest?.capturedDate ?? null,
      stale, metrics: latest?.metrics ?? null, rates: displayedRates, provenance: latest?.provenance,
      outcome, comparison, cautions, possibleCauses, unknowns, nextTest };
  }).sort((a, b) => b.postedAt.localeCompare(a.postedAt) || a.id.localeCompare(b.id));
}
