import { z } from 'zod';
import type { TikTokConfig } from '../config.js';
import { requestJson } from '../http.js';
import { refreshTikTokAccessToken } from './auth.js';

const USER_INFO_URL = 'https://open.tiktokapis.com/v2/user/info/';
const VIDEO_LIST_URL = 'https://open.tiktokapis.com/v2/video/list/';

const UserInfoResponseSchema = z.object({
  data: z.object({
    user: z.object({
      display_name: z.string(),
      follower_count: z.number().int().nonnegative(),
      video_count: z.number().int().nonnegative(),
    }),
  }),
});

const VideoSchema = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
  video_description: z.string().optional(),
  create_time: z.number(),
  share_url: z.string().optional(),
  view_count: z.number().int().nonnegative().optional(),
  like_count: z.number().int().nonnegative().optional(),
  comment_count: z.number().int().nonnegative().optional(),
  share_count: z.number().int().nonnegative().optional(),
});
export type TikTokVideo = z.infer<typeof VideoSchema>;

const VideoListResponseSchema = z.object({
  data: z.object({
    videos: z.array(VideoSchema).optional(),
    cursor: z.number().optional(),
    has_more: z.boolean().optional(),
  }),
});

export interface TikTokSnapshot {
  followerCount: number;
  videoCount: number;
  videos: TikTokVideo[];
}

/**
 * Read-only TikTok client. Exchanges the refresh token for an access token
 * once per construction; TikTok rotates refresh tokens, so the new value is
 * surfaced for the caller to report (env update is manual, by design).
 */
export class TikTokClient {
  private constructor(
    private readonly accessToken: string,
    readonly rotatedRefreshToken: string
  ) {}

  static async create(config: TikTokConfig): Promise<TikTokClient> {
    if (config.refreshToken === undefined) {
      throw new Error(
        'TIKTOK_REFRESH_TOKEN missing — run `pnpm auth:tiktok` first.'
      );
    }
    const tokens = await refreshTikTokAccessToken(
      config.clientKey,
      config.clientSecret,
      config.refreshToken
    );
    return new TikTokClient(tokens.accessToken, tokens.refreshToken);
  }

  async userInfo(): Promise<{ followerCount: number; videoCount: number }> {
    const raw = await requestJson<unknown>(USER_INFO_URL, {
      query: { fields: 'display_name,follower_count,video_count' },
      headers: { authorization: `Bearer ${this.accessToken}` },
    });
    const parsed = UserInfoResponseSchema.parse(raw);
    return {
      followerCount: parsed.data.user.follower_count,
      videoCount: parsed.data.user.video_count,
    };
  }

  /** Walks video.list to the end (20 per page, cursor-paginated). */
  async allVideos(): Promise<TikTokVideo[]> {
    const fields =
      'id,title,video_description,create_time,share_url,view_count,like_count,comment_count,share_count';
    const videos: TikTokVideo[] = [];
    let cursor: number | undefined;

    for (;;) {
      const raw = await requestJson<unknown>(VIDEO_LIST_URL, {
        method: 'POST',
        query: { fields },
        headers: { authorization: `Bearer ${this.accessToken}` },
        json: cursor === undefined ? { max_count: 20 } : { max_count: 20, cursor },
      });
      const parsed = VideoListResponseSchema.parse(raw);
      videos.push(...(parsed.data.videos ?? []));
      if (parsed.data.has_more !== true || parsed.data.cursor === undefined) {
        return videos;
      }
      cursor = parsed.data.cursor;
    }
  }

  /** Everything the sync needs in one call sequence. */
  async snapshot(): Promise<TikTokSnapshot> {
    const [user, videos] = [await this.userInfo(), await this.allVideos()];
    return {
      followerCount: user.followerCount,
      videoCount: user.videoCount,
      videos,
    };
  }
}