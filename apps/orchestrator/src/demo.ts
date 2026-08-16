import { randomUUID } from 'node:crypto';
import { ANALYST_AGENT_NAME, analystAgent } from '@platform/agent-analyst';
import { createLogStore } from '@platform/memory';
import { createLogger, type Task } from '@platform/shared';
import { Orchestrator } from './router.js';

const logger = createLogger('demo');

function makeTask(payload: Task['payload']): Task {
  return {
    id: randomUUID(),
    type: 'analysis.echo',
    agent: ANALYST_AGENT_NAME,
    payload,
    requestedBy: 'owner',
    createdAt: new Date().toISOString(),
  };
}

function ensure(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`DEMO ASSERTION FAILED — ${message}`);
}

function heading(title: string): void {
  const bar = '='.repeat(72);
  console.log(`\n${bar}\n${title}\n${bar}`);
}

async function main(): Promise<void> {
  const store = createLogStore();
  const orchestrator = new Orchestrator({ logStore: store });

  heading(
    '1) Register the stub analyst agent (§5 contract, validated with Zod)'
  );
  orchestrator.registerAgent(analystAgent);
  console.log(`registered agents: ${orchestrator.listAgents().join(', ')}`);
  console.log(
    `registered tools:  ${
      orchestrator.listTools().join(', ') || '(none — MCP servers land at M3+)'
    }`
  );

  heading('2) Dispatch a sample task — successful round-trip');
  const okResult = await orchestrator.dispatch(
    makeTask({ message: 'What should my next video be?' })
  );
  console.log(JSON.stringify(okResult, null, 2));
  ensure(okResult.ok, 'expected the echo task to succeed');

  heading(
    '3) Agent attempts a tool NOT in its allowedTools — router must reject'
  );
  const deniedResult = await orchestrator.dispatch(
    makeTask({
      message: 'post the weekly report',
      attemptTool: 'slack.post_report',
    })
  );
  console.log(JSON.stringify(deniedResult, null, 2));
  ensure(!deniedResult.ok, 'expected the dispatch to fail');
  ensure(
    deniedResult.error.code === 'TOOL_CALL_DENIED',
    'expected TOOL_CALL_DENIED'
  );

  heading('4) agent_logs rows (local JSON until Supabase in M2)');
  const rows = await store.all();
  console.log(`log file: ${store.location}`);
  console.log(JSON.stringify(rows.slice(-3), null, 2));
  ensure(
    rows.some((row) => row.status === 'ok' && row.tool === 'agent.run'),
    'expected an ok agent.run row'
  );
  ensure(
    rows.some(
      (row) => row.status === 'rejected' && row.tool === 'slack.post_report'
    ),
    'expected a rejected slack.post_report row'
  );

  heading('M1 demo complete');
  console.log('[ok] contract validated at registration');
  console.log('[ok] task round-trip with inputSchema/outputSchema enforcement');
  console.log(
    '[ok] unauthorized tool call rejected by the router (allowedTools)'
  );
  console.log(`[ok] ${rows.length} agent_logs row(s) at ${store.location}`);
}

main().catch((error: unknown) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
