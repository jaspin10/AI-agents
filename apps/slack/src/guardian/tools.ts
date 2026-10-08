import { z } from 'zod';
import type { ToolDefinition } from '@platform/shared';
import { createPortalCall } from './portal.js';
import { createGitHubRequester } from './github.js';
import type { GuardianConfig } from './config.js';

/**
 * Guardian's tools, registered on the orchestrator so every call is checked
 * against the calling agent's allowedTools and written to agent_logs.
 *   guardian.portal       - the portal guardian-incidents function (both agents)
 *   guardian.github_read  - GET only on the portal repo (both agents)
 *   guardian.github_write - non-GET on the portal repo (guardian-repairer ONLY)
 */
export const PORTAL_TOOL = 'guardian.portal';
export const GITHUB_READ_TOOL = 'guardian.github_read';
export const GITHUB_WRITE_TOOL = 'guardian.github_write';

const PortalInput = z.object({ action: z.string().min(1), body: z.record(z.string(), z.unknown()) });
const GitHubInput = z.object({ method: z.string().min(1), path: z.string().min(1), body: z.unknown().optional() });

export function guardianTools(config: GuardianConfig): ToolDefinition[] {
  const portal = createPortalCall(config.portalUrl, config.sharedSecret);
  const github = createGitHubRequester(config.githubToken, config.repoOwner, config.repoName);
  return [
    {
      name: PORTAL_TOOL,
      description: 'Portal guardian-incidents function (incidents, repairs, AI meter, notices).',
      inputSchema: PortalInput,
      outputSchema: z.unknown(),
      async execute(input) {
        const parsed = PortalInput.parse(input);
        return portal(parsed.action, parsed.body);
      },
    },
    {
      name: GITHUB_READ_TOOL,
      description: 'Read-only GitHub REST on the portal repo.',
      inputSchema: GitHubInput,
      outputSchema: z.unknown(),
      async execute(input) {
        const parsed = GitHubInput.parse(input);
        if (parsed.method !== 'GET') throw new Error('guardian.github_read only allows GET');
        return github('GET', parsed.path);
      },
    },
    {
      name: GITHUB_WRITE_TOOL,
      description: 'Branch/commit/PR/merge on the portal repo. Never a direct push to the base branch.',
      inputSchema: GitHubInput,
      outputSchema: z.unknown(),
      async execute(input) {
        const parsed = GitHubInput.parse(input);
        if (parsed.method === 'GET') throw new Error('use guardian.github_read for GET');
        // Contents writes must name a branch, and never the base branch.
        if (parsed.path.startsWith('/contents/')) {
          const branch = typeof parsed.body === 'object' && parsed.body !== null ? (parsed.body as { branch?: unknown }).branch : undefined;
          if (typeof branch !== 'string' || branch === '' || branch === config.baseBranch) {
            throw new Error('Guardian may only write files on its own branch, never on the base branch');
          }
        }
        if (parsed.path.startsWith('/git/refs') && parsed.method !== 'POST') {
          throw new Error('Guardian may only create refs, never move or delete them');
        }
        return github(parsed.method, parsed.path, parsed.body);
      },
    },
  ];
}
