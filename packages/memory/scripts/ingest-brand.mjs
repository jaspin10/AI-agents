// pnpm ingest:brand — chunks docs/brand-voice.md by heading and upserts the
// text into brand_assets. Embeddings deliberately deferred to M4 (owner
// decision 2026-08-16): the embedding column stays null until the analyst
// actually needs retrieval.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createMemoryClient } from '@platform/memory';

const SOURCE = 'brand-voice.md';

function extractVersion(markdown) {
  const match = markdown.match(/Version\s+([\d.]+)/i);
  return match ? match[1] : '0.0';
}

/** Split on ## headings; the preamble (title + version line) is chunk 0. */
function chunk(markdown) {
  const lines = markdown.split('\n');
  const chunks = [];
  let heading = null;
  let buffer = [];

  const flush = () => {
    const content = buffer.join('\n').trim();
    if (content.length > 0) {
      chunks.push({ heading, content });
    }
    buffer = [];
  };

  for (const line of lines) {
    if (line.startsWith('## ')) {
      flush();
      heading = line.replace(/^##\s+/, '').trim();
    }
    buffer.push(line);
  }
  flush();
  return chunks;
}

async function main() {
  const path = resolve(process.argv[2] ?? 'docs/brand-voice.md');
  let markdown;
  try {
    markdown = readFileSync(path, 'utf8');
  } catch {
    console.error(`Could not read ${path}.`);
    console.error('Usage: pnpm ingest:brand [path/to/brand-voice.md]');
    process.exit(1);
  }

  const version = extractVersion(markdown);
  const pieces = chunk(markdown);
  console.log(
    `Read ${path} (version ${version}) — ${pieces.length} chunk(s):`
  );
  for (const [i, p] of pieces.entries()) {
    console.log(
      `  [${i}] ${p.heading ?? '(preamble)'} — ${p.content.length} chars`
    );
  }

  const memory = createMemoryClient();
  // Idempotent re-runs: clear this source+version, then upsert fresh.
  await memory.brandAssets.deleteBySourceVersion(SOURCE, version);
  const count = await memory.brandAssets.upsertChunks(
    pieces.map((p, chunkIndex) => ({
      source: SOURCE,
      version,
      chunkIndex,
      heading: p.heading,
      content: p.content,
    }))
  );
  console.log(
    `Upserted ${count} chunk(s) into brand_assets (embeddings: deferred to M4).`
  );

  const stored = await memory.brandAssets.allChunks(SOURCE);
  console.log(`Verified: ${stored.length} chunk(s) now in brand_assets.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});