export interface SuggestionRow {
  id: string;
  runId: string;
  taskId: string;
  agent: string;
  kind: string;
  payload: {
    theme?: string;
    hook?: string;
    format?: string;
    rationale?: string;
  };
  hypothesis: string | null;
  bannedTopicsPassed: boolean;
  bannedTopicsReasons: string[];
  brandVoicePassed: boolean;
  brandVoiceReasons: string[];
  status: 'surfaced' | 'rejected' | 'posted' | 'skipped';
  createdAt: string;
}

export interface MonthlyKpis {
  month: string;
  enrollments: number;
  revenueCents: number;
  taggedVideos: number;
  videosPosted: number;
  suggestions: { surfaced: number; rejected: number; posted: number; skipped: number };
}

/** X0: who the API thinks we are, from the session cookie. Drives which panels render. */
export type DashRole = 'owner' | 'marketing';
export interface Me {
  role: DashRole;
  email: string;
}

/**
 * X0: the API authenticates every call with its httpOnly session cookie, set
 * by /auth/handoff after the portal hands us a token. A 401 means the cookie
 * is gone or expired — reload "/" and the server bounces us to the portal,
 * where one click on Analytics brings us back. There is no login screen here.
 */
function bounceToPortal(): never {
  window.location.assign('/');
  throw new Error('Session expired — reopening from the portal.');
}

export async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (response.status === 401) bounceToPortal();
  if (response.status === 403) throw new Error('Your portal role cannot open this.');
  if (!response.ok) throw new Error(`${path} → ${response.status}`);
  return (await response.json()) as T;
}

/** JSON write with the same 401/403 handling. Returns the parsed body; throws with the server's error code on 4xx. */
export async function sendJson<T>(method: 'PUT' | 'POST', path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (response.status === 401) bounceToPortal();
  if (response.status === 403) throw new Error('Your portal role cannot do this.');
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `${path} → ${response.status}`);
  }
  return (await response.json()) as T;
}

export function getMe(): Promise<Me> {
  return getJson<Me>('/api/me');
}

/** Feedback write path: flips a suggestion to posted/skipped. Auth = session cookie + role (X0). */
export async function setSuggestionStatus(
  id: string,
  status: 'posted' | 'skipped'
): Promise<void> {
  await sendJson<{ ok: true }>('POST', `/api/suggestions/${id}/status`, { status });
}

export interface ContentRow {
  id?: string;
  platform: string;
  platformVideoId: string;
  title: string | null;
  hypothesis: string | null;
  postedAt: string;
}

export interface PerformanceRecord {
  id: string;
  /** Platform-native video id (the upsert key). Join on contentUuid, not this. */
  contentId: string;
  /** X2 (migration 0009): real FK to content.id, filled by DB trigger. */
  contentUuid?: string | null;
  platform: string;
  capturedAt: string;
  capturedDate: string;
  metrics: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number | null;
    avgWatchTimeSeconds: number | null;
    retentionPct: number | null;
    followersAtCapture: number | null;
  };
}

/* ---------------- X1 — content analysis ---------------- */

export interface ContentAnalysis {
  contentId: string;
  description: string | null;
  hookText: string | null;
  format: string | null;
  hasModel: boolean | null;
  hasCta: boolean | null;
  ctaType: string | null;
  /** Tri-state (locked 2026-09-10): true boosted / false not boosted / null don't know. */
  adBoosted: boolean | null;
  ideaSource: string | null;
  analysedBy: string;
  analysedAt: string;
}

/** A paired video shown inline (no postedAt — that only comes from the ref-lookup echo). */
export interface PairedVideoRef {
  id: string;
  platform: string;
  platformVideoId: string;
  title: string | null;
}

/**
 * One ad campaign run against a video (locked 2026-09-10: a video can have
 * more than one run over its life, e.g. re-boosted months apart). No total —
 * per-run spend only; a combined figure is computed at report time (X5).
 */
export interface AdRun {
  id: string;
  contentId: string;
  startDate: string | null;
  endDate: string | null;
  spendCents: number | null;
}

export interface AnalysisVideo {
  id: string;
  platform: string;
  platformVideoId: string;
  title: string | null;
  postedAt: string;
  /** Latest snapshot, or null when the sync has not captured this video yet. */
  metrics: (PerformanceRecord['metrics'] & { capturedDate: string }) | null;
  analysis: ContentAnalysis | null;
  adRuns: AdRun[];
  /** 0..N equivalent videos on other platforms (locked 2026-09-10: more than one at once, e.g. YouTube + Instagram twins). */
  crossPlatformRefVideos: PairedVideoRef[];
}

export interface AnalysisPayload {
  videos: AnalysisVideo[];
  /** Seeded chips ∪ every idea_source already saved. */
  ideaSources: string[];
}

export interface AdRunBody {
  startDate: string | null;
  endDate: string | null;
  spendCents: number | null;
}

export interface AnalysisBody {
  description: string | null;
  hookText: string | null;
  format: string | null;
  hasModel: boolean | null;
  hasCta: boolean | null;
  ctaType: string | null;
  adBoosted: boolean | null;
  adRuns: AdRunBody[];
  crossPlatformVideoIds: string[];
  ideaSource: string | null;
}

export function getAnalysis(): Promise<AnalysisPayload> {
  return getJson<AnalysisPayload>('/api/analysis');
}

export interface RefEcho {
  id: string;
  platform: string;
  platformVideoId: string;
  title: string | null;
  postedAt: string;
}

export async function lookupRef(platformVideoId: string): Promise<RefEcho | null> {
  const response = await fetch(`/api/analysis/ref/${encodeURIComponent(platformVideoId)}`);
  if (response.status === 401) bounceToPortal();
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`ref lookup → ${response.status}`);
  return (await response.json()) as RefEcho;
}

export function saveAnalysis(
  contentId: string,
  body: AnalysisBody
): Promise<{ ok: true; analysis: ContentAnalysis; refs: PairedVideoRef[]; adRuns: AdRun[] }> {
  return sendJson('PUT', `/api/analysis/${contentId}`, body);
}

/* ---------------- X2 — derived metrics ---------------- */

export interface Rates {
  commentRatePct: number | null;
  shareRatePct: number | null;
  engagementRatePct: number | null;
}

export type VelocitySlot =
  | { status: 'exact'; views: number; day: number }
  | { status: 'approx'; views: number; day: number }
  | { status: 'too_new' }
  | { status: 'no_snapshot' };

export interface MetricsVideo {
  id: string;
  platform: string;
  platformVideoId: string;
  title: string | null;
  postedAt: string;
  snapshotCount: number;
  latestCapturedDate: string | null;
  views: number | null;
  rates: Rates | null;
  velocity: { day1: VelocitySlot; day7: VelocitySlot; day30: VelocitySlot };
  followerNormalised: { viewsPerFollower: number | null; followersFromDate: string | null; followers: number | null };
  /** TIME split by ad-run dates — never paid/organic. `label` says so and must be rendered with the numbers. */
  adSplit: {
    label: string;
    insideAdWindows: number;
    outsideAdWindows: number;
    unattributedBeforeFirstSnapshot: number;
    runsUsed: number;
    runsIgnoredNoStart: number;
    computable: boolean;
  };
  /** 0..N twins on other platforms. */
  twinIds: string[];
}

export interface MetricsPayload {
  today: string;
  adSplitLabel: string;
  videos: MetricsVideo[];
}

export function getMetrics(): Promise<MetricsPayload> {
  return getJson<MetricsPayload>('/api/metrics');
}

/* ---------------- X6 — insights ---------------- */

export interface InsightClaim {
  platform: string;
  dimension: 'format' | 'idea_source' | 'cta_type' | 'has_model' | 'hypothesis';
  value: string;
  n: number;
  medianEngagementPct: number;
  platformMedianPct: number;
  relativeDelta: number;
  direction: 'works' | 'doesnt' | 'neutral';
  strength: 'pooled';
  evidence: { videoIds: string[]; adBoostedCount: number; adUnknownCount: number };
}

export interface InsightPlatformReport {
  platform: string;
  analysedVideos: number;
  scoredVideos: number;
  platformMedianPct: number | null;
  enoughData: boolean;
  claims: InsightClaim[];
  skipped: Array<{ platform: string; dimension: string; value: string; n: number; reason: string }>;
}

export interface InsightPair {
  strength: 'pair';
  heldConstant: { format: string | null; ideaSource: string | null; hypothesis: string | null };
  sides: Array<{ contentId: string; platform: string; title: string | null; engagementRatePct: number | null; views: number | null; adBoosted: boolean | null }>;
  winner: string | null;
  adConfounded: boolean;
}

export interface IdeaEdge {
  suggestionId: string;
  suggestionTheme: string | null;
  suggestionStatus: string;
  suggestionHypothesis: string | null;
  suggestionFormat: string | null;
  sourceVideoIds: string[];
  outcomes: Array<{
    contentId: string;
    platform: string;
    title: string | null;
    engagementRatePct: number | null;
    platformMedianPct: number | null;
    verdict: 'above_median' | 'below_median' | 'unscored';
    matchedOn: 'hypothesis' | 'format';
  }>;
  matching: 'auto';
}

export interface InsightsReport {
  generatedAt: string;
  totals: { videos: number; analysed: number; scored: number; pairs: number; adRuns: number };
  perPlatform: InsightPlatformReport[];
  pairs: InsightPair[];
  edges: IdeaEdge[];
  /** Standing caution — always present, always rendered. */
  caution: string[];
  method: string;
  narrative: { overall: string; perPlatform: Array<{ platform: string; summary: string }> } | null;
  llm: { status: 'ok' } | { status: 'skipped'; reason: string };
  tagProposals: number;
}

export interface InsightRun {
  id: string;
  runId: string;
  trigger: 'cron' | 'manual';
  triggeredBy: string;
  status: 'ok' | 'numbers_only';
  videoCount: number;
  analysedCount: number;
  report: InsightsReport;
  inputTokens: number;
  outputTokens: number;
  createdAt: string;
}

export interface HypothesisProposal {
  id: string;
  runId: string;
  contentId: string;
  tag: string;
  rationale: string | null;
  status: 'suggested' | 'approved' | 'rejected';
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface InsightsPayload {
  run: InsightRun | null;
  proposals: HypothesisProposal[];
  videos: Record<string, { title: string | null; platform: string; platformVideoId: string }>;
  running: boolean;
}

export function getInsights(): Promise<InsightsPayload> {
  return getJson<InsightsPayload>('/api/insights/latest');
}

export function runInsights(): Promise<{ ok: true; insightRunId: string; status: string; tagProposals: number }> {
  return sendJson('POST', '/api/insights/run', {});
}

export function decideTag(id: string, status: 'approved' | 'rejected'): Promise<{ ok: true; hypothesis: string | null }> {
  return sendJson('POST', `/api/insights/tags/${id}`, { status });
}

/* ---------------- X3 — KPI view, rebuilt ---------------- */

/** KPI 3 from content_analysis coverage, by the video's posted week. No dollars, no enrollments. */
export interface CoverageWeek {
  weekStart: string;
  posted: number;
  analysed: number;
  byPlatform: Record<string, { posted: number; analysed: number }>;
  goalMet: boolean;
}

export interface CoveragePayload {
  goalPerWeek: number;
  basis: string;
  totals: { videos: number; analysed: number };
  weeks: CoverageWeek[];
}

export function getCoverage(weeks = 12): Promise<CoveragePayload> {
  return getJson<CoveragePayload>(`/api/kpis/coverage?weeks=${weeks}`);
}

/** One level's slice of a month, as handed over by the portal's dash-counts function. */
export interface PortalLevelBucket {
  new: number;
  renewed: number;
  bySource: Record<string, number>;
  legacy: number;
}

export interface PortalMonth {
  month: string;
  /** exact = from plan_history; estimated = "account older than its plan" heuristic. */
  renewalsMode: 'exact' | 'estimated';
  byLevel: Record<string, PortalLevelBucket>;
  total: PortalLevelBucket;
}

export type PortalCountsPayload =
  | { configured: false; reason: string }
  | { configured: true; error: string; status?: number }
  | {
      configured: true;
      cached: boolean;
      generatedAt: string;
      from: string;
      levels: string[];
      renewalsExactSince: string | null;
      months: PortalMonth[];
    };

/** 502 from the API means the portal side is down/not deployed — that is a state to render, not an exception. */
export async function getPortalCounts(refresh = false): Promise<PortalCountsPayload> {
  const path = `/api/kpis/portal${refresh ? '?refresh=1' : ''}`;
  const response = await fetch(path);
  if (response.status === 401) bounceToPortal();
  if (response.status === 403) throw new Error('Your portal role cannot open this.');
  if (response.status === 502) return (await response.json()) as PortalCountsPayload;
  if (!response.ok) throw new Error(`${path} → ${response.status}`);
  return (await response.json()) as PortalCountsPayload;
}

export function getMonthlyKpis(months = 12): Promise<MonthlyKpis[]> {
  return getJson<MonthlyKpis[]>(`/api/kpis/monthly?months=${months}`);
}
