import { z } from 'zod';

export const ConfirmedBrainLineageSchema = z.object({
  id: z.uuid(), production_id: z.uuid(), brief_id: z.uuid(), brief_version: z.number().int().positive(),
  content_uuid: z.uuid(), asset_version: z.string(), asset_fingerprint: z.string().optional(),
  confirmed_at: z.string(), confirmed_by: z.string(),
  suggestionId: z.uuid().nullable().optional(),
});
export type ConfirmedBrainLineage = z.infer<typeof ConfirmedBrainLineageSchema>;
export const BrainClaimSchema = z.object({
  platform: z.string(), dimension: z.enum(['format','idea_source','cta_type','has_model','hypothesis']), value: z.string(),
  n: z.number().int().min(8), medianEngagementPct: z.number().finite().nonnegative(), platformMedianPct: z.number().finite().nonnegative(),
  relativeDelta: z.number().finite(), direction: z.enum(['works','doesnt','neutral']), strength: z.literal('pooled'),
  evidence: z.object({ videoIds: z.array(z.uuid()), adBoostedCount: z.number().int().nonnegative(), adUnknownCount: z.number().int().nonnegative() }),
}).refine(c => new Set(c.evidence.videoIds).size === c.n && c.evidence.adBoostedCount + c.evidence.adUnknownCount <= c.n, 'Pattern evidence must match its sample');
