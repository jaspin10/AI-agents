/**
 * X6 — Agent correlation + the closed loop (docs/spec/x-series.md, X6).
 *
 * Capability `analysis.insights`. Reads content + performance + X1's analysis
 * tables, scores every video with X2's rates() (@platform/shared/metrics —
 * imported, never reimplemented), runs the pure correlation in
 * @platform/shared/correlation, and only THEN asks the LLM to (a) word the
 * per-platform findings and (b) propose hypothesis tags from Eknoor's
 * free-text descriptions. Every number in the report is computed here in
 * code; the model is told it may not introduce any figure of its own.
 *
 * Locked 2026-09-10 (Jas): program counts, AI writes the words · per-platform,
 * never blended · min 8 videos per group · pairs > pooled, said explicitly ·
 * tags are suggest-only until a person approves · engagement rate is the score ·
 * standing caution rides inside the payload · runs nightly (chained after
 * sync.js) plus manual from the dash.
 */
import { createMemoryClient, type MemoryClient } from '@platform/memory';
import {
  AgentContractSchema,
  ContractViolationError,
  correlate,
  createLlmClient,
  rates,
  type AgentContext,
  type AgentContract,
  type ContentRow,
  type CorrelationReport,
  type InsightVideo,
  type LlmClient,
  type PerformanceRecord,
  type Snapshot,
  type SuggestionForEdges,
  type Task,
} from '@platform/shared';
import { z } from 'zod';
import { readMonthlyCap } from './cap.js';

export const INSIGHTS_AGENT_NAME = 'insights';

export const InsightsTaskPayloadSchema = z.object({
  trigger: z.enum(['cron', 'manual']),
  triggeredBy: z.string().min(1),
});

const NarrativeSchema = z.object({
  overall: z.string().min(1),
  perPlatform: z.array(z.object({ platform: z.string().min(1), summary: z.string().min(1) })),
});
type Narrative = z.infer<typeof NarrativeSchema>;

const TagProposalsSchema = z.object({
  proposals: z.array(
    z.object({
      contentId: z.string().min(1),
      tag: z.string().min(1).max(60),
      rationale: z.string().min(1).max(300),
    })
  ),
});

/** The stored report = numbers + wording + what the LLM did (or didn't) do. */
export interface InsightsReport extends CorrelationReport {
  narrative: Narrative | null;
  llm: { status: 'ok' } | { status: 'skipped'; reason: string };
  tagProposals: number;
}

const OutputSchema = z.object({
  insightRunId: z.string(),
  status: z.enum(['ok', 'numbers_only']),
  report: z.custom<InsightsReport>((v) => typeof v === 'object' && v !== null),
  tagProposals: z.number().int().nonnegative(),
  totalTokens: z.object({ input: z.number(), output: z.number() }),
  capStatus: z.object({ month: z.string(), used: z.number(), cap: z.number() }).nullable(),
});
export type InsightsOutput = z.infer<typeof OutputSchema>;

/* ---------------- data shaping (same join rules as apps/api's X2 route) ---------------- */

function snapshotsByContentUuid(content: ContentRow[], performance: PerformanceRecord[]): Map<string, Snapshot[]> {
  const uuidByNative = new Map(content.filter((r) => r.id !== undefined).map((r) => [r.platformVideoId, r.id as string] as const));
  const out = new Map<string, Snapshot[]>();
  for (const p of performance) {
    const key = p.contentUuid ?? uuidByNative.get(p.contentId);
    if (key === undefined) continue;
    if (!out.has(key)) out.set(key, []);
    out.get(key)?.push({
      capturedDate: p.capturedDate,
      views: p.metrics.views,
      likes: p.metrics.likes,
      comments: p.metrics.comments,
      shares: p.metrics.shares,
      saves: p.metrics.saves,
      followersAtCapture: p.metrics.followersAtCapture,
    });
  }
  return out;
}

/** Derived from data, not a platform list: shares count iff any snapshot on that platform ever reported a non-zero share. */
function sharesReportedByPlatform(performance: PerformanceRecord[]): Set<string> {
  const out = new Set<string>();
  for (const p of performance) if (p.metrics.shares > 0) out.add(p.platform);
  return out;
}

async function loadVideos(memory: MemoryClient): Promise<{ videos: InsightVideo[]; suggestions: SuggestionForEdges[] }> {
  const [content, performance, analyses, refPairs, adRuns, suggestionRows] = await Promise.all([
    memory.content.all(),
    memory.performance.all(),
    memory.contentAnalysis.all(),
    memory.contentAnalysisRefs.all(),
    memory.contentAdRuns.all(),
    memory.suggestions.all(),
  ]);
  const grouped = snapshotsByContentUuid(content, performance);
  const sharesOk = sharesReportedByPlatform(performance);
  const analysisByContent = new Map(analyses.map((a) => [a.contentId, a] as const));
  const refsByContent = new Map<string, Set<string>>();
  for (const { contentId, refContentId } of refPairs) {
    if (!refsByContent.has(contentId)) refsByContent.set(contentId, new Set());
    refsByContent.get(contentId)?.add(refContentId);
    if (!refsByContent.has(refContentId)) refsByContent.set(refContentId, new Set());
    refsByContent.get(refContentId)?.add(contentId);
  }
  const runCount = new Map<string, number>();
  for (const run of adRuns) runCount.set(run.contentId, (runCount.get(run.contentId) ?? 0) + 1);

  const videos: InsightVideo[] = content
    .filter((r): r is ContentRow & { id: string } => r.id !== undefined)
    .map((r) => {
      const snaps = grouped.get(r.id) ?? [];
      const latest = snaps.length === 0 ? null : snaps.reduce((a, b) => (b.capturedDate > a.capturedDate ? b : a));
      const a = analysisByContent.get(r.id);
      return {
        id: r.id,
        platform: r.platform,
        title: r.title,
        postedAt: r.postedAt,
        views: latest?.views ?? null,
        // X2's rates(), not a local formula.
        engagementRatePct: latest === null ? null : rates(latest, { sharesReported: sharesOk.has(r.platform) }).engagementRatePct,
        hypothesis: r.hypothesis,
        analysis:
          a === undefined
            ? null
            : {
                description: a.description,
                hookText: a.hookText,
                format: a.format,
                hasModel: a.hasModel,
                hasCta: a.hasCta,
                ctaType: a.ctaType,
                adBoosted: a.adBoosted,
                ideaSource: a.ideaSource,
              },
        twinIds: [...(refsByContent.get(r.id) ?? [])],
        adRunCount: runCount.get(r.id) ?? 0,
      };
    });

  const suggestions: SuggestionForEdges[] = suggestionRows.map((s) => ({
    id: s.id,
    status: s.status,
    createdAt: s.createdAt,
    hypothesis: s.hypothesis,
    theme: s.payload.kind === 'next_video' ? s.payload.theme : null,
    format: s.payload.kind === 'next_video' ? s.payload.format : null,
  }));
  return { videos, suggestions };
}

/* ---------------- LLM: wording + tags ---------------- */

const NARRATIVE_SYSTEM = `You write short, plain-English findings for a French-language-school marketing team, from a JSON report a program computed.
Hard rules:
- Every number you mention must appear verbatim in the input JSON. Never invent, round, or estimate a figure.
- Write one summary PER PLATFORM. Never blend platforms into one finding.
- A platform with enoughData=false gets exactly: "Not enough scored videos yet to say what works on <platform>." plus the count.
- Say "pair" evidence is stronger than pooled evidence whenever a pair exists, and say pooled claims are weaker.
- Every finding is a hypothesis to test, not a conclusion. Never use the words "proves", "proven", "causes", "definitely".
- Never mention enrollments or revenue.
- Baby language: short sentences, no jargon, no bullet symbols. Max 4 sentences per platform, max 3 overall.
Return ONLY JSON: {"overall": string, "perPlatform": [{"platform": string, "summary": string}]}. No markdown fences.`;

const TAGS_SYSTEM = `You propose hypothesis tags for short-form videos from a content analyst's free-text descriptions.
A hypothesis tag names the IDEA being tested — the angle, emotion, or promise — not the format. Examples of the shape: "exam-day-fear", "pronunciation-myth", "immigration-deadline", "tutor-vs-app", "before-after-score".
Rules:
- kebab-case, 2-4 words, lowercase ASCII, no format words (talking-head, skit, voiceover, duet are NOT tags).
- Reuse an existing tag from the list when the description fits it; only coin a new tag when nothing fits.
- At most 2 tags per video. Skip a video whose description is too thin to tag (do not guess).
- rationale: one short sentence quoting or paraphrasing the part of the description that justifies the tag.
Return ONLY JSON: {"proposals": [{"contentId": string, "tag": string, "rationale": string}]}. No markdown fences.`;

function parseJson<T>(schema: z.ZodType<T>, text: string): T {
  const cleaned = text.replace(/```json|```/g, '').trim();
  return schema.parse(JSON.parse(cleaned));
}

async function narrate(llm: LlmClient, report: CorrelationReport): Promise<{ narrative: Narrative; usage: { input: number; output: number } }> {
  const slim = {
    totals: report.totals,
    perPlatform: report.perPlatform.map((p) => ({
      platform: p.platform,
      analysedVideos: p.analysedVideos,
      scoredVideos: p.scoredVideos,
      platformMedianPct: p.platformMedianPct,
      enoughData: p.enoughData,
      claims: p.claims.slice(0, 12).map((c) => ({
        dimension: c.dimension,
        value: c.value,
        n: c.n,
        medianEngagementPct: c.medianEngagementPct,
        relativeDelta: c.relativeDelta,
        direction: c.direction,
        strength: c.strength,
        adBoostedCount: c.evidence.adBoostedCount,
        adUnknownCount: c.evidence.adUnknownCount,
      })),
      skipped: p.skipped.length,
    })),
    pairs: report.pairs.map((p) => ({ winner: p.winner, adConfounded: p.adConfounded, sides: p.sides.map((s) => ({ platform: s.platform, engagementRatePct: s.engagementRatePct })) })),
    caution: report.caution,
  };
  const result = await llm.complete({ system: NARRATIVE_SYSTEM, user: JSON.stringify(slim), maxTokens: 1500 });
  return { narrative: parseJson(NarrativeSchema, result.text), usage: { input: result.usage.inputTokens, output: result.usage.outputTokens } };
}

async function proposeTags(
  llm: LlmClient,
  videos: InsightVideo[],
  existingTags: string[]
): Promise<{ proposals: Array<{ contentId: string; tag: string; rationale: string }>; usage: { input: number; output: number } }> {
  const described = videos.filter((v) => (v.analysis?.description ?? '').trim().length >= 20);
  const usage = { input: 0, output: 0 };
  const proposals: Array<{ contentId: string; tag: string; rationale: string }> = [];
  const valid = new Set(described.map((v) => v.id));
  const BATCH = 25;
  for (let i = 0; i < described.length; i += BATCH) {
    const batch = described.slice(i, i + BATCH).map((v) => ({
      contentId: v.id,
      platform: v.platform,
      description: (v.analysis?.description ?? '').slice(0, 1200),
      hookText: v.analysis?.hookText ?? null,
    }));
    const result = await llm.complete({
      system: TAGS_SYSTEM,
      user: JSON.stringify({ existingTags, videos: batch }),
      maxTokens: 2500,
    });
    usage.input += result.usage.inputTokens;
    usage.output += result.usage.outputTokens;
    for (const p of parseJson(TagProposalsSchema, result.text).proposals) {
      if (!valid.has(p.contentId)) continue;
      const tag = p.tag.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      if (tag === '') continue;
      proposals.push({ contentId: p.contentId, tag, rationale: p.rationale });
      if (!existingTags.includes(tag)) existingTags.push(tag);
    }
  }
  return { proposals, usage };
}

/* ---------------- run ---------------- */

async function run(task: Task, context: AgentContext): Promise<InsightsOutput> {
  const payload = InsightsTaskPayloadSchema.parse(task.payload);
  const memory = createMemoryClient();
  const b2Unresolved = process.env['B2_ENROLLMENT_RECONCILED'] !== '1';

  // 1) Numbers first — pure, deterministic, no LLM.
  const { videos, suggestions } = await loadVideos(memory);
  const correlation = correlate(videos, suggestions, { b2Unresolved });
  context.logger.info(
    `insights: ${correlation.totals.analysed}/${correlation.totals.videos} analysed, ${correlation.totals.scored} scored, ${correlation.totals.pairs} pairs; platforms: ${correlation.perPlatform.map((p) => `${p.platform}=${p.claims.length} claims`).join(', ')}`
  );

  // 2) Cap check BEFORE any LLM call (§6). No key / cap reached → numbers-only run, never a crash.
  const tokens = { input: 0, output: 0 };
  let llmStatus: InsightsReport['llm'] = { status: 'ok' };
  let narrative: Narrative | null = null;
  let proposals: Array<{ contentId: string; tag: string; rationale: string }> = [];
  const cap = readMonthlyCap();
  const month = new Date().toISOString().slice(0, 7);
  let usedThisMonth = 0;
  if (cap !== null) usedThisMonth = await memory.llmUsage.monthlyTotal(month);
  const llm = createLlmClient();
  if (llm === null) llmStatus = { status: 'skipped', reason: 'ANTHROPIC_API_KEY missing' };
  else if (cap !== null && usedThisMonth >= cap) llmStatus = { status: 'skipped', reason: `LLM monthly cap reached (${usedThisMonth}/${cap} in ${month})` };

  if (llm !== null && llmStatus.status === 'ok') {
    const n = await narrate(llm, correlation);
    narrative = n.narrative;
    tokens.input += n.usage.input;
    tokens.output += n.usage.output;
    const existing = [...new Set((await memory.hypothesisSuggestions.all()).map((h) => h.tag))];
    const t = await proposeTags(llm, videos, existing);
    proposals = t.proposals;
    tokens.input += t.usage.input;
    tokens.output += t.usage.output;
  } else {
    context.logger.warn(`insights: LLM skipped — ${llmStatus.status === 'skipped' ? llmStatus.reason : ''}`);
  }

  // 3) Persist the run, then the tag proposals (suggest-only; nothing touches content.hypothesis here).
  const report: InsightsReport = { ...correlation, narrative, llm: llmStatus, tagProposals: proposals.length };
  const status = llmStatus.status === 'ok' ? 'ok' : 'numbers_only';
  const stored = await memory.insightRuns.insert({
    runId: context.runId,
    trigger: payload.trigger,
    triggeredBy: payload.triggeredBy,
    status,
    videoCount: correlation.totals.videos,
    analysedCount: correlation.totals.analysed,
    report: report as unknown as Record<string, unknown>,
    inputTokens: tokens.input,
    outputTokens: tokens.output,
  });
  const inserted = await memory.hypothesisSuggestions.propose(proposals.map((p) => ({ runId: stored.id, ...p })));
  context.logger.info(`insights: run ${stored.id} stored (${status}); ${inserted} new tag proposals of ${proposals.length}`);

  // 4) Ledger (§6) — failure must not lose the run.
  if (tokens.input + tokens.output > 0) {
    try {
      await memory.llmUsage.record({ runId: context.runId, agent: INSIGHTS_AGENT_NAME, model: 'claude-sonnet-4-6', inputTokens: tokens.input, outputTokens: tokens.output });
    } catch (error) {
      context.logger.error(`failed to record llm_usage row: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    insightRunId: stored.id,
    status,
    report,
    tagProposals: inserted,
    totalTokens: tokens,
    capStatus: cap === null ? null : { month, used: usedThisMonth + tokens.input + tokens.output, cap },
  };
}

/** Slack summary — the same payload, condensed. The caution is never dropped. */
export function formatInsightsSlack(output: InsightsOutput): string {
  const r = output.report;
  const lines: string[] = [`*Insights — ${r.generatedAt.slice(0, 10)}* (${r.totals.analysed} analysed / ${r.totals.scored} scored / ${r.totals.pairs} pairs)`];
  for (const p of r.perPlatform) {
    const summary = r.narrative?.perPlatform.find((n) => n.platform === p.platform)?.summary;
    lines.push('', `*${p.platform}* — ${p.analysedVideos} analysed, ${p.scoredVideos} scored${p.platformMedianPct === null ? '' : `, median engagement ${p.platformMedianPct}%`}`);
    if (!p.enoughData) {
      lines.push(`• Not enough scored videos yet (need 8).`);
      continue;
    }
    if (summary !== undefined) lines.push(summary);
    for (const c of p.claims.filter((x) => x.direction !== 'neutral').slice(0, 4)) {
      lines.push(`• ${c.direction === 'works' ? '↑' : '↓'} ${c.dimension}=${c.value}: ${c.medianEngagementPct}% vs ${c.platformMedianPct}% (n=${c.n}, pooled${c.evidence.adBoostedCount > 0 ? `, ${c.evidence.adBoostedCount} boosted` : ''})`);
    }
  }
  if (r.pairs.length > 0) {
    lines.push('', `*Cross-platform pairs (stronger evidence)*`);
    for (const p of r.pairs.slice(0, 5)) {
      lines.push(`• ${p.sides.map((s) => `${s.platform} ${s.engagementRatePct ?? 'n/a'}%`).join(' vs ')} → ${p.winner ?? 'no winner'}${p.adConfounded ? ' (ad-confounded)' : ''}`);
    }
  }
  lines.push('', `*Caution*`, ...r.caution.map((c) => `• ${c}`));
  if (r.llm.status === 'skipped') lines.push('', `_Numbers only — LLM skipped: ${r.llm.reason}_`);
  else lines.push('', `_${output.tagProposals} new hypothesis tag proposals await approval in the dash._`);
  return lines.join('\n');
}

export const insightsAgent: AgentContract = AgentContractSchema.parse({
  name: INSIGHTS_AGENT_NAME,
  description: 'X6 insights: per-platform what-works/what-doesn\'t with evidence, pair evidence, idea-map edges, suggest-only hypothesis tags, standing caution in the payload.',
  capabilities: ['analysis.insights'],
  allowedTools: [],
  inputSchema: InsightsTaskPayloadSchema,
  outputSchema: OutputSchema,
  run,
} satisfies AgentContract);
