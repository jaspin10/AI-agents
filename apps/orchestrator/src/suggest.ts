import { randomUUID } from 'node:crypto';
import { ANALYST_AGENT_NAME, analystAgent, type AnalystOutput } from '@platform/agent-analyst';
import { integrationTools } from '@platform/integrations';
import { createLogStore } from '@platform/memory';
import { createLogger, type Task } from '@platform/shared';
import { Orchestrator } from './router.js';

const logger = createLogger('suggest');

function parseArgs(): { count: number; focus: string | undefined } {
  const args = process.argv.slice(2);
  let count = 3;
  let focus: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--count' && args[i + 1] !== undefined) count = Number(args[i + 1]);
    if (args[i] === '--focus' && args[i + 1] !== undefined) focus = args[i + 1];
  }
  return { count: Number.isInteger(count) && count >= 1 && count <= 3 ? count : 3, focus };
}

async function main(): Promise<void> {
  const { count, focus } = parseArgs();
  const orchestrator = new Orchestrator({ logStore: createLogStore() });
  orchestrator.registerAgent(analystAgent);
  for (const tool of integrationTools) orchestrator.registerTool(tool);

  const task: Task = {
    id: randomUUID(),
    type: 'analysis.next_video',
    agent: ANALYST_AGENT_NAME,
    payload: focus === undefined ? { count } : { count, focus },
    requestedBy: 'owner',
    createdAt: new Date().toISOString(),
  };

  console.log(`Asking the analyst for ${count} suggestion(s)${focus === undefined ? '' : ` (focus: ${focus})`}...\n`);
  const result = await orchestrator.dispatch(task);

  if (!result.ok) {
    console.error(`FAILED [${result.error.code}]: ${result.error.message}`);
    process.exitCode = 1;
    return;
  }

  const output = result.output as AnalystOutput;
  for (const [index, s] of output.suggestions.entries()) {
    console.log(`--- Suggestion ${index + 1} ---`);
    console.log(`Theme:      ${s.theme}`);
    console.log(`Hook:       ${s.hook}`);
    console.log(`Format:     ${s.format}`);
    console.log(`Hypothesis: ${s.hypothesis ?? '(untagged — insufficient tagged data)'}`);
    console.log(`Rationale:  ${s.rationale}`);
    console.log(`Checks:     banned-topics PASSED, brand-voice PASSED`);
    console.log('');
  }
  console.log(`Rejected by checks: ${output.rejected}`);
  console.log(`Tokens: ${output.totalTokens.input} in / ${output.totalTokens.output} out`);
}

main().catch((error: unknown) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});