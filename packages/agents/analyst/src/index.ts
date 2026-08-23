import { randomUUID } from 'node:crypto';
import {
  AgentContractSchema,
  ContractViolationError,
  NextVideoSuggestionSchema,
  NextVideoTaskPayloadSchema,
  PlatformError,
  createLlmClient,
  type AgentContext,
  type AgentContract,
  type BrandAssetChunk,
  type NextVideoSuggestion,
  type SuggestionRow,
  type Task,
} from '@platform/shared';
import { createMemoryClient } from '@platform/memory';
import { z } from 'zod';
import { analyse } from './analysis.js';
import { buildGenerationSystemPrompt, buildGenerationUserPrompt } from './prompts.js';
import { runBannedTopicsCheck, runBrandVoiceCheck } from './checks.js';

export const ANALYST_AGENT_NAME = 'analyst';

const MAX_RETRIES = 2;

/** §6 hard spend cap: refused runs carry this stable code in agent_logs. */
export class LlmCapExceededError extends PlatformError {
  constructor(used: number, cap: number, month: string) {
    super(
      'LLM_CAP_EXCEEDED',
      `LLM monthly cap reached for ${month}: ${used} tokens used, cap is ${cap} (LLM_MONTHLY_CAP). ` +
        'Run refused. Raise the cap or wait for the next month.'
    );
  }
}

/** Total tokens (input+output) allowed per UTC month. Unset/empty = no cap. */
function readMonthlyCap(): number | null {
  const raw = process.env['LLM_MONTHLY_CAP'];
  if (raw === undefined || raw.trim() === '') return null;
  const cap = Number(raw);
  if (!Number.isFinite(cap) || cap <= 0) {
    throw new ContractViolationError(
      `LLM_MONTHLY_CAP must be a positive number of tokens, got '${raw}'.`
    );
  }
  return cap;
}

/** Shape the LLM must return from generation. */
const GenerationSchema = z.object({
  suggestions: z.array(
    z.object({
      theme: z.string().min(1),
      hook: z.string().min(1),
      format: z.string().min(1),
      hypothesis: z.string().nullable(),
      rationale: z.string().min(1),
    })
  ),
});

const OutputSchema = z.object({
  suggestions: z.array(NextVideoSuggestionSchema),
  rejected: z.number().int().nonnegative(),
  totalTokens: z.object({ input: z.number(), output: z.number() }),
  /** M5: cap context for reports — null when no cap is configured. */
  capStatus: z
    .object({ month: z.string(), used: z.number(), cap: z.number() })
    .nullable(),
});
export type AnalystOutput = z.infer<typeof OutputSchema>;

function chunkByHeadingPrefix(chunks: BrandAssetChunk[], prefix: string): BrandAssetChunk {
  const found = chunks.find((c) => c.heading !== null && c.heading.startsWith(prefix));
  if (found === undefined) {
    throw new ContractViolationError(`brand_assets missing required chunk with heading starting '${prefix}' — run pnpm ingest:brand.`);
  }
  return found;
}

async function run(task: Task, context: AgentContext): Promise<AnalystOutput> {
  const payload = NextVideoTaskPayloadSchema.parse(task.payload);
  const count = payload.count ?? 3;

  const llm = createLlmClient();
  if (llm === null) {
    throw new ContractViolationError('ANTHROPIC_API_KEY missing — the analyst cannot run without it.');
  }
  const memory = createMemoryClient();

  // 0) §6 hard cap — checked BEFORE any LLM call.
  const cap = readMonthlyCap();
  const month = new Date().toISOString().slice(0, 7);
  let usedThisMonth = 0;
  if (cap !== null) {
    usedThisMonth = await memory.llmUsage.monthlyTotal(month);
    if (usedThisMonth >= cap) {
      throw new LlmCapExceededError(usedThisMonth, cap, month);
    }
    context.logger.info(
      `llm cap check: ${usedThisMonth}/${cap} tokens used in ${month}${usedThisMonth >= cap * 0.8 ? ' — WARNING: past 80%' : ''}`
    );
  }

  // 1) Read data.
  const [content, performance, brandChunks] = await Promise.all([
    memory.content.all(),
    memory.performance.all(),
    memory.brandAssets.allChunks('brand-voice.md'),
  ]);
  const bannedChunk = chunkByHeadingPrefix(brandChunks, '3.');
  const toneChunk = chunkByHeadingPrefix(brandChunks, '4.');

  // 2) Analyse.
  const summary = analyse(content, performance);
  context.logger.info(`analysed ${summary.totalVideos} videos (${summary.taggedVideos} tagged)`);

  const tokens = { input: 0, output: 0 };
  const surfaced: NextVideoSuggestion[] = [];
  let rejectedCount = 0;

  // 3) Generate → check → retry.
  for (let attempt = 0; attempt <= MAX_RETRIES && surfaced.length < count; attempt += 1) {
    const needed = count - surfaced.length;
    const generation = await llm.complete({
      system: buildGenerationSystemPrompt(brandChunks),
      user: buildGenerationUserPrompt(summary, needed, payload.focus),
      maxTokens: 2048,
    });
    tokens.input += generation.usage.inputTokens;
    tokens.output += generation.usage.outputTokens;

    const cleaned = generation.text.replace(/```json|```/g, '').trim();
    const candidates = GenerationSchema.parse(JSON.parse(cleaned)).suggestions;

    for (const candidate of candidates) {
      if (surfaced.length >= count) break;

      const banned = await runBannedTopicsCheck(llm, bannedChunk, candidate);
      tokens.input += banned.usage.inputTokens;
      tokens.output += banned.usage.outputTokens;
      const voice = await runBrandVoiceCheck(llm, toneChunk, candidate);
      tokens.input += voice.usage.inputTokens;
      tokens.output += voice.usage.outputTokens;

      const passed = banned.result.passed && voice.result.passed;

      const suggestion: NextVideoSuggestion = {
        id: randomUUID(),
        taskId: task.id,
        agent: ANALYST_AGENT_NAME,
        kind: 'next_video',
        theme: candidate.theme,
        hook: candidate.hook,
        format: candidate.format,
        // Only accept a tag that exists in the CURRENT taxonomy; anything else → null.
        hypothesis: NextVideoSuggestionSchema.shape.hypothesis.safeParse(candidate.hypothesis).success
          ? (candidate.hypothesis as NextVideoSuggestion['hypothesis'])
          : null,
        rationale: candidate.rationale,
        createdAt: new Date().toISOString(),
      };

      const row: SuggestionRow = {
        id: suggestion.id,
        runId: context.runId,
        taskId: task.id,
        agent: ANALYST_AGENT_NAME,
        kind: 'next_video',
        payload: suggestion,
        hypothesis: suggestion.hypothesis,
        bannedTopicsPassed: banned.result.passed,
        bannedTopicsReasons: banned.result.reasons,
        brandVoicePassed: voice.result.passed,
        brandVoiceReasons: voice.result.reasons,
        status: passed ? 'surfaced' : 'rejected',
        createdAt: suggestion.createdAt,
      };
      await memory.suggestions.insert(row);

      const logLine = `check results for suggestion ${suggestion.id}: banned_topics=${banned.result.passed ? 'PASS' : 'FAIL'} brand_voice=${voice.result.passed ? 'PASS' : 'FAIL'}`;
      if (passed) {
        context.logger.info(logLine);
        surfaced.push(suggestion);
      } else {
        context.logger.warn(`${logLine} — dropped, reasons: ${[...banned.result.reasons, ...voice.result.reasons].join('; ')}`);
        rejectedCount += 1;
      }
    }
  }

  // 4) Record spend to the ledger (§6). Failure to record must not lose the run's
  // suggestions — log loudly instead, the ledger self-corrects next month.
  try {
    await memory.llmUsage.record({
      runId: context.runId,
      agent: ANALYST_AGENT_NAME,
      model: 'claude-sonnet-4-6',
      inputTokens: tokens.input,
      outputTokens: tokens.output,
    });
  } catch (error) {
    context.logger.error(
      `failed to record llm_usage row: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return {
    suggestions: surfaced,
    rejected: rejectedCount,
    totalTokens: tokens,
    capStatus:
      cap === null
        ? null
        : { month, used: usedThisMonth + tokens.input + tokens.output, cap },
  };
}

/**
 * §5 contract for the content analyst v1 (M4). allowedTools lists the read-only
 * integration tools; no publish tool exists anywhere in the codebase (§6).
 * Data reads go through the memory client (Supabase), not tools — tools are for
 * live platform snapshots, which M4 analysis does not need (sync writes the DB).
 */
export const analystAgent: AgentContract = AgentContractSchema.parse({
  name: ANALYST_AGENT_NAME,
  description: 'Content analyst v1 (M4): analyses performance, suggests next videos with banned-topics + brand-voice checks. M5: §6 hard monthly LLM cap.',
  capabilities: ['analysis.next_video'],
  allowedTools: ['tiktok.snapshot', 'youtube.snapshot', 'stripe.enrollments'],
  inputSchema: NextVideoTaskPayloadSchema,
  outputSchema: OutputSchema,
  run,
} satisfies AgentContract);