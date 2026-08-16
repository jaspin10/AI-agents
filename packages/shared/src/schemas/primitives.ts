import { z } from 'zod';

/** RFC 4122 UUID — every entity id on the platform. */
export const IdSchema = z.uuid();
export type Id = z.infer<typeof IdSchema>;

/** ISO-8601 UTC timestamp, e.g. "2026-08-16T09:30:00.000Z". */
export const IsoDateTimeSchema = z.iso.datetime();
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

/** Platforms with read-only analytics ingestion (§3). */
export const PlatformSchema = z.enum(['instagram', 'tiktok', 'youtube']);
export type Platform = z.infer<typeof PlatformSchema>;

/** Content hypotheses H1–H3, defined in /docs/brand-voice.md §7. */
export const HypothesisTagSchema = z.enum(['H1', 'H2', 'H3']);
export type HypothesisTag = z.infer<typeof HypothesisTagSchema>;
