import { z } from 'zod';
import type { YouTubeConfig } from '../config.js';
import { requestJson } from '../http.js';
import { refreshYouTubeAccessToken } from './auth.js';

const ANALYTICS_URL = 'https://youtubeanalytics.googleapis.com/v2/reports';

const ReportResponseSchema = z.object({
  columnHeaders: z.array(z.object({ name: z.string() })),
  rows: z.array(z.array(z.union([z.string(), z.number()]))).optional(),
});

export interface VideoRetention {
  videoId: string;
  /** Seconds. */
  avgViewDuration: number;
  /** 0–100. YouTube reports averageViewPercentage capped at 100 in practice,
   *  but loops can push it over — clamped here because retentionPct max is 100. */
  avgViewPercentage: number;
}

/** OAuth-backed, read-only. Lifetime per-video aggregates, one snapshot per sync. */
export class YouTubeAnalyticsClient {
  private constructor(private readonly accessToken: string) {}

  static async create(config: YouTubeConfig): Promise<YouTubeAnalyticsClient> {
    if (config.refreshToken === undefined) {
      throw new Error(
        'YOUTUBE_REFRESH_TOKEN missing — run `pnpm auth:youtube` first.'
      );
    }
    const accessToken = await refreshYouTubeAccessToken(
      config.clientId,
      config.clientSecret,
      config.refreshToken
    );
    return new YouTubeAnalyticsClient(accessToken);
  }

  /**
   * Lifetime retention metrics for the given videos. The Analytics API filters
   * by video ids (max ~200 per request; batched at 50 to stay safe).
   */
  async retentionByVideo(
    channelId: string,
    videoIds: string[]
  ): Promise<Map<string, VideoRetention>> {
    const result = new Map<string, VideoRetention>();
    const today = new Date().toISOString().slice(0, 10);

    for (let i = 0; i < videoIds.length; i += 50) {
      const batch = videoIds.slice(i, i + 50);
      const raw = await requestJson<unknown>(ANALYTICS_URL, {
        query: {
          ids: `channel==${channelId}`,
          startDate: '2000-01-01',
          endDate: today,
          metrics: 'averageViewDuration,averageViewPercentage',
          dimensions: 'video',
          filters: `video==${batch.join(',')}`,
        },
        headers: { authorization: `Bearer ${this.accessToken}` },
      });
      const parsed = ReportResponseSchema.parse(raw);

      const columns = parsed.columnHeaders.map((header) => header.name);
      const videoIdx = columns.indexOf('video');
      const durationIdx = columns.indexOf('averageViewDuration');
      const pctIdx = columns.indexOf('averageViewPercentage');
      if (videoIdx === -1 || durationIdx === -1 || pctIdx === -1) {
        throw new Error(
          `Unexpected Analytics columns: ${columns.join(', ')}`
        );
      }

      for (const row of parsed.rows ?? []) {
        const videoId = String(row[videoIdx]);
        const duration = Number(row[durationIdx]);
        const pct = Number(row[pctIdx]);
        result.set(videoId, {
          videoId,
          avgViewDuration: Number.isFinite(duration) ? duration : 0,
          avgViewPercentage: Number.isFinite(pct)
            ? Math.min(Math.max(pct, 0), 100)
            : 0,
        });
      }
    }

    return result;
  }
}