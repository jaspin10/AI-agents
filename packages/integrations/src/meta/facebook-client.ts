import { createHmac } from 'node:crypto';
import { z } from 'zod';
import type { MetaConfig } from '../config.js';
import { requestJson } from '../http.js';

const DEFAULT_GRAPH_API_VERSION = 'v26.0';

const VideoSchema = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  created_time: z.string(),
  permalink_url: z.string().optional(),
  length: z.number().nonnegative().optional(),
}).passthrough();

const VideoPageSchema = z.object({
  data: z.array(VideoSchema),
  paging: z.object({ next: z.string().url().optional() }).optional(),
});

const CountSummarySchema = z.object({
  summary: z.object({ total_count: z.number().int().nonnegative() }).optional(),
}).passthrough();

const SharesSchema = z.object({
  shares: z.object({ count: z.number().int().nonnegative() }).optional(),
}).passthrough();

const InsightValueSchema = z.object({
  value: z.union([z.number(), z.string(), z.record(z.string(), z.unknown())]),
}).passthrough();

const InsightSchema = z.object({
  name: z.string(),
  values: z.array(InsightValueSchema).optional(),
}).passthrough();

const InsightsResponseSchema = z.object({ data: z.array(InsightSchema) });

export interface FacebookVideo {
  id: string;
  title: string | null;
  description: string | null;
  createdTime: string;
  permalink: string | null;
  lengthSeconds: number | null;
}

export interface FacebookMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: null;
  avgWatchTimeSeconds: number | null;
}

export interface FacebookSnapshot {
  followerCount: number | null;
  videos: Array<FacebookVideo & { metrics: FacebookMetrics }>;
}

const VIDEO_INSIGHT_METRICS = [
  'total_video_views',
  'total_video_avg_time_watched',
  'total_video_view_time',
] as const;

function numeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Read-only Facebook Page video/Reel analytics client. */
export class MetaFacebookClient {
  private readonly baseUrl: string;
  private readonly appSecretProof: string;

  constructor(private readonly config: MetaConfig) {
    this.baseUrl = `https://graph.facebook.com/${config.graphApiVersion ?? DEFAULT_GRAPH_API_VERSION}`;
    this.appSecretProof = createHmac('sha256', config.appSecret)
      .update(config.accessToken)
      .digest('hex');
  }

  private async get<T>(pathOrUrl: string, query: Record<string, string | number | undefined> = {}): Promise<T> {
    const url = pathOrUrl.startsWith('https://') ? pathOrUrl : `${this.baseUrl}/${pathOrUrl.replace(/^\//, '')}`;
    return requestJson<T>(url, {
      query: {
        ...query,
        access_token: this.config.accessToken,
        appsecret_proof: this.appSecretProof,
      },
    });
  }

  async followerCount(): Promise<number | null> {
    for (const field of ['followers_count', 'fan_count'] as const) {
      try {
        const raw = await this.get<unknown>(this.config.pageId, { fields: `id,${field}` });
        const parsed = z.object({ id: z.string(), [field]: z.number().int().nonnegative().optional() }).passthrough().parse(raw);
        const value = parsed[field];
        if (typeof value === 'number') return value;
      } catch {
        // Meta varies Page audience fields by API version/page type.
      }
    }
    return null;
  }

  private async walkEdge(edge: 'videos' | 'video_reels'): Promise<FacebookVideo[]> {
    const out: FacebookVideo[] = [];
    let next: string | undefined;

    do {
      const raw = await this.get<unknown>(
        next ?? `${this.config.pageId}/${edge}`,
        next === undefined
          ? { fields: 'id,title,description,created_time,permalink_url,length', limit: 100 }
          : {}
      );
      const page = VideoPageSchema.parse(raw);
      for (const video of page.data) {
        out.push({
          id: video.id,
          title: video.title ?? null,
          description: video.description ?? null,
          createdTime: new Date(video.created_time).toISOString(),
          permalink: video.permalink_url ?? null,
          lengthSeconds: video.length ?? null,
        });
      }
      next = page.paging?.next;
    } while (next !== undefined);

    return out;
  }

  /** /videos is authoritative; /video_reels is additive where Meta exposes it. */
  async allVideos(): Promise<FacebookVideo[]> {
    const byId = new Map<string, FacebookVideo>();
    const videos = await this.walkEdge('videos');
    for (const video of videos) byId.set(video.id, video);

    try {
      const reels = await this.walkEdge('video_reels');
      for (const reel of reels) byId.set(reel.id, reel);
    } catch {
      // Some Graph versions/pages do not expose video_reels as a readable edge.
      // /videos still returns the Page's readable video library.
    }

    return [...byId.values()].sort((a, b) => a.createdTime.localeCompare(b.createdTime));
  }

  private async insightMetric(videoId: string, metric: string): Promise<number | null> {
    for (const edge of ['video_insights', 'insights'] as const) {
      try {
        const raw = await this.get<unknown>(`${videoId}/${edge}`, { metric });
        const parsed = InsightsResponseSchema.parse(raw);
        const row = parsed.data.find((item) => item.name === metric) ?? parsed.data[0];
        const value = numeric(row?.values?.[0]?.value);
        if (value !== null) return value;
      } catch {
        // Try the alternate insight edge; unsupported metrics remain null.
      }
    }
    return null;
  }

  private async engagement(videoId: string): Promise<{ likes: number; comments: number; shares: number }> {
    let likes = 0;
    let comments = 0;
    let shares = 0;

    try {
      const raw = await this.get<unknown>(videoId, {
        fields: 'likes.limit(0).summary(true),comments.limit(0).summary(true)',
      });
      const obj = z.object({
        likes: CountSummarySchema.optional(),
        comments: CountSummarySchema.optional(),
      }).passthrough().parse(raw);
      likes = obj.likes?.summary?.total_count ?? 0;
      comments = obj.comments?.summary?.total_count ?? 0;
    } catch {
      // Engagement summaries can be unavailable for some historical rows.
    }

    try {
      const raw = await this.get<unknown>(videoId, { fields: 'shares' });
      shares = SharesSchema.parse(raw).shares?.count ?? 0;
    } catch {
      // Video share count is not exposed for every Page/video type.
    }

    return { likes, comments, shares };
  }

  async videoMetrics(videoId: string): Promise<FacebookMetrics> {
    const [engagement, ...insightValues] = await Promise.all([
      this.engagement(videoId),
      ...VIDEO_INSIGHT_METRICS.map((metric) => this.insightMetric(videoId, metric)),
    ]);
    const [viewsRaw, avgWatchRaw, viewTimeRaw] = insightValues;

    // Meta historically reports average watched time in milliseconds. Use it
    // only when that explicit metric is exposed; never derive average time
    // from aggregate view time because denominators differ by metric/version.
    const avgWatchTimeSeconds = avgWatchRaw === null ? null : avgWatchRaw / 1000;

    return {
      views: Math.max(0, Math.round(viewsRaw ?? 0)),
      likes: engagement.likes,
      comments: engagement.comments,
      shares: engagement.shares,
      saves: null,
      avgWatchTimeSeconds,
    };
  }

  async snapshot(): Promise<FacebookSnapshot> {
    const [followerCount, videos] = await Promise.all([this.followerCount(), this.allVideos()]);
    const rows: FacebookSnapshot['videos'] = [];
    for (const video of videos) {
      rows.push({ ...video, metrics: await this.videoMetrics(video.id) });
    }
    return { followerCount, videos: rows };
  }
}
