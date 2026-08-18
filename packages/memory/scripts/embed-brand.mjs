// M4: backfill embeddings for brand_assets chunks that don't have one yet.
// Run: pnpm embed:brand   (requires SUPABASE_* and VOYAGE_API_KEY in .env)
import { createEmbeddingClient } from '@platform/shared';
import { createMemoryClient } from '@platform/memory';

const embedder = createEmbeddingClient();
if (embedder === null) {
  console.error('VOYAGE_API_KEY missing — add it to .env');
  process.exit(1);
}

const memory = createMemoryClient();
const chunks = await memory.brandAssets.allChunks('brand-voice.md');
if (chunks.length === 0) {
  console.error('No brand_assets chunks found — run pnpm ingest:brand first.');
  process.exit(1);
}

console.log(`Embedding ${chunks.length} chunks with voyage-3.5-lite (1536 dims)...`);
const embeddings = await embedder.embed(
  chunks.map((c) => `${c.heading}\n\n${c.content}`),
  'document'
);

await memory.brandAssets.updateEmbeddings(
  chunks.map((c, i) => ({ id: c.id, embedding: embeddings[i] }))
);
console.log(`Done: ${chunks.length} chunks embedded.`);

// Smoke-test retrieval:
const [queryEmbedding] = await embedder.embed(
  ['What topics can never appear in a suggestion?'],
  'query'
);
const results = await memory.brandAssets.search(queryEmbedding, 3);
console.log('\nRetrieval smoke test — top 3 for "What topics can never appear in a suggestion?":');
for (const r of results) {
  console.log(`  ${r.similarity.toFixed(3)}  ${r.heading}`);
}