import type { ContentRow, PerformanceRecord } from '@platform/shared';

/** One video with its latest metrics + derived engagement signals. */
export interface VideoAnalysis {
  platform: string;
  platformVideoId: string;
  title: string | null;
  hypothesis: string | null;
  postedAt: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  /** (likes+comments+shares)/views — the cross-platform comparable signal. */
  engagementRate: number | null;
  /** shares/views — strongest "content worked" proxy on TikTok. */
  shareRate: number | null;
  /** comments/views. */
  commentRate: number | null;
  /** YouTube only; null on TikTok (platform exposes no retention). */
  retentionPct: number | null;
  avgWatchTimeSeconds: number | null;
}

export interface AnalysisSummary {
  totalVideos: number;
  taggedVideos: number;
  byPlatform: Record<string, number>;
  /** Top and bottom performers per platform by the platform-right signal. */
  top: VideoAnalysis[];
  bottom: VideoAnalysis[];
  all: VideoAnalysis[];
}

function rate(numerator: number, views: number): number | null {
  return views > 0 ? numerator / views : null;
}

/** Latest snapshot per video (rows are one per video per captured day). */
function latestByContent(records: PerformanceRecord[]): Map<string, PerformanceRecord> {
  const latest = new Map<string, PerformanceRecord>();
  for (const record of records) {
    const existing = latest.get(record.contentId);
    if (existing === undefined || record.capturedDate > existing.capturedDate) {
      latest.set(record.contentId, record);
    }
  }
  return latest;
}

/**
 * Joins content and latest performance, computes derived signals.
 * "Content vs luck" ranking signal: retentionPct on YouTube (real audience
 * behaviour), shareRate then engagementRate on TikTok (no retention exists).
 */
export function analyse(content: ContentRow[], performance: PerformanceRecord[]): AnalysisSummary {
  const latest = latestByContent(performance);
  const videos: VideoAnalysis[] = [];

  for (const row of content) {
    if (row.id === undefined) continue;
    const perf = latest.get(row.id);
    if (perf === undefined) continue;
    const m = perf.metrics;
    videos.push({
      platform: row.platform,
      platformVideoId: row.platformVideoId,
      title: row.title,
      hypothesis: row.hypothesis,
      postedAt: row.postedAt,
      views: m.views,
      likes: m.likes,
      comments: m.comments,
      shares: m.shares,
      engagementRate: rate(m.likes + m.comments + m.shares, m.views),
      shareRate: rate(m.shares, m.views),
      commentRate: rate(m.comments, m.views),
      retentionPct: m.retentionPct,
      avgWatchTimeSeconds: m.avgWatchTimeSeconds,
    });
  }

  const signal = (v: VideoAnalysis): number =>
    v.retentionPct !== null
      ? v.retentionPct
      : (v.shareRate ?? 0) * 1000 + (v.engagementRate ?? 0) * 100;

  const withViews = videos.filter((v) => v.views >= 100); // below 100 views, rates are noise
  const ranked = [...withViews].sort((a, b) => signal(b) - signal(a));

  const byPlatform: Record<string, number> = {};
  for (const v of videos) byPlatform[v.platform] = (byPlatform[v.platform] ?? 0) + 1;

  return {
    totalVideos: videos.length,
    taggedVideos: videos.filter((v) => v.hypothesis !== null).length,
    byPlatform,
    top: ranked.slice(0, 10),
    bottom: ranked.slice(-10).reverse(),
    all: videos,
  };
}