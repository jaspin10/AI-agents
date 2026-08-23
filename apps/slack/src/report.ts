import { createMemoryClient, monthlyKpis } from '@platform/memory';
import { createLogger } from '@platform/shared';

const logger = createLogger('report');

const botToken = process.env['SLACK_BOT_TOKEN'];
const channelId = process.env['SLACK_CHANNEL_ID'];
if (botToken === undefined || channelId === undefined) {
  throw new Error('SLACK_BOT_TOKEN and SLACK_CHANNEL_ID are required.');
}
const BOT_TOKEN: string = botToken;

async function postToSlack(body: Record<string, unknown>): Promise<void> {
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      authorization: `Bearer ${BOT_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as { ok: boolean; error?: string };
  if (!result.ok) throw new Error(`chat.postMessage failed: ${result.error ?? 'unknown'}`);
}

function cad(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-CA', { maximumFractionDigits: 0 })}`;
}

/** Engagement proxy usable on both platforms (TikTok has no retention — §11). */
function engagementRate(views: number, likes: number, comments: number, shares: number): number {
  return views === 0 ? 0 : (likes + comments + shares) / views;
}

async function main(): Promise<void> {
  const memory = createMemoryClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const [months, content, performance, suggestions] = await Promise.all([
    monthlyKpis(memory, 2),
    memory.content.all(),
    memory.performance.all(),
    memory.suggestions.all(),
  ]);

  // Latest snapshot per video.
  const latest = new Map<string, (typeof performance)[number]>();
  for (const p of performance) {
    const key = `${p.platform}:${p.contentId}`;
    const existing = latest.get(key);
    if (existing === undefined || p.capturedDate > existing.capturedDate) latest.set(key, p);
  }

  // Top/bottom by engagement rate, noise floor 100 views.
  const scored = [...latest.values()]
    .filter((p) => p.metrics.views >= 100)
    .map((p) => ({
      p,
      rate: engagementRate(p.metrics.views, p.metrics.likes, p.metrics.comments, p.metrics.shares),
    }))
    .sort((a, b) => b.rate - a.rate);
  const titleOf = (platform: string, videoId: string): string => {
    const row = content.find((c) => c.platform === platform && c.platformVideoId === videoId);
    const title = row?.title ?? videoId;
    return title.length > 60 ? `${title.slice(0, 57)}...` : title;
  };
  const top = scored.slice(0, 3);
  const bottom = scored.slice(-3).reverse();

  // Suggestion activity, last 7 days.
  const recent = suggestions.filter((s) => s.createdAt >= sevenDaysAgo);
  const counts = {
    surfaced: recent.filter((s) => s.status === 'surfaced').length,
    posted: recent.filter((s) => s.status === 'posted').length,
    skipped: recent.filter((s) => s.status === 'skipped').length,
    rejected: recent.filter((s) => s.status === 'rejected').length,
  };

  // LLM cap status.
  const month = new Date().toISOString().slice(0, 7);
  const capRaw = process.env['LLM_MONTHLY_CAP'];
  const cap = capRaw === undefined || capRaw.trim() === '' ? null : Number(capRaw);
  const used = await memory.llmUsage.monthlyTotal(month);
  let capLine = `LLM spend: ${used.toLocaleString()} tokens in ${month} (no cap set)`;
  if (cap !== null && Number.isFinite(cap) && cap > 0) {
    const pct = Math.round((used / cap) * 100);
    capLine = `LLM spend: ${used.toLocaleString()}/${cap.toLocaleString()} tokens in ${month} (${pct}%)${pct >= 80 ? ' ⚠️ past 80% — runs refused at 100%' : ''}`;
  }

  const thisMonth = months.find((m) => m.month === month);
  const lastMonth = months.find((m) => m.month !== month);

  const lines: string[] = [
    `*Weekly report — ${new Date().toISOString().slice(0, 10)}*`,
    '',
    '*KPIs (Stripe-visible — e-transfer/manual routes not included)*',
    `• This month (${month}): ${thisMonth?.enrollments ?? 0} enrollments, ${cad(thisMonth?.revenueCents ?? 0)} — target 80/month`,
    lastMonth !== undefined
      ? `• Last month (${lastMonth.month}): ${lastMonth.enrollments} enrollments, ${cad(lastMonth.revenueCents)}`
      : '',
    `• Videos posted this month: ${thisMonth?.videosPosted ?? 0} (${thisMonth?.taggedVideos ?? 0} hypothesis-tagged — taxonomy v2 pending)`,
    '• Demo requests: no data source yet (KPI 2)',
    '',
    '*Top videos (engagement rate, ≥100 views)*',
    ...top.map(({ p, rate }) => `• ${(rate * 100).toFixed(1)}% — [${p.platform}] ${titleOf(p.platform, p.contentId)} (${p.metrics.views.toLocaleString()} views)`),
    '',
    '*Bottom videos*',
    ...bottom.map(({ p, rate }) => `• ${(rate * 100).toFixed(1)}% — [${p.platform}] ${titleOf(p.platform, p.contentId)} (${p.metrics.views.toLocaleString()} views)`),
    '',
    '*Suggestions (last 7 days)*',
    `• ${counts.surfaced} awaiting decision, ${counts.posted} posted, ${counts.skipped} skipped, ${counts.rejected} rejected by checks`,
    '',
    capLine,
  ].filter((line) => line !== '');

  await postToSlack({ channel: channelId, text: lines.join('\n') });
  logger.info('weekly report posted');
}

main().catch((error: unknown) => {
    if (error instanceof Error) {
      logger.error(error.message, {
        cause: error.cause instanceof Error ? error.cause.message : String(error.cause ?? ''),
        stack: error.stack?.split('\n').slice(0, 6).join(' | '),
      });
    } else {
      logger.error(String(error));
    }
    process.exitCode = 1;
  });