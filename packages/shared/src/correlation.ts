/**
 * X6 — agent correlation (docs/spec/x-series.md, X6). Pure functions: the
 * NUMBERS behind "what works and what doesn't". No I/O, no LLM. The agent in
 * packages/agents/analyst/src/insights.ts feeds these results to the LLM for
 * wording only — every figure in the report comes from here, never from the
 * model (locked 2026-09-10, Jas: "program counts, AI writes the words").
 *
 * Locked sub-decisions (2026-09-10, Jas):
 *   - results are broken down PER PLATFORM, never blended
 *   - a group needs >= MIN_GROUP_SIZE (8) scored videos before a claim is made
 *   - the score is engagement rate (likes+comments+shares+saves ÷ views),
 *     taken from X2's rates() — not reimplemented here
 *   - a cross-platform ref pair is STRONGER evidence than a pooled claim and
 *     is labelled as such on the payload (strength: 'pair' vs 'pooled')
 *   - suggestion → outcome edges are matched automatically: candidate videos
 *     are those Eknoor tagged idea_source = "AI agent", posted after the
 *     suggestion, with a matching format or hypothesis tag
 *   - the standing caution is part of the report payload, always
 */

export const MIN_GROUP_SIZE = 8;
/** Below this many views a rate is noise, same floor the M4 analyst uses. */
export const MIN_VIEWS = 100;
/** Relative distance from the platform median before a group is called out. */
export const CALL_OUT_THRESHOLD = 0.2;

export interface InsightAnalysis {
  description: string | null;
  hookText: string | null;
  format: string | null;
  hasModel: boolean | null;
  hasCta: boolean | null;
  ctaType: string | null;
  /** Tri-state: true / false / null "don't know". */
  adBoosted: boolean | null;
  ideaSource: string | null;
}

export interface InsightVideo {
  id: string;
  platform: string;
  title: string | null;
  postedAt: string;
  /** Latest snapshot views, null when never captured. */
  views: number | null;
  /** From X2 rates() on the latest snapshot. null = unscorable. */
  engagementRatePct: number | null;
  /** content.hypothesis — X1's mechanical tag today, X6-approved tags later. */
  hypothesis: string | null;
  analysis: InsightAnalysis | null;
  /** 0..N twins on other platforms (content_analysis_refs). */
  twinIds: string[];
  adRunCount: number;
}

export type Dimension = 'format' | 'idea_source' | 'cta_type' | 'has_model' | 'hypothesis';
export const DIMENSIONS: readonly Dimension[] = ['format', 'idea_source', 'cta_type', 'has_model', 'hypothesis'];

export type Direction = 'works' | 'doesnt' | 'neutral';

export interface Claim {
  platform: string;
  dimension: Dimension;
  value: string;
  /** Scored videos in this group (views >= MIN_VIEWS and a rate). */
  n: number;
  medianEngagementPct: number;
  platformMedianPct: number;
  /** Relative delta vs the platform median, e.g. 0.35 = +35%. */
  relativeDelta: number;
  direction: Direction;
  /** Pooled across unrelated videos — weaker than a pair. */
  strength: 'pooled';
  evidence: {
    videoIds: string[];
    adBoostedCount: number;
    adUnknownCount: number;
  };
}

export interface SkippedGroup {
  platform: string;
  dimension: Dimension;
  value: string;
  n: number;
  reason: 'too_few_videos';
}

export interface PlatformReport {
  platform: string;
  analysedVideos: number;
  scoredVideos: number;
  /** null when fewer than MIN_GROUP_SIZE scored videos exist on the platform. */
  platformMedianPct: number | null;
  enoughData: boolean;
  claims: Claim[];
  skipped: SkippedGroup[];
}

export interface PairSide {
  contentId: string;
  platform: string;
  title: string | null;
  engagementRatePct: number | null;
  views: number | null;
  adBoosted: boolean | null;
}

/** One cross-platform twin pair, identical content, platform the only variable. */
export interface PairEvidence {
  strength: 'pair';
  /** What was held constant, from the analysis (either side's, they should match). */
  heldConstant: { format: string | null; ideaSource: string | null; hypothesis: string | null };
  sides: PairSide[];
  /** Platform with the higher engagement rate, null when either side is unscored or tied. */
  winner: string | null;
  /** True when at least one side has a confounding ad run / boosted flag. */
  adConfounded: boolean;
}

export interface IdeaEdge {
  suggestionId: string;
  suggestionTheme: string | null;
  suggestionStatus: string;
  suggestionHypothesis: string | null;
  suggestionFormat: string | null;
  /** Videos the suggestion drew on: same hypothesis tag, posted BEFORE it. */
  sourceVideoIds: string[];
  /** Auto-matched outcome videos (idea_source = AI agent, posted after, tag/format match). */
  outcomes: Array<{
    contentId: string;
    platform: string;
    title: string | null;
    engagementRatePct: number | null;
    platformMedianPct: number | null;
    verdict: 'above_median' | 'below_median' | 'unscored';
    matchedOn: 'hypothesis' | 'format';
  }>;
  /** Always 'auto' — nobody confirmed this link (locked: automatic matching, no picker). */
  matching: 'auto';
}

export interface SuggestionForEdges {
  id: string;
  status: string;
  createdAt: string;
  hypothesis: string | null;
  theme: string | null;
  format: string | null;
}

export interface CorrelationReport {
  generatedAt: string;
  totals: { videos: number; analysed: number; scored: number; pairs: number; adRuns: number };
  perPlatform: PlatformReport[];
  pairs: PairEvidence[];
  edges: IdeaEdge[];
  /** Standing caution — required in the agent's own output, not just the spec. */
  caution: string[];
  method: string;
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const m = sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
  return Math.round(m * 100) / 100;
}

function isScored(v: InsightVideo): v is InsightVideo & { views: number; engagementRatePct: number } {
  return v.views !== null && v.views >= MIN_VIEWS && v.engagementRatePct !== null;
}

function dimensionValue(v: InsightVideo, d: Dimension): string | null {
  const a = v.analysis;
  switch (d) {
    case 'format':
      return a?.format ?? null;
    case 'idea_source':
      return a?.ideaSource ?? null;
    case 'cta_type':
      return a === null ? null : a.hasCta === true ? (a.ctaType ?? 'cta') : a.hasCta === false ? 'none' : null;
    case 'has_model':
      return a === null || a.hasModel === null ? null : a.hasModel ? 'yes' : 'no';
    case 'hypothesis':
      return v.hypothesis;
  }
}

function direction(relativeDelta: number): Direction {
  if (relativeDelta >= CALL_OUT_THRESHOLD) return 'works';
  if (relativeDelta <= -CALL_OUT_THRESHOLD) return 'doesnt';
  return 'neutral';
}

/**
 * Per-platform breakdown. Groups by each dimension within a platform, compares
 * the group's median engagement rate to the platform's median. Never pools
 * across platforms — the same format can behave differently on each.
 */
export function perPlatform(videos: readonly InsightVideo[], minGroupSize = MIN_GROUP_SIZE): PlatformReport[] {
  const platforms = [...new Set(videos.map((v) => v.platform))].sort();
  return platforms.map((platform) => {
    const onPlatform = videos.filter((v) => v.platform === platform);
    const analysed = onPlatform.filter((v) => v.analysis !== null);
    const scored = analysed.filter(isScored);
    const platformMedianPct = scored.length >= minGroupSize ? median(scored.map((v) => v.engagementRatePct)) : null;
    const claims: Claim[] = [];
    const skipped: SkippedGroup[] = [];
    if (platformMedianPct !== null) {
      for (const dimension of DIMENSIONS) {
        const groups = new Map<string, Array<InsightVideo & { views: number; engagementRatePct: number }>>();
        for (const v of scored) {
          const value = dimensionValue(v, dimension);
          if (value === null) continue;
          const key = value.trim();
          if (key === '') continue;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)?.push(v);
        }
        for (const [value, members] of groups) {
          if (members.length < minGroupSize) {
            skipped.push({ platform, dimension, value, n: members.length, reason: 'too_few_videos' });
            continue;
          }
          const medianEngagementPct = median(members.map((m) => m.engagementRatePct)) as number;
          const relativeDelta = platformMedianPct === 0 ? 0 : Math.round(((medianEngagementPct - platformMedianPct) / platformMedianPct) * 100) / 100;
          claims.push({
            platform,
            dimension,
            value,
            n: members.length,
            medianEngagementPct,
            platformMedianPct,
            relativeDelta,
            direction: direction(relativeDelta),
            strength: 'pooled',
            evidence: {
              videoIds: members.map((m) => m.id),
              adBoostedCount: members.filter((m) => m.analysis?.adBoosted === true || m.adRunCount > 0).length,
              adUnknownCount: members.filter((m) => m.analysis?.adBoosted === null).length,
            },
          });
        }
      }
    }
    claims.sort((a, b) => Math.abs(b.relativeDelta) - Math.abs(a.relativeDelta));
    return {
      platform,
      analysedVideos: analysed.length,
      scoredVideos: scored.length,
      platformMedianPct,
      enoughData: platformMedianPct !== null,
      claims,
      skipped,
    };
  });
}

/**
 * Cross-platform pairs from content_analysis_refs — identical content, hook /
 * format / idea_source held constant, platform the only thing that varies.
 * Each unordered pair appears once.
 */
export function pairEvidence(videos: readonly InsightVideo[]): PairEvidence[] {
  const byId = new Map(videos.map((v) => [v.id, v] as const));
  const seen = new Set<string>();
  const out: PairEvidence[] = [];
  for (const v of videos) {
    for (const twinId of v.twinIds) {
      const key = [v.id, twinId].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      const twin = byId.get(twinId);
      if (twin === undefined) continue;
      const sides: PairSide[] = [v, twin].map((s) => ({
        contentId: s.id,
        platform: s.platform,
        title: s.title,
        engagementRatePct: isScored(s) ? s.engagementRatePct : null,
        views: s.views,
        adBoosted: s.analysis?.adBoosted ?? null,
      }));
      const a = sides[0] as PairSide;
      const b = sides[1] as PairSide;
      let winner: string | null = null;
      if (a.engagementRatePct !== null && b.engagementRatePct !== null && a.engagementRatePct !== b.engagementRatePct) {
        winner = a.engagementRatePct > b.engagementRatePct ? a.platform : b.platform;
      }
      const held = v.analysis ?? twin.analysis;
      out.push({
        strength: 'pair',
        heldConstant: { format: held?.format ?? null, ideaSource: held?.ideaSource ?? null, hypothesis: v.hypothesis ?? twin.hypothesis },
        sides,
        winner,
        adConfounded: [v, twin].some((s) => s.analysis?.adBoosted === true || s.adRunCount > 0),
      });
    }
  }
  return out;
}

const AI_AGENT_SOURCE = 'ai agent';

/**
 * Idea-map edges: suggestion → source videos → outcome. Outcome videos are
 * auto-matched (locked): idea_source "AI agent", posted after the suggestion,
 * same hypothesis tag or same format slug. Nothing here is confirmed by a
 * person — the payload says so (matching: 'auto').
 */
export function ideaEdges(
  suggestions: readonly SuggestionForEdges[],
  videos: readonly InsightVideo[],
  platformReports: readonly PlatformReport[]
): IdeaEdge[] {
  const medianByPlatform = new Map(platformReports.map((p) => [p.platform, p.platformMedianPct] as const));
  const aiVideos = videos.filter((v) => (v.analysis?.ideaSource ?? '').trim().toLowerCase() === AI_AGENT_SOURCE);
  return suggestions.map((s) => {
    const sourceVideoIds =
      s.hypothesis === null ? [] : videos.filter((v) => v.hypothesis === s.hypothesis && v.postedAt < s.createdAt).map((v) => v.id);
    const formatSlug = s.format === null ? null : slug(s.format);
    const outcomes: IdeaEdge['outcomes'] = [];
    for (const v of aiVideos) {
      if (v.postedAt <= s.createdAt) continue;
      let matchedOn: 'hypothesis' | 'format' | null = null;
      if (s.hypothesis !== null && v.hypothesis === s.hypothesis) matchedOn = 'hypothesis';
      else if (formatSlug !== null && v.analysis?.format !== null && v.analysis?.format !== undefined && slug(v.analysis.format) === formatSlug) matchedOn = 'format';
      if (matchedOn === null) continue;
      const platformMedianPct = medianByPlatform.get(v.platform) ?? null;
      const rate = isScored(v) ? v.engagementRatePct : null;
      let verdict: IdeaEdge['outcomes'][number]['verdict'] = 'unscored';
      if (rate !== null && platformMedianPct !== null) verdict = rate >= platformMedianPct ? 'above_median' : 'below_median';
      outcomes.push({ contentId: v.id, platform: v.platform, title: v.title, engagementRatePct: rate, platformMedianPct, verdict, matchedOn });
    }
    return {
      suggestionId: s.id,
      suggestionTheme: s.theme,
      suggestionStatus: s.status,
      suggestionHypothesis: s.hypothesis,
      suggestionFormat: s.format,
      sourceVideoIds,
      outcomes,
      matching: 'auto',
    };
  });
}

export interface CautionInput {
  analysed: number;
  adBoosted: number;
  adUnknown: number;
  pairs: number;
  /** B2 (enrollment reconciliation) still unresolved → denominator incomplete. */
  b2Unresolved: boolean;
}

/** The standing caution. Always emitted, in the agent's own output. */
export function standingCaution(input: CautionInput): string[] {
  const lines = [
    `${input.analysed} analysed videos with ad-spend confounds (${input.adBoosted} boosted, ${input.adUnknown} unknown) is enough for patterns, not proof. Everything here is a hypothesis to test, never a conclusion.`,
    'Any link to enrollments is time-correlation only — Stripe carries no reference to a video, and no analysis can create one.',
  ];
  if (input.b2Unresolved) {
    lines.push('B2 (enrollment reconciliation) is unresolved: e-transfer and manual invoices are invisible to this system, so the enrollment denominator itself is incomplete.');
  }
  if (input.pairs === 0) {
    lines.push('No cross-platform ref pairs exist yet — every claim below is pooled across unrelated videos, the weaker kind of evidence. Pairs (same video on two platforms) would be stronger.');
  } else {
    lines.push(`${input.pairs} cross-platform ref pair(s) present — pair claims hold the content constant and are stronger evidence than pooled claims.`);
  }
  lines.push('Groups under 8 scored videos are reported as "not enough videos", not as a pattern.');
  return lines;
}

export function correlate(
  videos: readonly InsightVideo[],
  suggestions: readonly SuggestionForEdges[],
  opts: { b2Unresolved: boolean; now?: string; minGroupSize?: number }
): CorrelationReport {
  const reports = perPlatform(videos, opts.minGroupSize ?? MIN_GROUP_SIZE);
  const pairs = pairEvidence(videos);
  const edges = ideaEdges(suggestions, videos, reports);
  const analysed = videos.filter((v) => v.analysis !== null);
  return {
    generatedAt: opts.now ?? new Date().toISOString(),
    totals: {
      videos: videos.length,
      analysed: analysed.length,
      scored: analysed.filter(isScored).length,
      pairs: pairs.length,
      adRuns: videos.reduce((n, v) => n + v.adRunCount, 0),
    },
    perPlatform: reports,
    pairs,
    edges,
    caution: standingCaution({
      analysed: analysed.length,
      adBoosted: analysed.filter((v) => v.analysis?.adBoosted === true).length,
      adUnknown: analysed.filter((v) => v.analysis?.adBoosted === null).length,
      pairs: pairs.length,
      b2Unresolved: opts.b2Unresolved,
    }),
    method:
      `Score = engagement rate (likes+comments+shares+saves ÷ views) from the latest snapshot, via X2 rates(). ` +
      `Videos under ${MIN_VIEWS} views are unscored. Per platform, each group's median is compared to the platform median; ` +
      `±${Math.round(CALL_OUT_THRESHOLD * 100)}% relative is the call-out line. Groups need ${opts.minGroupSize ?? MIN_GROUP_SIZE} scored videos.`,
  };
}
