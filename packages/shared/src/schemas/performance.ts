import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema, PlatformSchema } from './primitives.js';

/** Point-in-time metrics for one video on one platform. Fields a platform doesn't expose are null. */
export const VideoMetricsSchema = z.object({
  views: z.number().int().nonnegative(),
  likes: z.number().int().nonnegative(),
  comments: z.number().int().nonnegative(),
  shares: z.number().int().nonnegative(),
  saves: z.number().int().nonnegative().nullable(),
  avgWatchTimeSeconds: z.number().nonnegative().nullable(),
  retentionPct: z.number().min(0).max(100).nullable(),
  followersAtCapture: z.number().int().nonnegative().nullable(),
});
export type VideoMetrics = z.infer<typeof VideoMetricsSchema>;

/** One row of the performance table (§3): metrics per video per platform over time. */
/** One row of the performance table (§3): metrics per video per platform over time.
 *  Unique per (contentId, capturedDate) — one snapshot per video per UTC day. */
export const PerformanceRecordSchema = z.object({
  id: IdSchema,
  /** FK into the content table from M2; platform-native video id until then. */
  contentId: z.string().min(1),
  platform: PlatformSchema,
  capturedAt: IsoDateTimeSchema,
  /** UTC calendar date of capture, e.g. "2026-08-18" — idempotency key with contentId. */
  capturedDate: z.iso.date(),
  metrics: VideoMetricsSchema,
});
export type PerformanceRecord = z.infer<typeof PerformanceRecordSchema>;

