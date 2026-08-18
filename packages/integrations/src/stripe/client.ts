import { z } from 'zod';
import type { StripeConfig } from '../config.js';
import { requestJson } from '../http.js';

const CHECKOUT_SESSIONS_URL = 'https://api.stripe.com/v1/checkout/sessions';

const LineItemSchema = z.object({
  description: z.string().nullable().optional(),
  price: z
    .object({
      product: z.union([
        z.string(),
        z.object({ name: z.string().optional() }),
      ]).optional(),
    })
    .nullable()
    .optional(),
});

const SessionSchema = z.object({
  id: z.string().min(1),
  customer: z.string().nullable(),
  payment_intent: z.string().nullable(),
  amount_total: z.number().int().nullable(),
  currency: z.string().nullable(),
  status: z.string().nullable(),
  created: z.number(),
  line_items: z
    .object({ data: z.array(LineItemSchema) })
    .optional(),
});

const SessionListSchema = z.object({
  data: z.array(SessionSchema),
  has_more: z.boolean(),
});

export interface StripeEnrollment {
  checkoutSessionId: string;
  customerId: string | null;
  paymentIntentId: string | null;
  amountCents: number | null;
  currency: string;
  status: string;
  productName: string | null;
  /** Unix seconds from Stripe, converted to ISO by the sync. */
  createdUnix: number;
}

/** Restricted read-only key (rk_). Lists Checkout Sessions with line items expanded. */
export class StripeClient {
  constructor(private readonly config: StripeConfig) {}

  /**
   * All sessions, newest first, paginated. `sinceUnix` limits to sessions
   * created after that time (incremental syncs).
   */
  async allCheckoutSessions(sinceUnix?: number): Promise<StripeEnrollment[]> {
    const enrollments: StripeEnrollment[] = [];
    let startingAfter: string | undefined;

    for (;;) {
      const query: Record<string, string | number | undefined> = {
        limit: 100,
        'expand[]': 'data.line_items',
        starting_after: startingAfter,
      };
      if (sinceUnix !== undefined) query['created[gt]'] = sinceUnix;

      const raw = await requestJson<unknown>(CHECKOUT_SESSIONS_URL, {
        query,
        headers: { authorization: `Bearer ${this.config.secretKey}` },
      });
      const page = SessionListSchema.parse(raw);

      for (const session of page.data) {
        const firstItem = session.line_items?.data[0];
        const product = firstItem?.price?.product;
        const productName =
          typeof product === 'object' && product !== null
            ? product.name ?? firstItem?.description ?? null
            : firstItem?.description ?? null;

        enrollments.push({
          checkoutSessionId: session.id,
          customerId: session.customer,
          paymentIntentId: session.payment_intent,
          amountCents: session.amount_total,
          currency: session.currency ?? 'cad',
          status: session.status ?? 'unknown',
          productName,
          createdUnix: session.created,
        });
      }

      const last = page.data[page.data.length - 1];
      if (!page.has_more || last === undefined) break;
      startingAfter = last.id;
    }

    return enrollments;
  }
}