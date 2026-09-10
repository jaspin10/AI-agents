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

export function getMe(): Promise<Me> {
  return getJson<Me>('/api/me');
}

/** Feedback write path: flips a suggestion to posted/skipped. Auth = session cookie + role (X0). */
export async function setSuggestionStatus(
  id: string,
  status: 'posted' | 'skipped'
): Promise<void> {
  const response = await fetch(`/api/suggestions/${id}/status`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (response.status === 401) bounceToPortal();
  if (response.status === 403) throw new Error('Your portal role cannot change suggestion status.');
  if (!response.ok) throw new Error(`status update → ${response.status}`);
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
