import { z } from 'zod';
import type { ToolDefinition } from '@platform/shared';
import {
  readStripeConfig,
  readTikTokConfig,
  readYouTubeConfig,
} from './config.js';
import { TikTokClient } from './tiktok/client.js';
import { YouTubeDataClient } from './youtube/data-client.js';
import { YouTubeAnalyticsClient } from './youtube/analytics-client.js';
import { StripeClient } from './stripe/client.js';

const EmptyInputSchema = z.object({}).strict();

const TikTokSnapshotOutputSchema = z.object({
  followerCount: z.number().int().nonnegative(),
  videoCount: z.number().int().nonnegative(),
  videos: z.array(z.unknown()),
});

const YouTubeSnapshotOutputSchema = z.object({
  subscriberCount: z.number().int().nonnegative(),
  videoCount: z.number().int().nonnegative(),
  videos: z.array(z.unknown()),
});

const StripeEnrollmentsOutputSchema = z.object({
  enrollments: z.array(z.unknown()),
});

/**
 * Read-only tools for the ToolRegistry (locked decision 1, 2026-08-18:
 * ToolDefinition now, MCP-wrapped at M4 if needed). Every tool here is a
 * read — no publish or write action exists in this module or anywhere else (§6).
 */
export const tiktokSnapshotTool: ToolDefinition = {
  name: 'tiktok.snapshot',
  description:
    'READ-ONLY. Current TikTok account stats and all videos with public counters. No retention/watch-time (platform does not expose them).',
  inputSchema: EmptyInputSchema,
  outputSchema: TikTokSnapshotOutputSchema,
  execute: async () => {
    const config = readTikTokConfig();
    if (config === null) throw new Error('TikTok env vars not configured.');
    const client = await TikTokClient.create(config);
    return client.snapshot();
  },
};

export const youtubeSnapshotTool: ToolDefinition = {
  name: 'youtube.snapshot',
  description:
    'READ-ONLY. Current YouTube channel stats and all videos with public counters (Data API).',
  inputSchema: EmptyInputSchema,
  outputSchema: YouTubeSnapshotOutputSchema,
  execute: async () => {
    const config = readYouTubeConfig();
    if (config === null) throw new Error('YouTube env vars not configured.');
    const client = new YouTubeDataClient(config);
    return client.channelSnapshot();
  },
};

export const stripeEnrollmentsTool: ToolDefinition = {
  name: 'stripe.enrollments',
  description:
    'READ-ONLY. All Stripe Checkout Sessions (enrollments) with product names. Restricted read-only key.',
  inputSchema: EmptyInputSchema,
  outputSchema: StripeEnrollmentsOutputSchema,
  execute: async () => {
    const config = readStripeConfig();
    if (config === null) throw new Error('Stripe env vars not configured.');
    const client = new StripeClient(config);
    const enrollments = await client.allCheckoutSessions();
    return { enrollments };
  },
};

export const integrationTools: ToolDefinition[] = [
  tiktokSnapshotTool,
  youtubeSnapshotTool,
  stripeEnrollmentsTool,
];

export { YouTubeAnalyticsClient };