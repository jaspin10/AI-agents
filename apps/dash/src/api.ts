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

export async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} → ${response.status}`);
  return (await response.json()) as T;
}

/** M5 write path: flips a suggestion to posted/skipped via the authed endpoint. */
export async function setSuggestionStatus(
  id: string,
  status: 'posted' | 'skipped'
): Promise<void> {
  const token = import.meta.env['VITE_API_WRITE_TOKEN'] as string | undefined;
  if (token === undefined || token.trim() === '') {
    throw new Error('VITE_API_WRITE_TOKEN not set — writes disabled.');
  }
  const response = await fetch(`/api/suggestions/${id}/status`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status }),
  });
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