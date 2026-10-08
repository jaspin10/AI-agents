import type { ProposedEdit } from './classify.js';

/**
 * Applies search/replace edits to file contents. Each oldStr must occur EXACTLY
 * once in the file as it stands after the previous edits, otherwise the whole
 * repair is refused - Guardian never guesses where a change goes.
 */
export function applyEdits(files: Map<string, string>, edits: ProposedEdit[]): Map<string, string> {
  const out = new Map(files);
  for (const edit of edits) {
    const current = out.get(edit.path);
    if (current === undefined) {
      throw new Error(`edit targets a file Guardian did not read: ${edit.path}`);
    }
    if (edit.oldStr === '') throw new Error(`empty search text for ${edit.path}`);
    const first = current.indexOf(edit.oldStr);
    if (first < 0) throw new Error(`search text not found in ${edit.path}`);
    if (current.indexOf(edit.oldStr, first + 1) >= 0) throw new Error(`search text is not unique in ${edit.path}`);
    out.set(edit.path, current.slice(0, first) + edit.newStr + current.slice(first + edit.oldStr.length));
  }
  return out;
}

/** Small readable diff for PR bodies (not a real unified diff). */
export function describeEdits(edits: ProposedEdit[]): string {
  return edits
    .map((e) => {
      const before = e.oldStr.split('\n').map((l) => `- ${l}`).join('\n');
      const after = e.newStr.split('\n').map((l) => `+ ${l}`).join('\n');
      return `**${e.path}**\n\n\`\`\`diff\n${before}\n${after}\n\`\`\``;
    })
    .join('\n\n');
}
