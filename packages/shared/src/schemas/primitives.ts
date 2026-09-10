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

/**
 * Content hypothesis tag. Originally a fixed H1/H2/H3 enum (/docs/brand-voice.md
 * §7). X1 (docs/spec/x-series.md) replaced that taxonomy with a mechanical tag
 * derived from the structured analysis fields — <format-slug>[+model][+cta:<slug>],
 * e.g. "duet-stitch+cta:comment" — and the matching DB constraint
 * (content_hypothesis_check) was dropped 2026-09-10 for the same reason.
 * This schema was the one place that reasoning was never applied — it kept
 * validating against the old three-value enum client-side, so the very first
 * X1-derived tag written to the DB (once the DB stopped rejecting it) failed
 * this Zod parse on every subsequent read of `content`, 500ing /api/analysis,
 * /api/metrics and /api/content-performance for everyone. Plain string, not
 * an enum — same reasoning already applied to SuggestionRowSchema.hypothesis
 * ("survives the taxonomy swap without a migration"), just missed here.
 */
export const HypothesisTagSchema = z.string();
export type HypothesisTag = z.infer<typeof HypothesisTagSchema>;
