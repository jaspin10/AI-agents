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
  contentId: string;
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
  adBoosted: boolean;
  adStartDate: string | null;
  adEndDate: string | null;
  adSpendCents: number | null;
  crossPlatformRef: string | null;
  ideaSource: string | null;
  analysedBy: string;
  analysedAt: string;
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
  crossPlatformRefVideo: { id: string; platform: string; platformVideoId: string; title: string | null } | null;
}

export interface AnalysisPayload {
  videos: AnalysisVideo[];
  /** Seeded chips ∪ every idea_source already saved. */
  ideaSources: string[];
}

export interface AnalysisBody {
  description: string | null;
  hookText: string | null;
  format: string | null;
  hasModel: boolean | null;
  hasCta: boolean | null;
  ctaType: string | null;
  adBoosted: boolean;
  adStartDate: string | null;
  adEndDate: string | null;
  adSpendCents: number | null;
  crossPlatformVideoId: string | null;
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

export function saveAnalysis(contentId: string, body: AnalysisBody): Promise<{ ok: true; analysis: ContentAnalysis }> {
  return sendJson('PUT', `/api/analysis/${contentId}`, body);
}
