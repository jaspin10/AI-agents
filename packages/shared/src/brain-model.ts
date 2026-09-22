import type { ConfirmedBrainLineage } from './brain-schemas.js';
export type { ConfirmedBrainLineage } from './brain-schemas.js';
import type { BrainVideo } from './brain-diagnosis.js';
import type { Claim, IdeaEdge } from './correlation.js';
import type { ProductionBody } from './production.js';

export const BRAIN_STAGE_IDS = ['strategy','audience','creative','production','results','learning'] as const;
export const BRAIN_CONNECTIONS = BRAIN_STAGE_IDS.map((from,i)=>({from,to:BRAIN_STAGE_IDS[(i+1)%BRAIN_STAGE_IDS.length]!}));

export const BRAIN_VIEWS = ['brain', 'audience', 'suggestions', 'idea-map', 'briefs', 'production', 'performance', 'analysis', 'metrics', 'learnings', 'insights', 'kpis', 'run-log'] as const;
export type BrainView = typeof BRAIN_VIEWS[number];
export interface BrainTarget { view: BrainView; id?: string; filter?: string; example?: string; idea?: string }
export function brainHref(target: BrainTarget): string {
  const q = new URLSearchParams();
  if (target.id) q.set('id', target.id);
  if (target.filter) q.set('filter', target.filter);
  if (target.example) q.set('example', target.example);
  if (target.idea) q.set('idea', target.idea);
  return '/analytics/' + target.view + (q.size ? '?' + q.toString() : '');
}
export function allowedBrainView(view: BrainView, role: string): boolean {
  return role === 'owner' || role === 'marketing' && view !== 'kpis' && view !== 'run-log';
}
export const PRODUCTION_LABELS: Record<ProductionBody['stage'], string> = {
  selected: 'Selected', brief_approved: 'Ready to film', filmed: 'Filmed',
  edit_review: 'Edit review', approved: 'Export approved', posted: 'Posted', reviewed: 'Reviewed',
};
export interface BrainBrief {
  id: string; version: number; topic: string; platform: string; suggestionId: string | null;
  exampleIds: string[]; approved: boolean; readyForReview: boolean; draft: boolean; updatedAt: string;
}
export interface BrainProduction {
  id: string; briefId: string; briefVersion: number; topic: string; stage: ProductionBody['stage'];
  owner: string; dueDate: string | null; blockers: string[]; openRequests: number; updatedAt: string;
}
export interface BrainSuggestion {
  id: string; theme: string; hypothesis: string | null; status: 'surfaced' | 'posted' | 'skipped' | 'rejected';
  createdAt: string; evidenceIds: string[]; evidenceMode: string;
}
export interface BrainLearning extends Claim { runId: string; recordedAt: string }
export interface BrainMemory {
  id: string; version: number; title: string; topic: string; reviewed: number; draft: number;
  updatedAt: string; assetVersion: string | null;
}
export interface BrainTopic { theme: string; evidenceIds: string[]; verifiedOccurrences: number; mode: string; reasons: string[] }
export interface BrainOverview {
  generatedAt: string; sourceErrors: string[]; studioLimit: number;
  videos: BrainVideo[] | null; suggestions: BrainSuggestion[] | null; briefs: BrainBrief[] | null;
  production: BrainProduction[] | null; memories: BrainMemory[] | null; topics: BrainTopic[] | null;
  researchCount: number | null; learnings: BrainLearning[] | null; lineage: ConfirmedBrainLineage[] | null;
  insight: { id: string; createdAt: string; status: string; running: boolean; caution: string[] } | null;
  inferredEdges: IdeaEdge[]; pendingTags: number | null;
}
export interface BrainAttention { key: string; title: string; detail: string; tone: 'review' | 'blocked' | 'data'; target: BrainTarget }
export function brainAttention(data: BrainOverview, today: string): BrainAttention[] {
  const items: BrainAttention[] = [];
  for (const p of data.production ?? []) {
    if (p.blockers.length) items.push({ key: 'block-' + p.id, title: p.topic, detail: p.blockers.length + ' production blocker(s)', tone: 'blocked', target: { view: 'production', id: p.id } });
    else if (p.stage === 'edit_review') items.push({ key: 'review-' + p.id, title: p.topic, detail: p.openRequests ? p.openRequests + ' open revision request(s)' : 'Export waiting for owner review', tone: 'review', target: { view: 'production', id: p.id } });
    else if (p.dueDate && p.dueDate < today && !['posted','reviewed'].includes(p.stage)) items.push({ key: 'due-' + p.id, title: p.topic, detail: 'Due ' + p.dueDate + ' · ' + PRODUCTION_LABELS[p.stage], tone: 'blocked', target: { view: 'production', id: p.id } });
  }
  for (const b of data.briefs ?? []) if (b.readyForReview && !b.approved) items.push({ key: 'brief-' + b.id, title: b.topic, detail: 'Brief v' + b.version + ' · checks passed, owner approval needed', tone: 'review', target: { view: 'briefs', id: b.id } });
  for (const v of (data.videos ?? []).filter(v => v.outcome === 'below').slice(0, 8)) items.push({ key: 'video-' + v.id, title: v.title ?? 'Untitled video', detail: v.platform + ' · day ' + v.comparison.day + ' engagement below comparable baseline', tone: 'data', target: { view: 'performance', id: v.id } });
  if (data.pendingTags) items.push({ key: 'tags', title: data.pendingTags + ' hypothesis tags to review', detail: 'Proposals only; approval writes the tag.', tone: 'review', target: { view: 'insights', filter: 'tags' } });
  const missing = data.videos?.filter(v => !v.analysed).length;
  if (missing) items.push({ key: 'notes', title: missing + ' videos need context', detail: 'Describe the hook, format and ad status.', tone: 'data', target: { view: 'analysis', filter: 'todo' } });
  return items;
}

/** Lifecycle is an overlay, never a new database state or a promotion of inferred links. */
export function brainIdeaLifecycle(id: string, data: Pick<BrainOverview, 'briefs' | 'production' | 'lineage' | 'learnings' | 'suggestions' | 'inferredEdges'>): string {
  const suggestion = data.suggestions?.find(s => s.id === id);
  if (suggestion?.status === 'rejected') return 'Rejected by checks';
  if (suggestion?.status === 'skipped') return 'Skipped';
  const briefs = data.briefs?.filter(b => b.suggestionId === id) ?? [];
  const links = data.lineage?.filter(l => l.suggestionId === id) ?? [];
  if (links.length) return 'Published · evaluate results';
  if (data.production?.some(p => briefs.some(b => b.id === p.briefId))) return 'In production';
  if (briefs.length) return 'Brief in progress';
  if (data.inferredEdges.some(e => e.suggestionId === id && e.outcomes.length)) return 'Inferred outcome · unconfirmed';
  if (suggestion?.status === 'posted') return 'Marked posted · lineage unknown';
  return 'Untested';
}

export interface BrainAgentDefinition {
  id: string; name: string; purpose: string; inputs: string[]; outputs: string[];
  allowedActions: string[]; humanApproval: string; upstream: string[]; downstream: string[];
}
/** Existing processes only. A definition describes capability, never live execution. */
export const BRAIN_AGENTS: readonly BrainAgentDefinition[] = [
  { id: 'analyst', name: 'Suggestion analyst', purpose: 'Propose the next useful video.',
    inputs: ['Brand constitution','Content notes','Platform snapshots','Stored insights'], outputs: ['Checked suggestions','Evidence references'],
    allowedActions: ['Read authorized evidence','Generate and check suggestions'], humanApproval: 'A human chooses an idea and approves its brief.',
    upstream: ['audience','results','learnings'], downstream: ['creative'] },
  { id: 'insights', name: 'Pattern analyst', purpose: 'Explain deterministic, platform-specific patterns.',
    inputs: ['X1 descriptions','X2 engagement rates','Cross-platform twins'], outputs: ['Stored X6 report','Tag proposals'],
    allowedActions: ['Calculate patterns','Word the supplied numbers','Propose tags'], humanApproval: 'Tags are written only after a human approves.',
    upstream: ['results'], downstream: ['learnings','creative'] },
  { id: 'brief', name: 'Brief drafting workflow', purpose: 'Develop a human-selected idea into a teaching brief.',
    inputs: ['Chosen topic','Audience evidence','Selected hook','Dated factual sources'], outputs: ['Versioned hooks','Script and production instructions','Checks'],
    allowedActions: ['Generate on human request','Run required checks'], humanApproval: 'Owner approves the exact brief revision and export.',
    upstream: ['audience','creative'], downstream: ['production'] },
];
