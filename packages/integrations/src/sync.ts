import { randomUUID } from 'node:crypto';
import { createLogger } from '@platform/shared';
import type {
  ContentRow,
  EnrollmentRow,
  PerformanceRecord,
} from '@platform/shared';
import { createMemoryClient } from '@platform/memory';
import {
  readStripeConfig,
  readTikTokConfig,
  readYouTubeConfig,
} from './config.js';
import { TikTokClient } from './tiktok/client.js';
import { YouTubeDataClient } from './youtube/data-client.js';
import { YouTubeAnalyticsClient } from './youtube/analytics-client.js';
import { StripeClient } from './stripe/client.js';
import { loadHypothesisTags, tagFor, type HypothesisTagMap } from './hypothesis-tags.js';

const logger = createLogger('sync');

type PlatformName = 'tiktok' | 'youtube' | 'stripe';
const ALL_PLATFORMS: PlatformName[] = ['tiktok', 'youtube', 'stripe'];

interface SyncOptions {
  dryRun: boolean;
  platforms: PlatformName[];
}

interface Writer {
  content: (row: ContentRow) => Promise<void>;
  performance: (row: PerformanceRecord) => Promise<void>;
  enrollment: (row: EnrollmentRow) => Promise<void>;
  counts: { content: number; performance: number; enrollments: number };
}

function parseArgs(argv: string[]): SyncOptions {
  const dryRun = argv.includes('--dry-run');
  const platformFlagIdx = argv.indexOf('--platform');
  let platforms: PlatformName[] = ALL_PLATFORMS;
  if (platformFlagIdx !== -1) {
    const value = argv[platformFlagIdx + 1];
    if (value === undefined) throw new Error('--platform needs a value, e.g. --platform tiktok,stripe');
    const requested = value.split(',').map((p) => p.trim());
    for (const p of requested) {
      if (!ALL_PLATFORMS.includes(p as PlatformName)) {
        throw new Error(`Unknown platform '${p}'. Valid: ${ALL_PLATFORMS.join(', ')}`);
      }
    }
    platforms = requested as PlatformName[];
  }
  return { dryRun, platforms };
}

function makeWriter(dryRun: boolean): Writer {
  const counts = { content: 0, performance: 0, enrollments: 0 };
  if (dryRun) {
    return {
      counts,
      content: async (row) => {
        counts.content += 1;
        console.log(`[dry-run] content upsert: ${row.platform}/${row.platformVideoId} "${row.title ?? ''}" hypothesis=${row.hypothesis ?? 'null'}`);
      },
      performance: async (row) => {
        counts.performance += 1;
        console.log(
          `[dry-run] performance upsert: ${row.platform}/${row.contentId} ${row.capturedDate} views=${row.metrics.views} retention=${row.metrics.retentionPct ?? 'null'} watchTime=${row.metrics.avgWatchTimeSeconds ?? 'null'}`
        );
      },
      enrollment: async (row) => {
        counts.enrollments += 1;
        console.log(
          `[dry-run] enrollment upsert: ${row.stripeCheckoutSessionId} ${row.status} ${row.amountCents ?? 'null'} ${row.currency} product="${row.stripeProductName ?? 'null'}"`
        );
      },
    };
  }
  const memory = createMemoryClient();
  return {
    counts,
    content: async (row) => {
      await memory.content.upsert(row);
      counts.content += 1;
    },
    performance: async (row) => {
      await memory.performance.upsert(row);
      counts.performance += 1;
    },
    enrollment: async (row) => {
      await memory.enrollments.upsert(row);
      counts.enrollments += 1;
    },
  };
}

/** Existing DB tags — a re-run must never null a tag the CSV no longer carries. */
async function existingTags(dryRun: boolean): Promise<HypothesisTagMap> {
  if (dryRun) return new Map();
  const memory = createMemoryClient();
  const rows = await memory.content.all();
  const map: HypothesisTagMap = new Map();
  for (const row of rows) {
    if (row.hypothesis !== null) {
      map.set(`${row.platform}:${row.platformVideoId}`, row.hypothesis);
    }
  }
  return map;
}

async function syncTikTok(writer: Writer, csvTags: HypothesisTagMap, dbTags: HypothesisTagMap): Promise<void> {
  const config = readTikTokConfig();
  if (config === null) throw new Error('TikTok env vars not configured — skipping requires removing it via --platform.');
  const client = await TikTokClient.create(config);
  const snapshot = await client.snapshot();
  logger.info(`tiktok: ${snapshot.videos.length} videos, ${snapshot.followerCount} followers`);

  const now = new Date();
  const capturedAt = now.toISOString();
  const capturedDate = capturedAt.slice(0, 10);

  for (const video of snapshot.videos) {
    const hypothesis =
      tagFor(csvTags, 'tiktok', video.id) ??
      dbTags.get(`tiktok:${video.id}`) ??
      null;
    await writer.content({
      platform: 'tiktok',
      platformVideoId: video.id,
      title: video.title ?? video.video_description ?? null,
      hook: null,
      format: null,
      hypothesis,
      postedAt: new Date(video.create_time * 1000).toISOString(),
    });
    await writer.performance({
      id: randomUUID(),
      contentId: video.id,
      platform: 'tiktok',
      capturedAt,
      capturedDate,
      metrics: {
        views: video.view_count ?? 0,
        likes: video.like_count ?? 0,
        comments: video.comment_count ?? 0,
        shares: video.share_count ?? 0,
        saves: null,
        avgWatchTimeSeconds: null, // platform does not expose — never derived
        retentionPct: null, // platform does not expose — never derived
        followersAtCapture: snapshot.followerCount,
      },
    });
  }
}

async function syncYouTube(writer: Writer, csvTags: HypothesisTagMap, dbTags: HypothesisTagMap): Promise<void> {
  const config = readYouTubeConfig();
  if (config === null) throw new Error('YouTube env vars not configured.');
  const dataClient = new YouTubeDataClient(config);
  const analyticsClient = await YouTubeAnalyticsClient.create(config);

  const snapshot = await dataClient.channelSnapshot();
  logger.info(`youtube: ${snapshot.videos.length} videos, ${snapshot.subscriberCount} subscribers`);

  const retention = await analyticsClient.retentionByVideo(
    config.channelId,
    snapshot.videos.map((v) => v.videoId)
  );

  const now = new Date();
  const capturedAt = now.toISOString();
  const capturedDate = capturedAt.slice(0, 10);

  for (const video of snapshot.videos) {
    const hypothesis =
      tagFor(csvTags, 'youtube', video.videoId) ??
      dbTags.get(`youtube:${video.videoId}`) ??
      null;
    await writer.content({
      platform: 'youtube',
      platformVideoId: video.videoId,
      title: video.title,
      hook: null,
      format: null,
      hypothesis,
      postedAt: video.publishedAt,
    });
    const videoRetention = retention.get(video.videoId);
    await writer.performance({
      id: randomUUID(),
      contentId: video.videoId,
      platform: 'youtube',
      capturedAt,
      capturedDate,
      metrics: {
        views: video.views,
        likes: video.likes,
        comments: video.comments,
        shares: 0, // Data API does not expose share counts
        saves: null,
        avgWatchTimeSeconds: videoRetention?.avgViewDuration ?? null,
        retentionPct: videoRetention?.avgViewPercentage ?? null,
        followersAtCapture: snapshot.subscriberCount,
      },
    });
  }
}

async function syncStripe(writer: Writer): Promise<void> {
  const config = readStripeConfig();
  if (config === null) throw new Error('Stripe env vars not configured.');
  const client = new StripeClient(config);
  const sessions = await client.allCheckoutSessions();
  logger.info(`stripe: ${sessions.length} checkout sessions`);

  for (const session of sessions) {
    await writer.enrollment({
      stripeCustomerId: session.customerId,
      stripeCheckoutSessionId: session.checkoutSessionId,
      stripePaymentIntentId: session.paymentIntentId,
      stripeProductName: session.productName,
      amountCents: session.amountCents ?? null,
      currency: session.currency,
      status: session.status,
      courseLevel: null, // locked decision: never derived from Stripe names
      enrolledAt: new Date(session.createdUnix * 1000).toISOString(),
    });
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  logger.info(
    `sync starting — platforms: ${options.platforms.join(', ')}${options.dryRun ? ' (DRY RUN — nothing will be written)' : ''}`
  );

  const writer = makeWriter(options.dryRun);
  const csvTags = await loadHypothesisTags();
  logger.info(`hypothesis tags loaded from CSV: ${csvTags.size}`);
  const dbTags = await existingTags(options.dryRun);

  const failures: { platform: PlatformName; message: string }[] = [];
  for (const platform of options.platforms) {
    try {
      if (platform === 'tiktok') await syncTikTok(writer, csvTags, dbTags);
      else if (platform === 'youtube') await syncYouTube(writer, csvTags, dbTags);
      else await syncStripe(writer);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ platform, message });
      logger.error(`${platform} sync failed: ${message}`);
    }
  }

  console.log('\n──────── sync summary ────────');
  console.log(`content rows:     ${writer.counts.content}`);
  console.log(`performance rows: ${writer.counts.performance}`);
  console.log(`enrollment rows:  ${writer.counts.enrollments}`);
  if (options.dryRun) console.log('(dry run — nothing was written)');
  if (failures.length > 0) {
    console.log(`FAILED: ${failures.map((f) => f.platform).join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});