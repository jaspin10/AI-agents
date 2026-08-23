import Anthropic from '@anthropic-ai/sdk';

export const DEFAULT_MODEL = 'claude-sonnet-4-6';

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmResult {
  text: string;
  usage: LlmUsage;
  model: string;
}

export interface LlmClient {
  /** One prompt in, text out. Throws on API errors; caller decides retry policy. */
  complete: (options: { system: string; user: string; maxTokens?: number; model?: string }) => Promise<LlmResult>;
}

/**
 * Returns null when ANTHROPIC_API_KEY is absent, mirroring readSupabaseConfig's pattern.
 * LLM_ALLOW_BROWSER=1 enables the SDK's browser-context escape hatch — needed ONLY in
 * StackBlitz/WebContainers dev, where fetches route through the browser. Never set it
 * on real hosting (M5 decision): Railway runs plain Node and must not carry the flag.
 */
export function createLlmClient(): LlmClient | null {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (apiKey === undefined || apiKey === '') return null;
  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: process.env['LLM_ALLOW_BROWSER'] === '1',
  });

  return {
    async complete({ system, user, maxTokens = 2048, model = DEFAULT_MODEL }) {
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      });
      const text = response.content
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('');
      return {
        text,
        model: response.model,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    },
  };
}