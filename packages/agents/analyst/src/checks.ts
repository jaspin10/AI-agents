import {
    CheckResultSchema,
    type BrandAssetChunk,
    type CheckResult,
    type LlmClient,
    type LlmUsage,
  } from '@platform/shared';
  
  export interface CheckOutcome {
    result: CheckResult;
    usage: LlmUsage;
  }
  
  interface SuggestionShape {
    theme: string;
    hook: string;
    format: string;
    rationale: string;
  }
  
  function parseVerdict(check: CheckResult['check'], raw: string): CheckResult {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed: unknown = JSON.parse(cleaned);
    return CheckResultSchema.parse({
      check,
      ...(parsed as Record<string, unknown>),
    });
  }
  
  const VERDICT_FORMAT =
    'Respond ONLY with valid JSON, no markdown fences: {"passed": boolean, "reasons": string[]} — reasons empty when passed, specific violations when failed. Judge strictly: when in doubt, fail.';
  
  export async function runBannedTopicsCheck(
    llm: LlmClient,
    bannedTopicsChunk: BrandAssetChunk,
    suggestion: SuggestionShape
  ): Promise<CheckOutcome> {
    const { text, usage } = await llm.complete({
      system: [
        'You are a strict compliance checker for a language school\'s content suggestions.',
        'The five banned topics (authoritative definitions):',
        bannedTopicsChunk.content,
        VERDICT_FORMAT,
      ].join('\n\n'),
      user: `Check this video suggestion against ALL five banned topics:\n${JSON.stringify(suggestion, null, 2)}`,
      maxTokens: 512,
    });
    return { result: parseVerdict('banned_topics', text), usage };
  }
  
  export async function runBrandVoiceCheck(
    llm: LlmClient,
    toneRulesChunk: BrandAssetChunk,
    suggestion: SuggestionShape
  ): Promise<CheckOutcome> {
    const { text, usage } = await llm.complete({
      system: [
        'You are a strict brand-voice checker for a language school\'s content suggestions.',
        'The eight tone rules (authoritative):',
        toneRulesChunk.content,
        'A suggestion passes when nothing in it CONTRADICTS a rule. It does not need to demonstrate every rule — it is a video idea, not a finished script.',
        VERDICT_FORMAT,
      ].join('\n\n'),
      user: `Check this video suggestion against the tone rules:\n${JSON.stringify(suggestion, null, 2)}`,
      maxTokens: 512,
    });
    return { result: parseVerdict('brand_voice', text), usage };
  }