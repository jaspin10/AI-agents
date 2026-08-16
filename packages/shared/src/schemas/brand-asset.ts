import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './primitives.js';

/** One chunk of the brand constitution (§10). Embedding stays null until M4. */
export const BrandAssetChunkSchema = z.object({
  id: IdSchema.optional(),
  source: z.string().min(1).default('brand-voice.md'),
  version: z.string().min(1),
  chunkIndex: z.number().int().nonnegative(),
  heading: z.string().nullable(),
  content: z.string().min(1),
  ingestedAt: IsoDateTimeSchema.optional(),
});
export type BrandAssetChunk = z.infer<typeof BrandAssetChunkSchema>;