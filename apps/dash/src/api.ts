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
  
  export async function getJson<T>(path: string): Promise<T> {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`${path} → ${response.status}`);
    return (await response.json()) as T;
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