export const EMBEDDING_MODEL = 'voyage-3.5';
export const EMBEDDING_DIMENSIONS = 1024;

export interface EmbeddingClient {
  /** Embed texts in order; result[i] belongs to texts[i]. Throws on API errors. */
  embed: (texts: string[], inputType: 'document' | 'query') => Promise<number[][]>;
}

/** Returns null when VOYAGE_API_KEY is absent (same pattern as createLlmClient). */
export function createEmbeddingClient(): EmbeddingClient | null {
  const apiKey = process.env['VOYAGE_API_KEY'];
  if (apiKey === undefined || apiKey === '') return null;

  return {
    async embed(texts, inputType) {
      const response = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: texts,
          input_type: inputType,
          output_dimension: EMBEDDING_DIMENSIONS,
        }),
      });
      if (!response.ok) {
        throw new Error(`Voyage API ${response.status}: ${await response.text()}`);
      }
      const payload = (await response.json()) as {
        data: Array<{ index: number; embedding: number[] }>;
      };
      return payload.data
        .sort((a, b) => a.index - b.index)
        .map((item) => item.embedding);
    },
  };
}