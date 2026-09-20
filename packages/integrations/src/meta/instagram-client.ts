import { createHmac } from 'node:crypto';
import { z } from 'zod';
import type { MetaConfig } from '../config.js';
import { requestJson } from '../http.js';

const DEFAULT_GRAPH_API_VERSION = 'v26.0';

const PageSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  instagram_business_account: z.object({ id: z.string().min(1) }).optional(),
});

const AccountSchema = z.object({
  id: z.string().min(1),
  username: z.string().optional(),
  name: z.string().optional(),
  media_count: z.number().int().nonnegative().optional(),
  followers_count: z.number().int().nonnegative().optional(),
});

const MediaSchema = z.object({
  id: z.string().min(1),
  caption: z.string().optional(),
  media_type: z.string().optional(),
  media_product_type: z.string().optional(),
  timestamp: z.string(),
  permalink: z.string().optional(),
});

const MediaPageSchema = z.object({
  data: z.array(MediaSchema),
  paging: z.object({
    next: z.string().url().optional(),
  }).optional(),
});

const InsightValueSchema = z.object({
  value: z.union([z.number(), z.string(), z.record(z.string(), z.unknown())]),
}).passthrough();

const InsightSchema = z.object({
  name: z.string(),
  values: z.array(InsightValueSchema).optional(),
}).passthrough();

const InsightsResponseSchema = z.object({
  data: z.array(InsightSchema),
});

export interface InstagramMedia {
  id: string;
  caption: string | null;
  mediaType: string | null;
  mediaProductType: string | null;
  timestamp: string;
  permalink: string | null;
}

export interface InstagramMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number | null;
  avgWatchTimeSeconds: number | null;
  totalWatchTimeSeconds: number | null;
  skipRatePct: number | null;
  reach: number | null;
  totalInteractions: number | null;
  reposts: number | null;
}

export interface InstagramSnapshot {
  username: string | null;
  followerCount: number | null;
  media: Array<InstagramMedia & { metrics: InstagramMetrics }>;
}

const INSIGHT_METRICS = [
  'reach',
  'likes',
  'comments',
  'shares',
  'saved',
  'views',
  'total_interactions',
  'ig_reels_avg_watch_time',
  'ig_reels_video_view_total_time',
  'reels_skip_rate',
  'reposts',
  'total_views',
  'total_likes',
  'total_comments',
] as const;

function numeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Read-only Instagram Graph API client. The app secret is used only to add
 * appsecret_proof to requests; the System User token remains server-side.
 */
export class MetaInstagramClient {
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

  /** Fail fast if the configured Page is not linked to the configured IG account. */
  async verifyConnection(): Promise<void> {
    const raw = await this.get<unknown>(this.config.pageId, {
      fields: 'id,name,instagram_business_account',
    });
    const page = PageSchema.parse(raw);
    const linked = page.instagram_business_account?.id;
    if (linked !== this.config.igUserId) {
      throw new Error(
        `Meta config mismatch: Page ${this.config.pageId} links to Instagram ${linked ?? 'none'}, expected ${this.config.igUserId}.`
      );
    }
  }

  async account(): Promise<{ username: string | null; followerCount: number | null }> {
    const raw = await this.get<unknown>(this.config.igUserId, {
      fields: 'id,username,name,media_count,followers_count',
    });
    const account = AccountSchema.parse(raw);
    return {
      username: account.username ?? null,
      followerCount: account.followers_count ?? null,
    };
  }

  /** Walk all media, then keep video/Reel rows only (X9 is videos-only). */
  async allVideoMedia(): Promise<InstagramMedia[]> {
    const out: InstagramMedia[] = [];
    let next: string | undefined;

    do {
      const raw = await this.get<unknown>(
        next ?? `${this.config.igUserId}/media`,
        next === undefined
          ? { fields: 'id,caption,media_type,media_product_type,timestamp,permalink', limit: 100 }
          : {}
      );
      const page = MediaPageSchema.parse(raw);
      for (const media of page.data) {
        const isVideo = media.media_type === 'VIDEO' || media.media_product_type === 'REELS';
        if (!isVideo) continue;
        out.push({
          id: media.id,
          caption: media.caption ?? null,
          mediaType: media.media_type ?? null,
          mediaProductType: media.media_product_type ?? null,
          timestamp: new Date(media.timestamp).toISOString(),
          permalink: media.permalink ?? null,
        });
      }
      next = page.paging?.next;
    } while (next !== undefined);

    return out;
  }

  private async insightsBatch(mediaId: string, metrics: readonly string[]): Promise<Map<string, number>> {
    const raw = await this.get<unknown>(`${mediaId}/insights`, {
      metric: metrics.join(','),
    });
    const parsed = InsightsResponseSchema.parse(raw);
    const values = new Map<string, number>();
    for (const metric of parsed.data) {
      const first = metric.values?.[0]?.value;
      const n = numeric(first);
      if (n !== null) values.set(metric.name, n);
    }
    return values;
  }

  /**
   * Metrics verified live for @frenchwithjas on 2026-09-19. Meta can reject a
   * metric for older/media-specific rows; if the combined request fails, retry
   * one metric at a time so one unavailable metric never drops the whole video.
   */
  async mediaInsights(mediaId: string): Promise<InstagramMetrics> {
    let values: Map<string, number>;
    try {
      values = await this.insightsBatch(mediaId, INSIGHT_METRICS);
    } catch {
      values = new Map<string, number>();
      for (const metric of INSIGHT_METRICS) {
        try {
          const one = await this.insightsBatch(mediaId, [metric]);
          for (const [name, value] of one) values.set(name, value);
        } catch {
          // A metric can be unavailable/deprecated for a particular media row.
        }
      }
    }

    const pick = (...names: string[]): number | null => {
      for (const name of names) {
        const value = values.get(name);
        if (value !== undefined) return value;
      }
      return null;
    };
    const integer = (...names: string[]): number => Math.max(0, Math.round(pick(...names) ?? 0));

    // Instagram reports both Reel watch-time metrics in milliseconds.
    const avgWatchMs = pick('ig_reels_avg_watch_time');
    const totalWatchMs = pick('ig_reels_video_view_total_time');

    return {
      views: integer('views', 'total_views'),
      likes: integer('likes', 'total_likes'),
      comments: integer('comments', 'total_comments'),
      shares: integer('shares'),
      saves: pick('saved') === null ? null : integer('saved'),
      avgWatchTimeSeconds: avgWatchMs === null ? null : avgWatchMs / 1000,
      totalWatchTimeSeconds: totalWatchMs === null ? null : totalWatchMs / 1000,
      skipRatePct: pick('reels_skip_rate'),
      reach: pick('reach'),
      totalInteractions: pick('total_interactions'),
      reposts: pick('reposts'),
    };
  }

  async snapshot(): Promise<InstagramSnapshot> {
    await this.verifyConnection();
    const [account, media] = await Promise.all([this.account(), this.allVideoMedia()]);
    const rows: InstagramSnapshot['media'] = [];
    for (const item of media) {
      rows.push({ ...item, metrics: await this.mediaInsights(item.id) });
    }
    return { ...account, media: rows };
  }
}
