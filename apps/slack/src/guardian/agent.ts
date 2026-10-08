import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AgentContractSchema, type AgentContext, type AgentContract, type Logger, type Task, type ToolDefinition } from '@platform/shared';
import { readGuardianConfig, readMode, type GuardianConfig } from './config.js';
import { GitHub, type GitHubRequester } from './github.js';
import { createGuardianLlm } from './llm.js';
import { Portal } from './portal.js';
import { GITHUB_READ_TOOL, GITHUB_WRITE_TOOL, PORTAL_TOOL, guardianTools } from './tools.js';
import { runTick } from './workflow.js';

/**
 * Two contracts so the ROUTER (not just our own code) enforces the mode:
 *   guardian-investigator - investigate mode: portal + read-only GitHub. It cannot write code.
 *   guardian-repairer     - auto mode: adds guardian.github_write (branch / PR / merge / revert).
 */
export const INVESTIGATOR_NAME = 'guardian-investigator';
export const REPAIRER_NAME = 'guardian-repairer';
export const TICK_CAPABILITY = 'guardian.tick';

const TickPayloadSchema = z.object({ mode: z.enum(['investigate', 'auto']) });
const TickOutputSchema = z.object({
  approvedMerged: z.number(),
  watched: z.number(),
  reverted: z.number(),
  investigated: z.number(),
  repairs: z.number(),
  notes: z.array(z.string()),
});

function makeRun(config: GuardianConfig, canWrite: boolean) {
  return async function run(task: Task, context: AgentContext): Promise<unknown> {
    const payload = TickPayloadSchema.parse(task.payload);
    const portal = new Portal(async (action, body) => context.callTool(PORTAL_TOOL, { action, body }));
    const requester: GitHubRequester = async (method, path, body) =>
      context.callTool(method === 'GET' ? GITHUB_READ_TOOL : GITHUB_WRITE_TOOL, { method, path, body });
    const github = new GitHub(requester, { owner: config.repoOwner, repo: config.repoName, base: config.baseBranch });
    const llm = createGuardianLlm({ apiKey: config.anthropicKey, model: config.model, capCents: config.monthlyCapCents, usdToCad: config.usdToCad, portal });
    return runTick({
      mode: canWrite ? payload.mode : 'investigate',
      portal,
      github,
      llm,
      logger: context.logger,
      model: config.model,
      watchMs: config.watchMs,
      maxIncidents: config.maxIncidentsPerTick,
      now: () => Date.now(),
    });
  };
}

export function guardianAgents(config: GuardianConfig): AgentContract[] {
  return [
    AgentContractSchema.parse({
      name: INVESTIGATOR_NAME,
      description: 'Portal Guardian, investigate mode: diagnoses TRIGGERED incidents, writes findings to the Error Inbox. Read-only on code.',
      capabilities: [TICK_CAPABILITY],
      allowedTools: [PORTAL_TOOL, GITHUB_READ_TOOL],
      inputSchema: TickPayloadSchema,
      outputSchema: TickOutputSchema,
      run: makeRun(config, false),
    } satisfies AgentContract),
    AgentContractSchema.parse({
      name: REPAIRER_NAME,
      description: 'Portal Guardian, auto mode: investigates, opens repair PRs, merges small fixes / approved big fixes, watches 2h, auto-reverts.',
      capabilities: [TICK_CAPABILITY],
      allowedTools: [PORTAL_TOOL, GITHUB_READ_TOOL, GITHUB_WRITE_TOOL],
      inputSchema: TickPayloadSchema,
      outputSchema: TickOutputSchema,
      run: makeRun(config, true),
    } satisfies AgentContract),
  ];
}

/** Anything with the Orchestrator's register/dispatch surface (avoids importing the app). */
export interface GuardianHost {
  registerAgent: (candidate: unknown) => unknown;
  registerTool: (tool: ToolDefinition) => void;
  dispatch: (task: unknown) => Promise<{ ok: boolean; output?: unknown; error?: { message: string } }>;
}

/**
 * Starts the Guardian loop inside a long-running service. Returns false (and does
 * nothing) when the secrets are missing or GUARDIAN_MODE=off. Never throws: a
 * Guardian failure must never take down the service it runs in.
 * The loop itself makes NO AI calls unless a TRIGGERED incident exists.
 */
export function startGuardianLoop(host: GuardianHost, logger: Logger): boolean {
  const config = readGuardianConfig();
  if (config === null) {
    logger.info('guardian: not started (GUARDIAN_SHARED_SECRET, GUARDIAN_ANTHROPIC_API_KEY or GITHUB_TOKEN missing)');
    return false;
  }
  if (config.mode === 'off') {
    logger.info('guardian: not started (GUARDIAN_MODE=off)');
    return false;
  }
  for (const tool of guardianTools(config)) host.registerTool(tool);
  for (const agent of guardianAgents(config)) host.registerAgent(agent);

  let running = false;
  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const mode = readMode();
      if (mode === 'off') return;
      const result = await host.dispatch({
        id: randomUUID(),
        type: TICK_CAPABILITY,
        agent: mode === 'auto' ? REPAIRER_NAME : INVESTIGATOR_NAME,
        payload: { mode },
        requestedBy: 'guardian-loop',
        createdAt: new Date().toISOString(),
      });
      if (!result.ok) logger.warn(`guardian tick failed: ${result.error?.message ?? 'unknown'}`);
      else logger.info(`guardian tick (${mode}): ${JSON.stringify(result.output)}`);
    } catch (error) {
      logger.error(`guardian tick crashed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      running = false;
    }
  }

  setTimeout(() => void tick(), 30000);
  setInterval(() => void tick(), config.intervalMs).unref();
  logger.info(`guardian: started in ${config.mode} mode, every ${Math.round(config.intervalMs / 60000)} min`);
  return true;
}
