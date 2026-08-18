import { randomUUID } from 'node:crypto';
import { ANALYST_AGENT_NAME, analystAgent } from '@platform/agent-analyst';
import { integrationTools } from '@platform/integrations';
import { createLogStore } from '@platform/memory';
import { createLogger, type Task } from '@platform/shared';
import { Orchestrator } from './router.js';

const logger = createLogger('demo');

function makeTask(payload: Task['payload']): Task {
  return {
    id: randomUUID(),
    type: 'analysis.next_video',
    agent: ANALYST_AGENT_NAME,
    payload,
    requestedBy: 'owner',
    createdAt: new Date().toISOString(),
  };
}

async function main(): Promise<void> {
  const store = createLogStore();
  const orchestrator = new Orchestrator({ logStore: store });

  orchestrator.registerAgent(analystAgent);
  for (const tool of integrationTools) orchestrator.registerTool(tool);
  console.log(`agents: ${orchestrator.listAgents().join(', ')}`);
  console.log(`tools:  ${orchestrator.listTools().join(', ')}`);

  console.log('\nDispatching: "what should my next video be?" (count: 1)\n');
  const result = await orchestrator.dispatch(makeTask({ count: 1 }));
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((error: unknown) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});