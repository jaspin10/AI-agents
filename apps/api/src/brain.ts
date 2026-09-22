import { Hono } from 'hono';
import { z } from 'zod';
import {
  BriefBodySchema, CreativeMemorySchema, ProductionBodySchema, checksPassed, topicOpportunities,
  BrainClaimSchema, diagnoseVideos, type BrainOverview, type BrainLearning, type IdeaEdge,
} from '@platform/shared';
import type { MemoryClient, StudioStore, BrainLineageStore } from '@platform/memory';
import type { StudioEnv } from './studio.js';

export interface BrainDependencies {
  memory: Pick<MemoryClient, 'content' | 'performance' | 'contentAnalysis' | 'suggestions' | 'insightRuns' | 'hypothesisSuggestions'>;
  store: Pick<StudioStore, 'list' | 'revision' | 'allMemories'>; lineage: BrainLineageStore;
  running: () => boolean; now?: () => string;
}
const EdgeSchema = z.object({
  suggestionId: z.string(), suggestionTheme: z.string().nullable(), suggestionStatus: z.string(),
  suggestionHypothesis: z.string().nullable(), suggestionFormat: z.string().nullable(), sourceVideoIds: z.array(z.string()),
  outcomes: z.array(z.object({ contentId: z.string(), platform: z.string(), title: z.string().nullable(),
    engagementRatePct: z.number().nullable(), platformMedianPct: z.number().nullable(),
    verdict: z.enum(['above_median','below_median','unscored']), matchedOn: z.enum(['hypothesis','format']) })),
  matching: z.literal('auto'),
});

export function createBrainRouter(deps: BrainDependencies): Hono<StudioEnv> {
  const app = new Hono<StudioEnv>();
  app.use('*', async (c, next) => {
    const auth = c.get('auth');
    if (!auth) return c.json({ error: 'unauthorized' }, 401);
    if (!['owner','marketing'].includes(auth.role)) return c.json({ error: 'forbidden' }, 403);
    await next();
  });
  const requestId=(value:string)=>{const p=z.uuid().safeParse(value);if(!p.success)throw new Error('invalid_id');return p.data;};
  app.onError((e, c) => c.json({ error: e.message==='invalid_id' ? 'invalid_id' : 'brain_unavailable' }, e.message==='invalid_id' ? 400 : 503));

  app.get('/', async c => {
    const sourceErrors: string[] = [];
    async function read<T>(source: string, operation: () => Promise<T>): Promise<T | null> {
      try { return await operation(); } catch { sourceErrors.push(source); return null; }
    }
    const [content, performance, analyses, suggestions, insight, tags, memories, briefs, production, research, lineage] = await Promise.all([
      read('content', () => deps.memory.content.all()), read('performance', () => deps.memory.performance.all()),
      read('content notes', () => deps.memory.contentAnalysis.all()), read('suggestions', () => deps.memory.suggestions.all()),
      read('insights', () => deps.memory.insightRuns.latest()), read('tag proposals', () => deps.memory.hypothesisSuggestions.all()),
      read('creative memory', () => deps.store.allMemories()), read('briefs', () => deps.store.list('brief')),
      read('production', () => deps.store.list('production')), read('audience', () => deps.store.list('research')),
      read('confirmed lineage', () => deps.lineage.recent()),
    ]);
    const parsedMemories = (memories ?? []).flatMap(record => {
      const p = CreativeMemorySchema.safeParse(record.body);
      if (!p.success) { sourceErrors.push('invalid creative memory record'); return []; }
      return [{ record, body: p.data }];
    });
    const parsedBriefs = (briefs ?? []).flatMap(record => {
      const p = BriefBodySchema.safeParse(record.body);
      if (!p.success) { sourceErrors.push('invalid brief record'); return []; }
      return [{ record, body: p.data }];
    });
    const parsedProduction = (production ?? []).flatMap(record => {
      const p = ProductionBodySchema.safeParse(record.body);
      if (!p.success) { sourceErrors.push('invalid production record'); return []; }
      return [{ record, body: p.data }];
    });
    const generatedAt = deps.now?.() ?? new Date().toISOString();
    const learnings: BrainLearning[] = [];
    const report = insight?.report;
    for (const platform of Array.isArray(report?.['perPlatform']) ? report['perPlatform'] : []) {
      for (const raw of Array.isArray(platform?.claims) ? platform.claims : []) {
        const p = BrainClaimSchema.safeParse(raw);
        if (p.success && insight) learnings.push({ ...p.data, runId: insight.id, recordedAt: insight.createdAt });
        else sourceErrors.push('invalid stored pattern');
      }
    }
    const inferredEdges: IdeaEdge[] = [];
    for (const raw of Array.isArray(report?.['edges']) ? report['edges'] : []) {
      const p = EdgeSchema.safeParse(raw);
      if (p.success) inferredEdges.push(p.data);
      else sourceErrors.push('invalid inferred edge');
    }
    const enrichedLineage = lineage ? [] as NonNullable<BrainOverview['lineage']> : null;
    // Bounded batches avoid flooding storage. A changed brief cannot rewrite an old idea's lineage.
    for (let i=0; i<(lineage?.length??0); i+=10) {
      const batch = await Promise.all(lineage!.slice(i,i+10).map(async link => {
        const current = parsedBriefs.find(b=>b.record.id===link.brief_id&&b.record.version===link.brief_version);
        const revision = current ? current.body : await read('historical brief context', async()=>{
          const historical=await deps.store.revision('brief',link.brief_id,link.brief_version);
          return historical ? BriefBodySchema.parse(historical.body) : null;
        });
        return {...link,suggestionId:revision?.input.suggestionId??null};
      }));
      enrichedLineage!.push(...batch);
    }
    const payload: BrainOverview = {
      generatedAt, sourceErrors: [...new Set(sourceErrors)].sort(), studioLimit: 500,
      videos: content && performance && analyses && memories && !sourceErrors.includes('invalid creative memory record') ? diagnoseVideos({ content, performance, analyses, peerLimit:0, today: generatedAt.slice(0,10), memories: new Map(parsedMemories.map(m => [m.record.id, m.body])) }) : null,
      suggestions: suggestions?.flatMap(s => s.payload.kind !== 'next_video' ? [] : [{ id: s.id, theme: s.payload.theme, hypothesis: s.hypothesis, status: s.status, createdAt: s.createdAt,
        evidenceIds: s.payload.evidenceContentIds ?? [], evidenceMode: s.payload.evidenceMode ?? 'historical unverified' }]) ?? null,
      briefs: briefs ? parsedBriefs.map(({record:r,body:b}) => ({ id:r.id,version:r.version,topic:b.input.topic,platform:b.input.platform,suggestionId:b.input.suggestionId,exampleIds:b.input.exampleIds,approved:b.approval?.version===r.version,readyForReview:!!b.draft&&checksPassed(b.draftChecks),draft:!!b.draft,updatedAt:r.updatedAt })) : null,
      production: production ? parsedProduction.map(({record:r,body:b}) => ({ id:r.id,briefId:b.briefId,briefVersion:b.briefVersion,topic:parsedBriefs.find(x=>x.record.id===b.briefId)?.body.input.topic??'Brief '+b.briefId.slice(0,8),stage:b.stage,owner:b.owner,dueDate:b.dueDate,blockers:b.blockers,openRequests:b.requests.filter(q=>q.status==='open').length,updatedAt:r.updatedAt })) : null,
      memories: memories ? parsedMemories.sort((a,b)=>b.record.updatedAt.localeCompare(a.record.updatedAt)).map(({record:r,body:b}) => ({id:r.id,version:r.version,title:content?.find(v=>v.id===r.id)?.title??'Untitled video',topic:b.topic,reviewed:b.annotations.filter(a=>a.review==='reviewed').length,draft:b.annotations.filter(a=>a.review==='draft').length,updatedAt:r.updatedAt,assetVersion:b.asset?.version??null})) : null,
      topics: research ? topicOpportunities(research) : null,
      researchCount: research?.filter(r=>r.body['archived']!==true).length ?? null,
      learnings: sourceErrors.includes('insights') ? null : learnings, lineage: enrichedLineage,
      insight: insight ? {id:insight.id,createdAt:insight.createdAt,status:insight.status,running:deps.running(),caution:Array.isArray(report?.['caution'])?report['caution'].filter((s):s is string=>typeof s==='string'):[]} : null,
      inferredEdges, pendingTags: tags?.filter(t=>t.status==='suggested').length ?? null,
    };
    return c.json(payload);
  });

  app.get('/video/:id', async c => {
    const id=requestId(c.req.param('id'));
    const content=await deps.memory.content.all();
    if(!content.some(v=>v.id===id))return c.json({error:'content_not_found'},404);
    const [performance,analyses,memories]=await Promise.all([deps.memory.performance.all(),deps.memory.contentAnalysis.all(),deps.store.allMemories()]);
    // Only the selected result carries peer citations. Classification still uses the full cohort.
    return c.json(diagnoseVideos({content,performance,analyses,focusId:id,peerLimit:60,today:(deps.now?.()??new Date().toISOString()).slice(0,10),memories:new Map(memories.map(r=>[r.id,CreativeMemorySchema.parse(r.body)]))})[0]);
  });

  app.get('/journey/:id', async c => {
    const id = requestId(c.req.param('id'));
    const content = (await deps.memory.content.all()).find(v=>v.id===id);
    if (!content) return c.json({error:'content_not_found'},404);
    const links = await deps.lineage.forContent(id);
    const suggestions = await deps.memory.suggestions.all();
    const confirmed = await Promise.all(links.map(async link => {
      // Always dereference the confirmed historical revision, never today's edited brief.
      const revision = await deps.store.revision('brief',link.brief_id,link.brief_version);
      const parsed = BriefBodySchema.safeParse(revision?.body);
      const brief = parsed.success ? parsed.data : null;
      const s = brief ? suggestions.find(s=>s.id===brief.input.suggestionId) : null;
      return { link, brief: brief ? {topic:brief.input.topic,researchIds:brief.input.researchIds,exampleIds:brief.input.exampleIds,selectedHook:brief.hooks.find(h=>h.id===brief.selectedHookId)?.text??null,learningOutcome:brief.input.learningOutcome,approval:brief.approval} : null,
        suggestion:s?.payload.kind==='next_video'?{id:s.id,theme:s.payload.theme,hypothesis:s.hypothesis}:null };
    }));
    return c.json({contentId:id,confirmed,notice:'Confirmed means a human declared this exact export and brief revision. It is not machine-verified asset identity. Historical automatic matching and cross-platform twins remain separate.'});
  });
  return app;
}
