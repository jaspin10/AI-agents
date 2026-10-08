/**
 * Guardian configuration, read from the environment of the Railway service that
 * runs it (@platform/orchestrator, see docs/spec/guardian.md "Setup status").
 *
 * Secrets (never logged, never written anywhere):
 *   GUARDIAN_SHARED_SECRET    - x-guardian-secret for the portal guardian-incidents function
 *   GUARDIAN_ANTHROPIC_API_KEY - Guardian's own Anthropic key (NOT ANTHROPIC_API_KEY,
 *                               which belongs to the analyst agents)
 *   GITHUB_TOKEN              - fine-grained token "guardian-repair", portal repo only
 *
 * Switches:
 *   GUARDIAN_MODE  off | investigate | auto   (default: investigate)
 *     off         - the loop does nothing at all
 *     investigate - diagnose TRIGGERED incidents, write findings to the Error Inbox, open no PRs
 *     auto        - full locked 2026-10-02 rules: small fixes auto-merge, big fixes open a PR
 *                   and wait for Approve, auto-revert watch, WhatsApp + Inbox notices
 */

export type GuardianMode = 'off' | 'investigate' | 'auto';

export interface GuardianConfig {
  mode: GuardianMode;
  sharedSecret: string;
  anthropicKey: string;
  githubToken: string;
  portalUrl: string;
  repoOwner: string;
  repoName: string;
  baseBranch: string;
  model: string;
  monthlyCapCents: number;
  usdToCad: number;
  intervalMs: number;
  maxIncidentsPerTick: number;
  watchMs: number;
}

const DEFAULT_PORTAL_URL = 'https://jtzazvkshizmuhezuxwl.supabase.co/functions/v1/guardian-incidents';

function env(name: string): string {
  return (process.env[name] ?? '').trim();
}

function num(name: string, fallback: number): number {
  const raw = env(name);
  if (raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function readMode(): GuardianMode {
  const raw = env('GUARDIAN_MODE').toLowerCase();
  if (raw === 'off' || raw === 'auto' || raw === 'investigate') return raw;
  return 'investigate';
}

/** Returns null when a required secret is missing - the loop then stays off. */
export function readGuardianConfig(): GuardianConfig | null {
  const sharedSecret = env('GUARDIAN_SHARED_SECRET');
  const anthropicKey = env('GUARDIAN_ANTHROPIC_API_KEY');
  const githubToken = env('GITHUB_TOKEN');
  if (sharedSecret.length < 24 || anthropicKey === '' || githubToken === '') return null;
  const repo = env('GUARDIAN_REPO') || 'jaspin10/french-with-jas-portal';
  const [repoOwner, repoName] = repo.split('/');
  if (!repoOwner || !repoName) return null;
  return {
    mode: readMode(),
    sharedSecret,
    anthropicKey,
    githubToken,
    portalUrl: env('GUARDIAN_PORTAL_URL') || DEFAULT_PORTAL_URL,
    repoOwner,
    repoName,
    baseBranch: env('GUARDIAN_BASE_BRANCH') || 'main',
    model: env('GUARDIAN_MODEL') || 'claude-sonnet-4-6',
    monthlyCapCents: Math.round(num('GUARDIAN_MONTHLY_CAP_CAD', 25) * 100),
    usdToCad: num('GUARDIAN_USD_TO_CAD', 1.4),
    intervalMs: Math.round(num('GUARDIAN_INTERVAL_MIN', 5) * 60000),
    maxIncidentsPerTick: Math.round(num('GUARDIAN_MAX_INCIDENTS_PER_TICK', 1)),
    watchMs: 2 * 60 * 60 * 1000,
  };
}
