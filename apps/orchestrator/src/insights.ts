import { randomUUID } from 'node:crypto';
import { INSIGHTS_AGENT_NAME, formatInsightsSlack, insightsAgent, type InsightsOutput } from '@platform/agent-analyst';
import { createLogStore } from '@platform/memory';
import { createLogger, postSlackText } from '@platform/shared';
import { Orchestrator } from './router.js';

/**
 * X6 cron entrypoint. Chained by packages/integrations/src/sync.ts at the end
 * of every real nightly sync (locked 2026-09-10: no new Railway service),
 * spawned by apps/api for the dash's manual button (`--trigger manual --by
 * <email>`), and runnable by hand: `pnpm insights`. Posts the Slack summary when the Slack
 * env vars are present; otherwise the run is still stored and just logged.
 */
const logger = createLogger('insights');

function parseArgs(): { trigger: 'cron' | 'manual'; triggeredBy: string } {
  const args = process.argv.slice(2);
  const i = args.indexOf('--trigger');
  const trigger = i !== -1 && args[i + 1] === 'cron' ? 'cron' : 'manual';
  const b = args.indexOf('--by');
  const by = b !== -1 && args[b + 1] !== undefined ? args[b + 1] : undefined;
  return { trigger, triggeredBy: by ?? (trigger === 'cron' ? 'nightly-sync' : 'cli') };
}

async function main(): Promise<boolean> {
  const { trigger, triggeredBy } = parseArgs();
  const orchestrator = new Orchestrator({ logStore: createLogStore() });
  orchestrator.registerAgent(insightsAgent);
  const result = await orchestrator.dispatch({
    id: randomUUID(),
    type: 'analysis.insights',
    agent: INSIGHTS_AGENT_NAME,
    payload: { trigger, triggeredBy },
    requestedBy: triggeredBy,
    createdAt: new Date().toISOString(),
  });
  if (!result.ok) {
    logger.error(`insights run failed [${result.error.code}]: ${result.error.message}`);
    await postSlackText(`Insights run failed [${result.error.code}]: ${result.error.message}`).catch((e: unknown) => logger.error(String(e)));
    return false;
  }
  const output = result.output as InsightsOutput;
  const text = formatInsightsSlack(output);
  const posted = await postSlackText(text);
  if (!posted) {
    logger.warn('Slack env vars unset — summary not posted');
    console.log(text);
  }
  logger.info(`insights run ${output.insightRunId} (${output.status}) — ${output.tagProposals} new tag proposals, tokens ${output.totalTokens.input} in / ${output.totalTokens.output} out`);
  return true;
}

// Explicit process.exit (CLAUDE.md): open Supabase/HTTP handles keep Node alive otherwise.
main()
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((error: unknown) => {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
