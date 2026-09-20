import { rates, velocity, ageDays, type ContentRow, type PerformanceRecord, type MetricProvenance, type CreativeMemory } from '@platform/shared';
import type { ContentAnalysisRow, InsightRunRow } from '@platform/memory';

export interface VideoAnalysis {
  contentUuid: string; platform: string; title: string | null; hypothesis: string | null;
  postedAt: string; capturedAt: string; ageDays: number; format: string | null;
  views: number; engagementRatePct: number | null; shareRatePct: number | null; commentRatePct: number | null;
  metrics: Record<string, { value: number | null; provenance: MetricProvenance }>;
  creativeMemory: Pick<CreativeMemory, 'audience'|'learnerLevel'|'topic'|'purpose'|'languageMix'|'durationSeconds'|'openingLine'|'firstPayoffSeconds'|'ctaSeconds'> | null;
  exposure: 'boosted' | 'reported_not_boosted' | 'unknown';
  analysis: { description: string | null; hookText: string | null; format: string | null; ctaType: string | null; analysedAt: string } | null;
  velocity: ReturnType<typeof velocity>; cautions: string[];
}
export interface AnalysisSummary {
  totalVideos: number; taggedVideos: number; byPlatform: Record<string, number>;
  top: VideoAnalysis[]; bottom: VideoAnalysis[]; all: VideoAnalysis[];
  insight: { id: string; createdAt: string; report: Record<string, unknown> } | null;
  cautions: string[];
}
export const EVIDENCE_CAUTION = 'Observational evidence, not causation. Eight scored videos is a reporting floor, not statistical confidence. Ad exposure and enrollment denominators may be incomplete. Calendar-day snapshots are not exact first-24-hour measurements. Missing duration/definition history prevents fair matched comparisons.';

/** Existing X2 heuristic is deliberately unchanged under C4. Provenance does not rewrite this score. */
export function analyse(content: ContentRow[], performance: PerformanceRecord[], analyses: ContentAnalysisRow[] = [], insight: InsightRunRow | null = null, today = new Date().toISOString().slice(0, 10), memories: Map<string, CreativeMemory> = new Map()): AnalysisSummary {
  const videos: VideoAnalysis[] = [];
  for (const row of content) {
    if (!row.id) continue;
    const history = performance.filter(p => p.contentUuid === row.id && p.platform === row.platform).sort((a,b) => a.capturedAt.localeCompare(b.capturedAt));
    const perf = history.at(-1);
    if (!perf) continue;
    const cm = memories.get(row.id);
    const a = analyses.find(a => a.contentId === row.id);
    const sharesReported = performance.some(p => p.platform === row.platform && p.metrics.shares > 0);
    const derived = rates({ ...perf.metrics, capturedDate: perf.capturedDate }, { sharesReported });
    const metrics: VideoAnalysis['metrics'] = {};
    for (const [name, raw] of Object.entries(perf.metrics)) {
      // Legacy zeros may be schema defaults. Never promote them to observed without source evidence.
      const provenance = perf.provenance?.[name] ?? {
        nativeName: name, source: 'legacy snapshot; native endpoint unrecorded', observationWindow: null,
        capturedAt: perf.capturedAt, denominator: null, definitionVersion: 'legacy-unverified', availability: 'missing' as const,
      };
      metrics[name] = { value: provenance.availability === 'observed' ? raw : null, provenance };
    }
    videos.push({ contentUuid: row.id, platform: row.platform, title: row.title, hypothesis: row.hypothesis,
      postedAt: row.postedAt, capturedAt: perf.capturedAt, ageDays: ageDays(row.postedAt, perf.capturedDate), format: a?.format ?? row.format,
      views: perf.metrics.views, ...derived, metrics,
      creativeMemory: cm ? {audience:cm.audience,learnerLevel:cm.learnerLevel,topic:cm.topic,purpose:cm.purpose,languageMix:cm.languageMix,durationSeconds:cm.durationSeconds,openingLine:cm.openingLine,firstPayoffSeconds:cm.firstPayoffSeconds,ctaSeconds:cm.ctaSeconds}:null,
      exposure: a?.adBoosted === true ? 'boosted' : a?.adBoosted === false ? 'reported_not_boosted' : 'unknown',
      analysis: a ? { description: a.description, hookText: a.hookText, format: a.format, ctaType: a.ctaType, analysedAt: a.analysedAt } : null,
      velocity: velocity(history.map(p => ({ ...p.metrics, capturedDate: p.capturedDate })), row.postedAt, today),
      cautions: ['Rates use the locked X2 legacy availability heuristic; they are not verified complete engagement.',
        ...(row.platform.startsWith('youtube') ? ['Shorts classification and views/engaged-views denominators unverified; do not combine definitions.'] : []),
        ...(ageDays(perf.capturedAt, today) > 2 ? ['Stale snapshot: more than two calendar days old.'] : [])],
    });
  }
  // Sampling within platform/age/format/exposure cohorts, never a global top ten.
  // Unknown duration means comparisons remain exploratory (explicit caution).
  const cohorts = new Map<string, VideoAnalysis[]>();
  for (const v of videos.filter(v => v.views >= 100 && v.engagementRatePct !== null)) {
    const key = JSON.stringify([v.platform, v.ageDays, v.format, v.exposure, v.creativeMemory?.durationSeconds ?? null]);
    cohorts.set(key, [...(cohorts.get(key) ?? []), v]);
  }
  const top: VideoAnalysis[] = [], bottom: VideoAnalysis[] = [];
  for (const cohort of cohorts.values()) {
    if (cohort.length < 8) continue;
    const ranked = [...cohort].sort((a,b) => (b.engagementRatePct ?? 0) - (a.engagementRatePct ?? 0) || a.contentUuid.localeCompare(b.contentUuid));
    top.push(...ranked.slice(0, 3)); bottom.push(...ranked.slice(-3).reverse());
  }
  const byPlatform: Record<string, number> = {};
  for (const v of videos) byPlatform[v.platform] = (byPlatform[v.platform] ?? 0) + 1;
  return { totalVideos: videos.length, taggedVideos: videos.filter(v => v.hypothesis !== null).length, byPlatform,
    top, bottom, all: videos, insight: insight ? { id: insight.id, createdAt: insight.createdAt, report: insight.report } : null,
    cautions: [EVIDENCE_CAUTION, 'No ranked cohort means insufficient comparable evidence; label ideas creative exploration.'] };
}

export function evidenceForPrompt(summary: AnalysisSummary): VideoAnalysis[] {
  // Round-robin per platform, bounded prompt size. No platform wins merely by volume.
  const groups = Object.keys(summary.byPlatform).sort().map(p => {
    const ordered = [...summary.top, ...summary.bottom, ...summary.all].filter(v => v.platform === p);
    return [...new Map(ordered.map(v => [v.contentUuid, v])).values()].slice(0, 6);
  });
  return Array.from({length: 6}, (_, i) => groups.flatMap(g => g[i] ? [g[i]!] : [])).flat();
}
export function validateEvidence(ids: string[], insightId: string | null, summary: AnalysisSummary): void {
  const allowed = new Set(evidenceForPrompt(summary).map(v => v.contentUuid));
  if (ids.some(id => !allowed.has(id)) || new Set(ids).size !== ids.length) throw new Error('invalid_evidence_reference');
  if (insightId !== (summary.insight?.id ?? null)) throw new Error('invalid_insight_reference');
}
