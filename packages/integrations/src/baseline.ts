import { createLogger } from '@platform/shared';
import { createMemoryClient } from '@platform/memory';

const logger = createLogger('baseline');

function bar(title: string): void {
  console.log(`\n${'─'.repeat(50)}\n${title}\n${'─'.repeat(50)}`);
}

async function main(): Promise<void> {
  const memory = createMemoryClient();

  const [content, performance, enrollments] = await Promise.all([
    memory.content.all(),
    memory.performance.all(),
    memory.enrollments.all(),
  ]);

  bar(`BASELINE SNAPSHOT — ${new Date().toISOString().slice(0, 10)}`);

  // Latest performance snapshot per video
  const latest = new Map<string, (typeof performance)[number]>();
  for (const row of performance) {
    const existing = latest.get(`${row.platform}:${row.contentId}`);
    if (existing === undefined || row.capturedDate > existing.capturedDate) {
      latest.set(`${row.platform}:${row.contentId}`, row);
    }
  }

  for (const platform of ['tiktok', 'youtube'] as const) {
    const videos = content.filter((c) => c.platform === platform);
    const snaps = [...latest.values()].filter((p) => p.platform === platform);
    const views = snaps.reduce((sum, p) => sum + p.metrics.views, 0);
    const likes = snaps.reduce((sum, p) => sum + p.metrics.likes, 0);
    const comments = snaps.reduce((sum, p) => sum + p.metrics.comments, 0);
    const shares = snaps.reduce((sum, p) => sum + p.metrics.shares, 0);
    const followers = snaps[0]?.metrics.followersAtCapture ?? null;
    const tagged = videos.filter((c) => c.hypothesis !== null).length;

    bar(platform.toUpperCase());
    console.log(`videos:            ${videos.length}`);
    console.log(`followers:         ${followers ?? 'n/a'}`);
    console.log(`total views:       ${views}`);
    console.log(`total likes:       ${likes}`);
    console.log(`total comments:    ${comments}`);
    console.log(`total shares:      ${shares}`);
    console.log(`hypothesis-tagged: ${tagged} (KPI 3 baseline)`);

    if (platform === 'youtube') {
      const withRetention = snaps.filter((p) => p.metrics.retentionPct !== null);
      const avgRetention =
        withRetention.length > 0
          ? withRetention.reduce((sum, p) => sum + (p.metrics.retentionPct ?? 0), 0) /
            withRetention.length
          : null;
      console.log(
        `avg retention:     ${avgRetention === null ? 'n/a' : `${avgRetention.toFixed(1)}%`} (across ${withRetention.length} videos)`
      );
    }
  }

  bar('STRIPE ENROLLMENTS');
  const completed = enrollments.filter((e) => e.status === 'complete');
  const revenueCents = completed.reduce((sum, e) => sum + (e.amountCents ?? 0), 0);
  console.log(`sessions total:    ${enrollments.length}`);
  console.log(`completed:         ${completed.length}`);
  console.log(`completed revenue: $${(revenueCents / 100).toFixed(2)}`);

  // Completed enrollments by month, most recent 6 — KPI 1 baseline
  const byMonth = new Map<string, number>();
  for (const e of completed) {
    const month = e.enrolledAt.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
  }
  const months = [...byMonth.keys()].sort().slice(-6);
  console.log('\ncompleted by month (KPI 1 baseline, target 80/mo):');
  for (const month of months) {
    console.log(`  ${month}: ${byMonth.get(month)}`);
  }

  // Top products by completed count
  const byProduct = new Map<string, number>();
  for (const e of completed) {
    const name = e.stripeProductName ?? '(no product name)';
    byProduct.set(name, (byProduct.get(name) ?? 0) + 1);
  }
  const topProducts = [...byProduct.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log('\ntop products (completed sessions):');
  for (const [name, count] of topProducts) {
    console.log(`  ${count.toString().padStart(4)}  ${name}`);
  }

  logger.info('baseline complete');
}

main().catch((error: unknown) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});