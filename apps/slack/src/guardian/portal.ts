import { z } from 'zod';

/**
 * Client for the portal's guardian-incidents Edge Function (x-guardian-secret).
 * Portal side: french-with-jas-portal supabase/functions/guardian-incidents.
 * Guardian keeps ALL its state in the portal database (incidents, repairs,
 * AI spend), because the analyst Supabase is a separate project.
 */

export const IncidentSchema = z.object({
  id: z.string(),
  fingerprint: z.string(),
  feature: z.string().nullable(),
  route: z.string().nullable(),
  operation: z.string().nullable(),
  normalized_error_type: z.string().nullable(),
  sample_message: z.string().nullable(),
  severity: z.string().nullable(),
  status: z.string(),
  trigger_reason: z.string().nullable(),
  occurrence_count: z.number().nullable(),
  distinct_student_count: z.number().nullable(),
  first_seen: z.string().nullable(),
  last_seen: z.string().nullable(),
  triggered_at: z.string().nullable(),
}).passthrough();
export type Incident = z.infer<typeof IncidentSchema>;

export const RepairSchema = z.object({
  id: z.string(),
  incident_id: z.string(),
  size: z.enum(['small', 'big']),
  big_reasons: z.array(z.string()),
  summary: z.string(),
  branch: z.string().nullable(),
  pr_number: z.number().nullable(),
  pr_url: z.string().nullable(),
  status: z.string(),
  merge_sha: z.string().nullable(),
  merged_at: z.string().nullable(),
  watch_until: z.string().nullable(),
  before_errors: z.number().nullable(),
}).passthrough();
export type Repair = z.infer<typeof RepairSchema>;

/** One incident's own staff screenshot (WhatsApp staff_report). Never a free storage path. */
export const SCREENSHOT_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_SCREENSHOT_B64 = Math.ceil((4 * 1024 * 1024) / 3) * 4;
export const ScreenshotSchema = z.union([
  z.object({ ok: z.literal(true), media_type: z.enum(SCREENSHOT_MEDIA_TYPES), data: z.string().min(1).max(MAX_SCREENSHOT_B64).regex(/^[A-Za-z0-9+/]+=*$/), bytes: z.number() }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type Screenshot = z.infer<typeof ScreenshotSchema>;

export type PortalCall = (action: string, body: Record<string, unknown>) => Promise<unknown>;

export class PortalError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'PortalError';
  }
}

export function createPortalCall(url: string, secret: string): PortalCall {
  return async function call(action, body) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-guardian-secret': secret },
      body: JSON.stringify({ ...body, action }),
    });
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    if (!response.ok) {
      const err = parsed !== null && typeof parsed === 'object' && 'error' in parsed ? String((parsed as { error: unknown }).error) : text.slice(0, 200);
      throw new PortalError(response.status, `portal ${action} failed (${response.status}): ${err}`);
    }
    return parsed;
  };
}

/** Typed wrappers over the raw call - every one goes through the orchestrator tool. */
export class Portal {
  constructor(private readonly call: PortalCall) {}

  async listIncidents(statuses: string[], limit: number): Promise<Incident[]> {
    const out = z.object({ incidents: z.array(IncidentSchema) }).parse(await this.call('list_incidents', { statuses, limit }));
    return out.incidents;
  }

  async getIncident(incidentId: string): Promise<{ incident: Incident; occurrences: unknown[]; timeline: unknown[] }> {
    return z.object({ incident: IncidentSchema, occurrences: z.array(z.unknown()), timeline: z.array(z.unknown()) }).parse(await this.call('get_incident', { incident_id: incidentId }));
  }

  async getScreenshot(incidentId: string): Promise<Screenshot> {
    return ScreenshotSchema.parse(await this.call('get_screenshot', { incident_id: incidentId }));
  }

  async writeInvestigation(incidentId: string, investigation: Record<string, unknown>, newStatus: string, summary: string): Promise<void> {
    await this.call('write_investigation', { incident_id: incidentId, investigation, new_status: newStatus, summary });
  }

  async updateStatus(incidentId: string, status: string, detail: string, repairPrUrl?: string): Promise<void> {
    await this.call('update_status', { incident_id: incidentId, status, detail, repair_pr_url: repairPrUrl });
  }

  async aiReserve(id: string, incidentId: string | null, purpose: string, estCents: number, capCents: number): Promise<{ ok: boolean; used_cents: number; cap_cents: number }> {
    return z.object({ ok: z.boolean(), used_cents: z.number(), cap_cents: z.number() }).parse(await this.call('ai_reserve', { id, incident_id: incidentId, purpose, est_cents: estCents, cap_cents: capCents }));
  }

  async aiSettle(id: string, model: string, inputTokens: number, outputTokens: number, costCents: number): Promise<void> {
    await this.call('ai_settle', { id, model, input_tokens: inputTokens, output_tokens: outputTokens, cost_cents: costCents });
  }

  async aiRelease(id: string): Promise<void> {
    await this.call('ai_release', { id });
  }

  async createRepair(row: Record<string, unknown>): Promise<Repair> {
    return z.object({ repair: RepairSchema }).parse(await this.call('repair_create', { repair: row })).repair;
  }

  async updateRepair(id: string, fields: Record<string, unknown>): Promise<void> {
    await this.call('repair_update', { id, fields });
  }

  async listRepairs(statuses: string[]): Promise<Repair[]> {
    return z.object({ repairs: z.array(RepairSchema) }).parse(await this.call('repair_list', { statuses })).repairs;
  }

  async errorCounts(incidentId: string, from: string, to: string): Promise<{ same: number; total: number }> {
    return z.object({ same: z.number(), total: z.number() }).parse(await this.call('error_counts', { incident_id: incidentId, from, to }));
  }

  /** Error Inbox notice (ops_alerts, also emailed) + WhatsApp portal_notice template. */
  async notify(kind: string, dedupeKey: string, text: string, audience: 'owner' | 'owner_and_sales', whatsapp: boolean): Promise<void> {
    await this.call('notify', { kind, dedupe_key: dedupeKey, text, audience, whatsapp });
  }
}
