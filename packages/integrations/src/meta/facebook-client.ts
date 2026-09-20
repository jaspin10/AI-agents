import { createHmac } from 'node:crypto';
import { z } from 'zod';
import type { MetaConfig } from '../config.js';
import { requestJson } from '../http.js';

const DEFAULT_GRAPH_API_VERSION = 'v26.0';

const AccountsSchema = z.object({
  data: z.array(z.object({
    id: z.string().min(1),
    access_token: z.string().min(1).optional(),
  }).passthrough()),
  paging: z.object({ next: z.string().url().optional() }).optional(),
});

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

const AttachmentSchema = z.object({
  media_type: z.string().optional(),
  type: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  url: z.string().optional(),
  target: z.object({
    id: z.string().optional(),
    url: z.string().optional(),
  }).passthrough().optional(),
}).passthrough();

const PostSchema = z.object({
  id: z.string().min(1),
  message: z.string().optional(),
  created_time: z.string(),
  permalink_url: z.string().optional(),
  attachments: z.object({ data: z.array(AttachmentSchema) }).optional(),
}).passthrough();

const PostPageSchema = z.object({
  data: z.array(PostSchema),
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
  /** Page post id when this video was discovered from a published post. */
  postId: string | null;
  title: string | null;
  description: string | null;
  createdTime: string;
  permalink: string | null;
  lengthSeconds: number | null;
}

export interface FacebookMetrics {
  /** null means Meta did not expose a usable view metric; never turn that into fake zero views. */
  views: number | null;
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
  private pageTokenPromise: Promise<string> | null = null;

  constructor(private readonly config: MetaConfig) {
    this.baseUrl = `https://graph.facebook.com/${config.graphApiVersion ?? DEFAULT_GRAPH_API_VERSION}`;
  }

  private proof(token: string): string {
    return createHmac('sha256', this.config.appSecret).update(token).digest('hex');
  }

  private async systemGet<T>(pathOrUrl: string, query: Record<string, string | number | undefined> = {}): Promise<T> {
    const url = pathOrUrl.startsWith('https://') ? pathOrUrl : `${this.baseUrl}/${pathOrUrl.replace(/^\//, '')}`;
    return requestJson<T>(url, {
      query: {
        ...query,
        access_token: this.config.accessToken,
        appsecret_proof: this.proof(this.config.accessToken),
      },
    });
  }

  /**
   * Facebook Page content endpoints are authenticated with the Page access
   * token returned by /me/accounts. The configured System User token is only
   * the server-side credential used to obtain it; it is never logged/stored.
   */
  private async pageAccessToken(): Promise<string> {
    if (this.pageTokenPromise !== null) return this.pageTokenPromise;
    this.pageTokenPromise = (async () => {
      let next: string | undefined;
      do {
        const raw = await this.systemGet<unknown>(
          next ?? 'me/accounts',
          next === undefined ? { fields: 'id,access_token', limit: 100 } : {}
        );
        const page = AccountsSchema.parse(raw);
        const match = page.data.find((item) => item.id === this.config.pageId);
        if (match?.access_token !== undefined) return match.access_token;
        next = page.paging?.next;
      } while (next !== undefined);
      throw new Error(`Meta Page ${this.config.pageId} is not available through /me/accounts for the configured System User token.`);
    })();
    return this.pageTokenPromise;
  }

  private async get<T>(pathOrUrl: string, query: Record<string, string | number | undefined> = {}): Promise<T> {
    const token = await this.pageAccessToken();
    const url = pathOrUrl.startsWith('https://') ? pathOrUrl : `${this.baseUrl}/${pathOrUrl.replace(/^\//, '')}`;
    return requestJson<T>(url, {
      query: {
        ...query,
        access_token: token,
        appsecret_proof: this.proof(token),
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
          postId: null,
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

  /**
   * Meta v26 no longer guarantees a readable Page /videos edge. Published Page
   * posts remain readable with pages_read_engagement, and video/Reel posts
   * expose their native video id through attachments.target.id.
   */
  private async videosFromPosts(edge: 'published_posts' | 'posts'): Promise<FacebookVideo[]> {
    const out: FacebookVideo[] = [];
    let next: string | undefined;

    do {
      const raw = await this.get<unknown>(
        next ?? `${this.config.pageId}/${edge}`,
        next === undefined
          ? {
              fields: 'id,message,created_time,permalink_url,attachments{media_type,type,title,description,url,target}',
              limit: 100,
            }
          : {}
      );
      const page = PostPageSchema.parse(raw);
      for (const post of page.data) {
        for (const attachment of post.attachments?.data ?? []) {
          const kind = `${attachment.media_type ?? ''} ${attachment.type ?? ''}`.toLowerCase();
          if (!kind.includes('video') && !kind.includes('reel')) continue;
          const videoId = attachment.target?.id;
          if (videoId === undefined || videoId === '') continue;
          out.push({
            id: videoId,
            postId: post.id,
            title: attachment.title ?? post.message ?? null,
            description: attachment.description ?? post.message ?? null,
            createdTime: new Date(post.created_time).toISOString(),
            permalink: attachment.target?.url ?? post.permalink_url ?? attachment.url ?? null,
            lengthSeconds: null,
          });
        }
      }
      next = page.paging?.next;
    } while (next !== undefined);

    return out;
  }

  /** /videos is authoritative; /video_reels is additive where Meta exposes it. */
  async allVideos(): Promise<FacebookVideo[]> {
    const byId = new Map<string, FacebookVideo>();
    try {
      const videos = await this.walkEdge('videos');
      for (const video of videos) byId.set(video.id, video);
    } catch {
      // Page /videos is not readable on every Graph version/Page type.
    }

    // Page posts are the reliable read surface in current Graph versions.
    for (const edge of ['published_posts', 'posts'] as const) {
      try {
        const posted = await this.videosFromPosts(edge);
        for (const video of posted) byId.set(video.id, video);
        if (posted.length > 0) break;
      } catch {
        // Try the alternate Page-post edge.
      }
    }

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

  /** Current Graph v26 Page-post media view metric. Requires Meta read_insights. */
  private async postMediaViews(postId: string): Promise<number | null> {
    try {
      const raw = await this.get<unknown>(`${postId}/insights`, {
        metric: 'post_media_view',
        period: 'lifetime',
      });
      const parsed = InsightsResponseSchema.parse(raw);
      const row = parsed.data.find((item) => item.name === 'post_media_view') ?? parsed.data[0];
      return numeric(row?.values?.[0]?.value);
    } catch {
      return null;
    }
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

  async videoMetrics(video: FacebookVideo): Promise<FacebookMetrics> {
    const engagementId = video.postId ?? video.id;
    const [engagement, postViews, ...insightValues] = await Promise.all([
      this.engagement(engagementId),
      video.postId === null ? Promise.resolve(null) : this.postMediaViews(video.postId),
      ...VIDEO_INSIGHT_METRICS.map((metric) => this.insightMetric(video.id, metric)),
    ]);
    const [legacyViewsRaw, avgWatchRaw] = insightValues;
    const viewsRaw = postViews ?? legacyViewsRaw ?? null;

    // Meta historically reports average watched time in milliseconds. Use it
    // only when that explicit metric is exposed; never derive average time
    // from aggregate view time because denominators differ by metric/version.
    const avgWatchTimeSeconds = avgWatchRaw == null ? null : avgWatchRaw / 1000;

    return {
      views: viewsRaw === null ? null : Math.max(0, Math.round(viewsRaw)),
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
      rows.push({ ...video, metrics: await this.videoMetrics(video) });
    }
    return { followerCount, videos: rows };
  }
}
