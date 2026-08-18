import { z } from 'zod';
import type { YouTubeConfig } from '../config.js';
import { requestJson } from '../http.js';

const CHANNELS_URL = 'https://www.googleapis.com/youtube/v3/channels';
const PLAYLIST_ITEMS_URL = 'https://www.googleapis.com/youtube/v3/playlistItems';
const VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';

const ChannelsResponseSchema = z.object({
  items: z
    .array(
      z.object({
        contentDetails: z.object({
          relatedPlaylists: z.object({ uploads: z.string().min(1) }),
        }),
        statistics: z.object({
          subscriberCount: z.string(),
          videoCount: z.string(),
        }),
      })
    )
    .min(1),
});

const PlaylistItemsResponseSchema = z.object({
  items: z.array(
    z.object({
      contentDetails: z.object({
        videoId: z.string().min(1),
        videoPublishedAt: z.string().optional(),
      }),
    })
  ),
  nextPageToken: z.string().optional(),
});

const VideosResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().min(1),
      snippet: z.object({
        title: z.string(),
        publishedAt: z.string(),
      }),
      statistics: z.object({
        viewCount: z.string().optional(),
        likeCount: z.string().optional(),
        commentCount: z.string().optional(),
      }),
    })
  ),
});

export interface YouTubeVideo {
  videoId: string;
  title: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
}

export interface YouTubeChannelSnapshot {
  subscriberCount: number;
  videoCount: number;
  videos: YouTubeVideo[];
}

const toInt = (value: string | undefined): number =>
  value === undefined ? 0 : Number.parseInt(value, 10);

/** Public data only — API key, no OAuth. Retention comes from the Analytics client (Step 12). */
export class YouTubeDataClient {
  constructor(private readonly config: YouTubeConfig) {}

  async channelSnapshot(): Promise<YouTubeChannelSnapshot> {
    const channelRaw = await requestJson<unknown>(CHANNELS_URL, {
      query: {
        part: 'contentDetails,statistics',
        id: this.config.channelId,
        key: this.config.apiKey,
      },
    });
    const channel = ChannelsResponseSchema.parse(channelRaw);
    const first = channel.items[0];
    if (first === undefined) throw new Error('Channel not found.');
    const uploadsPlaylistId = first.contentDetails.relatedPlaylists.uploads;

    const videoIds: string[] = [];
    let pageToken: string | undefined;
    for (;;) {
      const pageRaw = await requestJson<unknown>(PLAYLIST_ITEMS_URL, {
        query: {
          part: 'contentDetails',
          playlistId: uploadsPlaylistId,
          maxResults: 50,
          pageToken,
          key: this.config.apiKey,
        },
      });
      const page = PlaylistItemsResponseSchema.parse(pageRaw);
      videoIds.push(...page.items.map((item) => item.contentDetails.videoId));
      if (page.nextPageToken === undefined) break;
      pageToken = page.nextPageToken;
    }

    const videos: YouTubeVideo[] = [];
    for (let i = 0; i < videoIds.length; i += 50) {
      const batch = videoIds.slice(i, i + 50);
      const videosRaw = await requestJson<unknown>(VIDEOS_URL, {
        query: {
          part: 'snippet,statistics',
          id: batch.join(','),
          key: this.config.apiKey,
        },
      });
      const parsed = VideosResponseSchema.parse(videosRaw);
      for (const item of parsed.items) {
        videos.push({
          videoId: item.id,
          title: item.snippet.title,
          publishedAt: item.snippet.publishedAt,
          views: toInt(item.statistics.viewCount),
          likes: toInt(item.statistics.likeCount),
          comments: toInt(item.statistics.commentCount),
        });
      }
    }

    return {
      subscriberCount: toInt(first.statistics.subscriberCount),
      videoCount: toInt(first.statistics.videoCount),
      videos,
    };
  }
}