import { CURRENT_HYPOTHESIS_TAGS, type BrandAssetChunk } from '@platform/shared';
import type { AnalysisSummary, VideoAnalysis } from './analysis.js';

function videoLine(v: VideoAnalysis): string {
  const parts = [
    `[${v.platform}] "${v.title ?? '(untitled)'}"`,
    `views=${v.views}`,
    `engagement=${v.engagementRate === null ? 'n/a' : (v.engagementRate * 100).toFixed(2) + '%'}`,
    `shares=${v.shares}`,
    `comments=${v.comments}`,
  ];
  if (v.retentionPct !== null) parts.push(`retention=${v.retentionPct.toFixed(1)}%`);
  if (v.avgWatchTimeSeconds !== null) parts.push(`avgWatch=${v.avgWatchTimeSeconds.toFixed(0)}s`);
  parts.push(`hypothesis=${v.hypothesis ?? 'UNTAGGED'}`);
  return parts.join(' | ');
}

export function buildGenerationSystemPrompt(brandChunks: BrandAssetChunk[]): string {
  const brand = brandChunks
    .map((c) => `## ${c.heading ?? 'Preamble'}\n${c.content}`)
    .join('\n\n');
  return [
    'You are the content analyst for a French-language school serving Punjabi work-permit holders in Canada.',
    'You analyse video performance data and suggest the next video. You NEVER write or publish content yourself — a human decides and creates.',
    '',
    'Brand constitution (authoritative — every suggestion must comply):',
    brand,
    '',
    `Current hypothesis taxonomy: ${CURRENT_HYPOTHESIS_TAGS.join(', ')}.`,
    'Tag each suggestion with the hypothesis it tests ONLY when the data genuinely supports the connection; otherwise use null.',
    'IMPORTANT: most or all videos are currently UNTAGGED. Do not pretend hypothesis-level conclusions exist when tagged data is insufficient — say so honestly in rationales.',
    '',
    'Comparison rules: compare videos WITHIN a platform only. On YouTube, retention and average watch time separate content quality from luck. On TikTok, retention does not exist — use share rate and comment rate relative to views as the strongest signals.',
    '',
    'Respond ONLY with valid JSON, no markdown fences, matching exactly:',
    '{"suggestions": [{"theme": string, "hook": string, "format": string, "hypothesis": string | null, "rationale": string}]}',
  ].join('\n');
}

export function buildGenerationUserPrompt(
  summary: AnalysisSummary,
  count: number,
  focus: string | undefined
): string {
  const lines = [
    `Data: ${summary.totalVideos} videos with performance (${Object.entries(summary.byPlatform)
      .map(([p, n]) => `${p}: ${n}`)
      .join(', ')}). Tagged with a hypothesis: ${summary.taggedVideos}.`,
    '',
    'Top performers (by platform-appropriate signal, min 100 views):',
    ...summary.top.map(videoLine),
    '',
    'Bottom performers:',
    ...summary.bottom.map(videoLine),
    '',
    `Produce exactly ${count} next-video suggestion(s).`,
  ];
  if (focus !== undefined) lines.push(`Owner focus for this run: ${focus}`);
  return lines.join('\n');
}