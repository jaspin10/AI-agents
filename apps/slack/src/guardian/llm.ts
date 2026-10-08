import { randomUUID } from 'node:crypto';
import type { Portal } from './portal.js';

/**
 * Guardian's own LLM access. Uses GUARDIAN_ANTHROPIC_API_KEY (never the analyst's
 * ANTHROPIC_API_KEY) and its own CA$ monthly cap, metered in the PORTAL database
 * (guardian_ai_calls) because Guardian's state lives there:
 *   reserve(estimate) BEFORE the call -> refused if it would pass the cap
 *   settle(actual cost) after the call, or release() if the call failed.
 * When the cap is reached, investigations simply wait (incidents stay TRIGGERED);
 * detection and grouping are AI-free and keep running.
 */

/** USD per million tokens. Unknown models are priced as the most expensive known one. */
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-5-5': { input: 1, output: 5 },
};
const FALLBACK_PRICE = { input: 15, output: 75 };

export function priceFor(model: string): { input: number; output: number } {
  const key = Object.keys(PRICES).find((name) => model.startsWith(name));
  return key === undefined ? FALLBACK_PRICE : (PRICES[key] ?? FALLBACK_PRICE);
}

/** Rough token estimate: ~3.5 characters per token, rounded up. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/** CA$ cents for a call, always rounded UP so the meter never under-counts. */
export function costCents(model: string, inputTokens: number, outputTokens: number, usdToCad: number): number {
  const price = priceFor(model);
  const usd = (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
  return Math.ceil(usd * usdToCad * 100);
}

export class BudgetExhaustedError extends Error {
  constructor(usedCents: number, capCents: number) {
    super(`Guardian AI budget reached: CA$${(usedCents / 100).toFixed(2)} of CA$${(capCents / 100).toFixed(2)} used this month`);
    this.name = 'BudgetExhaustedError';
  }
}

export interface GuardianLlm {
  complete: (options: { purpose: string; incidentId: string | null; system: string; user: string; maxTokens: number }) => Promise<string>;
}

export function createGuardianLlm(options: { apiKey: string; model: string; capCents: number; usdToCad: number; portal: Portal }): GuardianLlm {
  return {
    async complete({ purpose, incidentId, system, user, maxTokens }) {
      const id = randomUUID();
      const estimate = costCents(options.model, estimateTokens(system + user), maxTokens, options.usdToCad);
      const reservation = await options.portal.aiReserve(id, incidentId, purpose, estimate, options.capCents);
      if (!reservation.ok) throw new BudgetExhaustedError(reservation.used_cents, reservation.cap_cents);

      let response: Response;
      try {
        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': options.apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: options.model,
            max_tokens: maxTokens,
            system,
            messages: [{ role: 'user', content: user }],
          }),
          signal: AbortSignal.timeout(180000),
        });
      } catch (error) {
        await options.portal.aiRelease(id);
        throw error;
      }
      if (!response.ok) {
        await options.portal.aiRelease(id);
        throw new Error(`Anthropic API ${response.status}: ${(await response.text()).slice(0, 200)}`);
      }
      const data = (await response.json()) as { model?: string; content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
      const inputTokens = data.usage?.input_tokens ?? 0;
      const outputTokens = data.usage?.output_tokens ?? 0;
      const model = data.model ?? options.model;
      await options.portal.aiSettle(id, model, inputTokens, outputTokens, costCents(model, inputTokens, outputTokens, options.usdToCad));
      return (data.content ?? []).map((block) => (block.type === 'text' ? (block.text ?? '') : '')).join('');
    },
  };
}
