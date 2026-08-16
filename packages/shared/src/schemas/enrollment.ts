import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './primitives.js';

export const CourseLevelSchema = z.enum([
  'beginner',
  'intermediate',
  'advanced',
]);
export type CourseLevel = z.infer<typeof CourseLevelSchema>;

/** Stripe-shaped (owner decision 2026-08-16). Stripe ingestion lands in M3. */
export const EnrollmentRowSchema = z.object({
  id: IdSchema.optional(),
  stripeCustomerId: z.string().nullable(),
  stripeCheckoutSessionId: z.string().nullable(),
  stripePaymentIntentId: z.string().nullable(),
  amountCents: z.number().int().nonnegative().nullable(),
  currency: z.string().default('cad'),
  status: z.string().min(1).default('paid'),
  courseLevel: CourseLevelSchema.nullable(),
  enrolledAt: IsoDateTimeSchema,
});
export type EnrollmentRow = z.infer<typeof EnrollmentRowSchema>;