import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  BrandAssetChunkSchema,
  ContentRowSchema,
  ConversationRowSchema,
  DemoLogRowSchema,
  EnrollmentRowSchema,
  PerformanceRecordSchema,
  SuggestionRowSchema,
  type BrandAssetChunk,
  type ContentRow,
  type ConversationRow,
  type DemoLogRow,
  type EnrollmentRow,
  type PerformanceRecord,
  type SuggestionRow,
} from '@platform/shared';
import type { SupabaseConfig } from './config.js';

/**
 * X1 (docs/spec/x-series.md): one manual analysis per content row.
 * Every classification field is plain text by design — see migration 0005.
 * adBoosted is tri-state (migration 0006): true / false / null ("don't know").
 */
export interface ContentAnalysisRow {
  contentId: string;
  description: string | null;
  hookText: string | null;
  format: string | null;
  hasModel: boolean | null;
  hasCta: boolean | null;
  ctaType: string | null;
  adBoosted: boolean | null;
  adStartDate: string | null;
  adEndDate: string | null;
  adSpendCents: number | null;
  ideaSource: string | null;
  analysedBy: string;
  analysedAt: string;
}

/**
 * X1 follow-up (migration 0006, locked 2026-09-10): a video can have
 * equivalent twins on more than one other platform at once (e.g. a YouTube
 * twin AND an Instagram twin once X9 lands), so pairing is a join table, not
 * a single column. Rows are written in both directions on save (see
 * contentAnalysisRefs.set), so either side of a pair shows the other without
 * needing to be re-entered.
 */
export interface RefPair {
  contentId: string;
  refContentId: string;
}

/**
 * Typed read/write helpers for the §3 memory tables. Insert helpers validate
 * with Zod before writing; read helpers validate after reading.
 * M4 adds: brandAssets.updateEmbeddings + search (pgvector via match_brand_assets),
 * and the suggestions table (migration 0003).
 * M5 adds: suggestions.updateStatus (feedback write path), tokens (rotating
 * OAuth store, migration 0004), llmUsage (§6 monthly spend cap, migration 0004).
 * X1 adds: contentAnalysis (migration 0005) and content.setTags — the only
 * path that ever fills content.hook / .format / .hypothesis.
 * X1 follow-up adds: contentAnalysisRefs (migration 0006) — multiple
 * cross-platform pairs per video, replacing the single cross_platform_ref column.
 */
export interface MemoryClient {
  brandAssets: {
    upsertChunks: (chunks: BrandAssetChunk[]) => Promise<number>;
    allChunks: (source?: string) => Promise<BrandAssetChunk[]>;
    deleteBySourceVersion: (source: string, version: string) => Promise<void>;
    /** M4: write embeddings back onto existing chunks, keyed by chunk id. */
    updateEmbeddings: (updates: Array<{ id: string; embedding: number[] }>) => Promise<void>;
    /** M4: pgvector similarity search over embedded chunks. */
    search: (queryEmbedding: number[], matchCount?: number) => Promise<Array<BrandAssetChunk & { similarity: number }>>;
  };
  content: {
    insert: (row: ContentRow) => Promise<void>;
    upsert: (row: ContentRow) => Promise<void>;
    all: () => Promise<ContentRow[]>;
    /** X1: look a video up by its platform-native id (any platform). Null when absent. */
    findByPlatformVideoId: (platformVideoId: string) => Promise<ContentRow | null>;
    /** X1: write the derived tags onto a content row. The only writer of these columns. */
    setTags: (id: string, tags: { hook: string | null; format: string | null; hypothesis: string | null }) => Promise<void>;
  };
  contentAnalysis: {
    all: () => Promise<ContentAnalysisRow[]>;
    upsert: (row: ContentAnalysisRow) => Promise<void>;
    /** Distinct non-null idea_source values already saved — feeds the quick-pick chips. */
    distinctIdeaSources: () => Promise<string[]>;
  };
  contentAnalysisRefs: {
    /** Every stored pair, both directions (mirrors are written on save). */
    all: () => Promise<RefPair[]>;
    /**
     * Fully replace this content's outgoing pairs and their mirrors. A video
     * can have 0..N refs at once (one per other platform, typically). Stale
     * mirrors from refs that were removed are cleaned up; mirrors owned by
     * other videos' own saves are left untouched.
     */
    set: (contentId: string, refContentIds: string[]) => Promise<void>;
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
  suggestions: {
    insert: (row: SuggestionRow) => Promise<void>;
    all: () => Promise<SuggestionRow[]>;
    /** M5 feedback write path: flip surfaced → posted | skipped. */
    updateStatus: (id: string, status: 'posted' | 'skipped') => Promise<void>;
  };
  tokens: {
    /** Rotating OAuth token store (TikTok). Null when no row exists yet. */
    get: (provider: string) => Promise<string | null>;
    set: (provider: string, refreshToken: string) => Promise<void>;
  };
  llmUsage: {
    record: (row: { runId: string; agent: string; model: string; inputTokens: number; outputTokens: number }) => Promise<void>;
    /** Total tokens (input+output) for a 'YYYY-MM' UTC month — the §6 cap query. */
    monthlyTotal: (month: string) => Promise<number>;
  };
}

function fail(table: string, op: string, message: string): never {
  throw new Error(`Supabase ${table} ${op} failed: ${message}`);
}

function parseContentRow(r: Record<string, unknown>): ContentRow {
  return ContentRowSchema.parse({
    id: r['id'],
    platform: r['platform'],
    platformVideoId: r['platform_video_id'],
    title: r['title'],
    hook: r['hook'],
    format: r['format'],
    hypothesis: r['hypothesis'],
    postedAt: new Date(String(r['posted_at'])).toISOString(),
  });
}

function parseContentAnalysisRow(r: Record<string, unknown>): ContentAnalysisRow {
  const text = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
  const bool = (v: unknown): boolean | null => (v === null || v === undefined ? null : Boolean(v));
  return {
    contentId: String(r['content_id']),
    description: text(r['description']),
    hookText: text(r['hook_text']),
    format: text(r['format']),
    hasModel: bool(r['has_model']),
    hasCta: bool(r['has_cta']),
    ctaType: text(r['cta_type']),
    adBoosted: bool(r['ad_boosted']),
    adStartDate: text(r['ad_start_date']),
    adEndDate: text(r['ad_end_date']),
    adSpendCents: r['ad_spend_cents'] === null || r['ad_spend_cents'] === undefined ? null : Number(r['ad_spend_cents']),
    ideaSource: text(r['idea_source']),
    analysedBy: String(r['analysed_by']),
    analysedAt: new Date(String(r['analysed_at'])).toISOString(),
  };
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
      async updateEmbeddings(updates) {
        for (const u of updates) {
          const { error } = await db
            .from('brand_assets')
            .update({ embedding: u.embedding })
            .eq('id', u.id);
          if (error) fail('brand_assets', 'update embedding', error.message);
        }
      },
      async search(queryEmbedding, matchCount = 3) {
        const { data, error } = await db.rpc('match_brand_assets', {
          query_embedding: queryEmbedding,
          match_count: matchCount,
        });
        if (error) fail('brand_assets', 'search', error.message);
        return (data ?? []).map((r: Record<string, unknown>) => ({
          ...BrandAssetChunkSchema.parse({
            id: r['id'],
            source: r['source'],
            version: r['version'],
            chunkIndex: r['chunk_index'],
            heading: r['heading'],
            content: r['content'],
            // Shim: match_brand_assets does not return ingested_at; harmless for retrieval.
            ingestedAt: new Date().toISOString(),
          }),
          similarity: Number(r['similarity']),
        }));
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
        return (data ?? []).map((r) => parseContentRow(r));
      },
      async findByPlatformVideoId(platformVideoId) {
        const { data, error } = await db
          .from('content')
          .select('*')
          .eq('platform_video_id', platformVideoId)
          .limit(1)
          .maybeSingle();
        if (error) fail('content', 'select by platform_video_id', error.message);
        return data === null ? null : parseContentRow(data);
      },
      async setTags(id, tags) {
        const { error } = await db
          .from('content')
          .update({ hook: tags.hook, format: tags.format, hypothesis: tags.hypothesis })
          .eq('id', id);
        if (error) fail('content', 'set tags', error.message);
      },
    },
    contentAnalysis: {
      async all() {
        const { data, error } = await db.from('content_analysis').select('*');
        if (error) fail('content_analysis', 'select', error.message);
        return (data ?? []).map((r) => parseContentAnalysisRow(r));
      },
      async upsert(row) {
        const { error } = await db.from('content_analysis').upsert(
          {
            content_id: row.contentId,
            description: row.description,
            hook_text: row.hookText,
            format: row.format,
            has_model: row.hasModel,
            has_cta: row.hasCta,
            cta_type: row.ctaType,
            ad_boosted: row.adBoosted,
            ad_start_date: row.adStartDate,
            ad_end_date: row.adEndDate,
            ad_spend_cents: row.adSpendCents,
            idea_source: row.ideaSource,
            analysed_by: row.analysedBy,
            analysed_at: row.analysedAt,
          },
          { onConflict: 'content_id' }
        );
        if (error) fail('content_analysis', 'upsert', error.message);
      },
      async distinctIdeaSources() {
        const { data, error } = await db
          .from('content_analysis')
          .select('idea_source')
          .not('idea_source', 'is', null);
        if (error) fail('content_analysis', 'select idea_source', error.message);
        const seen = new Set<string>();
        for (const r of data ?? []) {
          const v = r['idea_source'];
          if (typeof v === 'string' && v.trim() !== '') seen.add(v);
        }
        return [...seen].sort((a, b) => a.localeCompare(b));
      },
    },
    contentAnalysisRefs: {
      async all() {
        const { data, error } = await db.from('content_analysis_refs').select('content_id, ref_content_id');
        if (error) fail('content_analysis_refs', 'select', error.message);
        return (data ?? []).map((r) => ({ contentId: String(r['content_id']), refContentId: String(r['ref_content_id']) }));
      },
      async set(contentId, refContentIds) {
        // Read the current outgoing set first so we can clean up mirrors that
        // are no longer wanted (e.g. a ref removed in this edit).
        const { data: existing, error: selErr } = await db
          .from('content_analysis_refs')
          .select('ref_content_id')
          .eq('content_id', contentId);
        if (selErr) fail('content_analysis_refs', 'select existing', selErr.message);
        const oldRefs = (existing ?? []).map((r) => String(r['ref_content_id']));

        const { error: delFwdErr } = await db.from('content_analysis_refs').delete().eq('content_id', contentId);
        if (delFwdErr) fail('content_analysis_refs', 'delete forward', delFwdErr.message);

        if (oldRefs.length > 0) {
          const { error: delMirrorErr } = await db
            .from('content_analysis_refs')
            .delete()
            .eq('ref_content_id', contentId)
            .in('content_id', oldRefs);
          if (delMirrorErr) fail('content_analysis_refs', 'delete stale mirrors', delMirrorErr.message);
        }

        if (refContentIds.length === 0) return;
        const forward = refContentIds.map((refId) => ({ content_id: contentId, ref_content_id: refId }));
        const mirror = refContentIds.map((refId) => ({ content_id: refId, ref_content_id: contentId }));
        const { error: insErr } = await db
          .from('content_analysis_refs')
          .upsert([...forward, ...mirror], { onConflict: 'content_id,ref_content_id', ignoreDuplicates: true });
        if (insErr) fail('content_analysis_refs', 'insert', insErr.message);
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
    suggestions: {
      async insert(row) {
        const s = SuggestionRowSchema.parse(row);
        const { error } = await db.from('suggestions').insert({
          id: s.id,
          run_id: s.runId,
          task_id: s.taskId,
          agent: s.agent,
          kind: s.kind,
          payload: s.payload,
          hypothesis: s.hypothesis,
          banned_topics_passed: s.bannedTopicsPassed,
          banned_topics_reasons: s.bannedTopicsReasons,
          brand_voice_passed: s.brandVoicePassed,
          brand_voice_reasons: s.brandVoiceReasons,
          status: s.status,
          created_at: s.createdAt,
        });
        if (error) fail('suggestions', 'insert', error.message);
      },
      async all() {
        const { data, error } = await db.from('suggestions').select('*');
        if (error) fail('suggestions', 'select', error.message);
        return (data ?? []).map((r) =>
          SuggestionRowSchema.parse({
            id: r['id'],
            runId: r['run_id'],
            taskId: r['task_id'],
            agent: r['agent'],
            kind: r['kind'],
            payload: r['payload'],
            hypothesis: r['hypothesis'],
            bannedTopicsPassed: r['banned_topics_passed'],
            bannedTopicsReasons: r['banned_topics_reasons'],
            brandVoicePassed: r['brand_voice_passed'],
            brandVoiceReasons: r['brand_voice_reasons'],
            status: r['status'],
            createdAt: new Date(String(r['created_at'])).toISOString(),
          })
        );
      },
      async updateStatus(id, status) {
        const { error } = await db
          .from('suggestions')
          .update({ status })
          .eq('id', id);
        if (error) fail('suggestions', 'update status', error.message);
      },
    },
    tokens: {
      async get(provider) {
        const { data, error } = await db
          .from('tokens')
          .select('refresh_token')
          .eq('provider', provider)
          .maybeSingle();
        if (error) fail('tokens', 'select', error.message);
        return data === null ? null : String(data['refresh_token']);
      },
      async set(provider, refreshToken) {
        const { error } = await db.from('tokens').upsert(
          {
            provider,
            refresh_token: refreshToken,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'provider' }
        );
        if (error) fail('tokens', 'set', error.message);
      },
    },
    llmUsage: {
      async record(row) {
        const { error } = await db.from('llm_usage').insert({
          run_id: row.runId,
          agent: row.agent,
          model: row.model,
          input_tokens: row.inputTokens,
          output_tokens: row.outputTokens,
          month: new Date().toISOString().slice(0, 7),
        });
        if (error) fail('llm_usage', 'insert', error.message);
      },
      async monthlyTotal(month) {
        const { data, error } = await db
          .from('llm_usage')
          .select('input_tokens, output_tokens')
          .eq('month', month);
        if (error) fail('llm_usage', 'select', error.message);
        return (data ?? []).reduce(
          (sum, r) => sum + Number(r['input_tokens']) + Number(r['output_tokens']),
          0
        );
      },
    },
  };
}
