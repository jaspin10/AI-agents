import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './primitives.js';

export const CourseLevelSchema = z.enum([
  'beginner',
  'intermediate',
  'advanced',
]);
export type CourseLevel = z.infer<typeof CourseLevelSchema>;

/**
 * Stripe-shaped (owner decision 2026-08-16). One enrollment = one Checkout
 * Session (M3 decision 2026-08-18); unique on stripeCheckoutSessionId in SQL.
 * courseLevel stays null in M3 — never derived from Stripe product names;
 * the raw name is kept in stripeProductName instead.
 */
export const EnrollmentRowSchema = z.object({
  id: IdSchema.optional(),
  stripeCustomerId: z.string().nullable(),
  stripeCheckoutSessionId: z.string().nullable(),
  stripePaymentIntentId: z.string().nullable(),
  /** Raw product name from the Checkout Session line item, verbatim. Added M3. */
  stripeProductName: z.string().nullable(),
  amountCents: z.number().int().nonnegative().nullable(),
  currency: z.string().default('cad'),
  status: z.string().min(1).default('paid'),
  courseLevel: CourseLevelSchema.nullable(),
  enrolledAt: IsoDateTimeSchema,
});
export type EnrollmentRow = z.infer<typeof EnrollmentRowSchema>;