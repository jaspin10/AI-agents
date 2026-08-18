import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { HypothesisTagSchema, PlatformSchema, type HypothesisTag } from '@platform/shared';

const RowSchema = z.object({
  platform: PlatformSchema,
  platformVideoId: z.string().min(1),
  hypothesis: HypothesisTagSchema,
});

export type HypothesisTagMap = Map<string, HypothesisTag>;

const key = (platform: string, videoId: string): string =>
  `${platform}:${videoId}`;

/**
 * Loads the owner-maintained tag map (§ hypothesis rule: tags are NEVER
 * inferred by code). Invalid rows fail the whole load — loud, not silent.
 * A missing file means "no tags yet" and is fine.
 */
export async function loadHypothesisTags(
  filePath = 'data/hypothesis-tags.csv'
): Promise<HypothesisTagMap> {
  let raw: string;
  try {
    raw = await readFile(resolve(filePath), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Map();
    throw error;
  }

  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

  const map: HypothesisTagMap = new Map();
  for (const [index, line] of lines.entries()) {
    if (index === 0) {
      if (line !== 'platform,platform_video_id,hypothesis') {
        throw new Error(
          `hypothesis-tags.csv: unexpected header '${line}' — expected 'platform,platform_video_id,hypothesis'`
        );
      }
      continue;
    }
    const parts = line.split(',').map((part) => part.trim());
    if (parts.length !== 3) {
      throw new Error(
        `hypothesis-tags.csv line ${index + 1}: expected 3 columns, got ${parts.length}`
      );
    }
    const row = RowSchema.parse({
      platform: parts[0],
      platformVideoId: parts[1],
      hypothesis: parts[2],
    });
    const mapKey = key(row.platform, row.platformVideoId);
    if (map.has(mapKey)) {
      throw new Error(
        `hypothesis-tags.csv line ${index + 1}: duplicate entry for ${mapKey}`
      );
    }
    map.set(mapKey, row.hypothesis);
  }
  return map;
}

/** Null when untagged — never guessed (locked decision, 2026-08-18). */
export function tagFor(
  map: HypothesisTagMap,
  platform: string,
  platformVideoId: string
): HypothesisTag | null {
  return map.get(key(platform, platformVideoId)) ?? null;
}