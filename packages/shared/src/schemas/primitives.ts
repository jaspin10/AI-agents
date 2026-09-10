import { z } from 'zod';

/** RFC 4122 UUID — every entity id on the platform. */
export const IdSchema = z.uuid();
export type Id = z.infer<typeof IdSchema>;

/** ISO-8601 UTC timestamp, e.g. "2026-08-16T09:30:00.000Z". */
export const IsoDateTimeSchema = z.iso.datetime();
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

/**
 * Platforms with read-only analytics ingestion (§3). 'youtube_shorts' is a
 * distinct value from 'youtube' (locked 2026-09-10) — YouTube's Data API has
 * no official Short/long flag, so sync.ts classifies by duration at sync
 * time. Kept as its own platform value (not a subtype field) so every
 * platform-agnostic filter/pairing already built for X1 picks it up for free.
 */
export const PlatformSchema = z.enum(['instagram', 'tiktok', 'youtube', 'youtube_shorts']);
export type Platform = z.infer<typeof PlatformSchema>;

/** Content hypotheses H1–H3, defined in /docs/brand-voice.md §7. */
export const HypothesisTagSchema = z.enum(['H1', 'H2', 'H3']);
export type HypothesisTag = z.infer<typeof HypothesisTagSchema>;
