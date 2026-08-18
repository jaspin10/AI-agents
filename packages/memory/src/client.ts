import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  BrandAssetChunkSchema,
  ContentRowSchema,
  ConversationRowSchema,
  DemoLogRowSchema,
  EnrollmentRowSchema,
  PerformanceRecordSchema,
  type BrandAssetChunk,
  type ContentRow,
  type ConversationRow,
  type DemoLogRow,
  type EnrollmentRow,
  type PerformanceRecord,
} from '@platform/shared';
import type { SupabaseConfig } from './config.js';

/**
 * Typed read/write helpers for the §3 memory tables. Insert helpers validate
 * with Zod before writing; read helpers validate after reading. Retrieval
 * (embeddings/pgvector) lands in M4 — until then reads are simple selects.
 * Upsert helpers (M3) key on the migration-0002 unique indexes for idempotent syncs.
 */
export interface MemoryClient {
  brandAssets: {
    upsertChunks: (chunks: BrandAssetChunk[]) => Promise<number>;
    allChunks: (source?: string) => Promise<BrandAssetChunk[]>;
    deleteBySourceVersion: (source: string, version: string) => Promise<void>;
  };
  content: {
    insert: (row: ContentRow) => Promise<void>;
    upsert: (row: ContentRow) => Promise<void>;
    all: () => Promise<ContentRow[]>;
  };
  performance: {
    insert: (row: PerformanceRecord) => Promise<void>;
    upsert: (row: PerformanceRecord) => Promise<void>;
    all: () => Promise<PerformanceRecord[]>;
  };
  conversations: {
    insert: (row: ConversationRow) => Promise<void>;
    all: () => Promise<ConversationRow[]>;
  };
  enrollments: {
    insert: (row: EnrollmentRow) => Promise<void>;
    upsert: (row: EnrollmentRow) => Promise<void>;
    all: () => Promise<EnrollmentRow[]>;
  };
  demoLog: {
    insert: (row: DemoLogRow) => Promise<void>;
    all: () => Promise<DemoLogRow[]>;
  };
}

function fail(table: string, op: string, message: string): never {
  throw new Error(`Supabase ${table} ${op} failed: ${message}`);
}

export function createMemoryClientFromConfig(
  config: SupabaseConfig
): MemoryClient {
  const db: SupabaseClient = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false },
  });

  return {
    brandAssets: {
      async upsertChunks(chunks) {
        const validated = chunks.map((c) => BrandAssetChunkSchema.parse(c));
        const rows = validated.map((c) => ({
          source: c.source,
          version: c.version,
          chunk_index: c.chunkIndex,
          heading: c.heading,
          content: c.content,
        }));
        const { error } = await db
          .from('brand_assets')
          .upsert(rows, { onConflict: 'source,version,chunk_index' });
        if (error) fail('brand_assets', 'upsert', error.message);
        return rows.length;
      },
      async allChunks(source) {
        let query = db
          .from('brand_assets')
          .select('*')
          .order('chunk_index', { ascending: true });
        if (source !== undefined) query = query.eq('source', source);
        const { data, error } = await query;
        if (error) fail('brand_assets', 'select', error.message);
        return (data ?? []).map((r) =>
          BrandAssetChunkSchema.parse({
            id: r['id'],
            source: r['source'],
            version: r['version'],
            chunkIndex: r['chunk_index'],
            heading: r['heading'],
            content: r['content'],
            ingestedAt: new Date(String(r['ingested_at'])).toISOString(),
          })
        );
      },
      async deleteBySourceVersion(source, version) {
        const { error } = await db
          .from('brand_assets')
          .delete()
          .eq('source', source)
          .eq('version', version);
        if (error) fail('brand_assets', 'delete', error.message);
      },
    },
    content: {
      async insert(row) {
        const c = ContentRowSchema.parse(row);
        const { error } = await db.from('content').insert({
          platform: c.platform,
          platform_video_id: c.platformVideoId,
          title: c.title,
          hook: c.hook,
          format: c.format,
          hypothesis: c.hypothesis,
          posted_at: c.postedAt,
        });
        if (error) fail('content', 'insert', error.message);
      },
      async upsert(row) {
        const c = ContentRowSchema.parse(row);
        const { error } = await db.from('content').upsert(
          {
            platform: c.platform,
            platform_video_id: c.platformVideoId,
            title: c.title,
            hook: c.hook,
            format: c.format,
            hypothesis: c.hypothesis,
            posted_at: c.postedAt,
          },
          { onConflict: 'platform,platform_video_id' }
        );
        if (error) fail('content', 'upsert', error.message);
      },
      async all() {
        const { data, error } = await db.from('content').select('*');
        if (error) fail('content', 'select', error.message);
        return (data ?? []).map((r) =>
          ContentRowSchema.parse({
            id: r['id'],
            platform: r['platform'],
            platformVideoId: r['platform_video_id'],
            title: r['title'],
            hook: r['hook'],
            format: r['format'],
            hypothesis: r['hypothesis'],
            postedAt: new Date(String(r['posted_at'])).toISOString(),
          })
        );
      },
    },
    performance: {
      async insert(row) {
        const p = PerformanceRecordSchema.parse(row);
        const { error } = await db.from('performance').insert({
          id: p.id,
          content_id: p.contentId,
          platform: p.platform,
          captured_at: p.capturedAt,
          captured_date: p.capturedDate,
          views: p.metrics.views,
          likes: p.metrics.likes,
          comments: p.metrics.comments,
          shares: p.metrics.shares,
          saves: p.metrics.saves,
          avg_watch_time_seconds: p.metrics.avgWatchTimeSeconds,
          retention_pct: p.metrics.retentionPct,
          followers_at_capture: p.metrics.followersAtCapture,
        });
        if (error) fail('performance', 'insert', error.message);
      },
      async upsert(row) {
        const p = PerformanceRecordSchema.parse(row);
        const { error } = await db.from('performance').upsert(
          {
            id: p.id,
            content_id: p.contentId,
            platform: p.platform,
            captured_at: p.capturedAt,
            captured_date: p.capturedDate,
            views: p.metrics.views,
            likes: p.metrics.likes,
            comments: p.metrics.comments,
            shares: p.metrics.shares,
            saves: p.metrics.saves,
            avg_watch_time_seconds: p.metrics.avgWatchTimeSeconds,
            retention_pct: p.metrics.retentionPct,
            followers_at_capture: p.metrics.followersAtCapture,
          },
          { onConflict: 'content_id,captured_date' }
        );
        if (error) fail('performance', 'upsert', error.message);
      },
      async all() {
        const { data, error } = await db.from('performance').select('*');
        if (error) fail('performance', 'select', error.message);
        return (data ?? []).map((r) =>
          PerformanceRecordSchema.parse({
            id: r['id'],
            contentId: r['content_id'],
            platform: r['platform'],
            capturedAt: new Date(String(r['captured_at'])).toISOString(),
            capturedDate: String(r['captured_date']),
            metrics: {
              views: r['views'],
              likes: r['likes'],
              comments: r['comments'],
              shares: r['shares'],
              saves: r['saves'],
              avgWatchTimeSeconds: r['avg_watch_time_seconds'],
              retentionPct: r['retention_pct'],
              followersAtCapture: r['followers_at_capture'],
            },
          })
        );
      },
    },
    conversations: {
      async insert(row) {
        const c = ConversationRowSchema.parse(row);
        const { error } = await db.from('conversations').insert({
          pseudonym: c.pseudonym,
          archetype: c.archetype,
          objection: c.objection,
          outcome: c.outcome,
          summary: c.summary,
          occurred_at: c.occurredAt,
        });
        if (error) fail('conversations', 'insert', error.message);
      },
      async all() {
        const { data, error } = await db.from('conversations').select('*');
        if (error) fail('conversations', 'select', error.message);
        return (data ?? []).map((r) =>
          ConversationRowSchema.parse({
            id: r['id'],
            pseudonym: r['pseudonym'],
            archetype: r['archetype'],
            objection: r['objection'],
            outcome: r['outcome'],
            summary: r['summary'],
            occurredAt:
              r['occurred_at'] === null
                ? null
                : new Date(String(r['occurred_at'])).toISOString(),
          })
        );
      },
    },
    enrollments: {
      async insert(row) {
        const e = EnrollmentRowSchema.parse(row);
        const { error } = await db.from('enrollments').insert({
          stripe_customer_id: e.stripeCustomerId,
          stripe_checkout_session_id: e.stripeCheckoutSessionId,
          stripe_payment_intent_id: e.stripePaymentIntentId,
          stripe_product_name: e.stripeProductName,
          amount_cents: e.amountCents,
          currency: e.currency,
          status: e.status,
          course_level: e.courseLevel,
          enrolled_at: e.enrolledAt,
        });
        if (error) fail('enrollments', 'insert', error.message);
      },
      async upsert(row) {
        const e = EnrollmentRowSchema.parse(row);
        const { error } = await db.from('enrollments').upsert(
          {
            stripe_customer_id: e.stripeCustomerId,
            stripe_checkout_session_id: e.stripeCheckoutSessionId,
            stripe_payment_intent_id: e.stripePaymentIntentId,
            stripe_product_name: e.stripeProductName,
            amount_cents: e.amountCents,
            currency: e.currency,
            status: e.status,
            course_level: e.courseLevel,
            enrolled_at: e.enrolledAt,
          },
          { onConflict: 'stripe_checkout_session_id' }
        );
        if (error) fail('enrollments', 'upsert', error.message);
      },
      async all() {
        const { data, error } = await db.from('enrollments').select('*');
        if (error) fail('enrollments', 'select', error.message);
        return (data ?? []).map((r) =>
          EnrollmentRowSchema.parse({
            id: r['id'],
            stripeCustomerId: r['stripe_customer_id'],
            stripeCheckoutSessionId: r['stripe_checkout_session_id'],
            stripePaymentIntentId: r['stripe_payment_intent_id'],
            stripeProductName: r['stripe_product_name'],
            amountCents: r['amount_cents'],
            currency: r['currency'],
            status: r['status'],
            courseLevel: r['course_level'],
            enrolledAt: new Date(String(r['enrolled_at'])).toISOString(),
          })
        );
      },
    },
    demoLog: {
      async insert(row) {
        const d = DemoLogRowSchema.parse(row);
        const { error } = await db.from('demo_log').insert({
          pseudonym: d.pseudonym,
          sent_at: d.sentAt,
          channel: d.channel,
          converted: d.converted,
          converted_at: d.convertedAt,
        });
        if (error) fail('demo_log', 'insert', error.message);
      },
      async all() {
        const { data, error } = await db.from('demo_log').select('*');
        if (error) fail('demo_log', 'select', error.message);
        return (data ?? []).map((r) =>
          DemoLogRowSchema.parse({
            id: r['id'],
            pseudonym: r['pseudonym'],
            sentAt: new Date(String(r['sent_at'])).toISOString(),
            channel: r['channel'],
            converted: r['converted'],
            convertedAt:
              r['converted_at'] === null
                ? null
                : new Date(String(r['converted_at'])).toISOString(),
          })
        );
      },
    },
  };
}