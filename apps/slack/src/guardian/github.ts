/**
 * Minimal GitHub REST client for the portal repo, using the fine-grained token
 * "guardian-repair" (Contents RW, Pull requests RW, Metadata R, portal repo only).
 * Guardian never pushes to the base branch directly: every change is a branch,
 * a PR, then a squash merge (automatic for small fixes, after Approve for big).
 */

export interface RepoRef {
  owner: string;
  repo: string;
  base: string;
}

export interface ChangedFile {
  filename: string;
  status: string;
  previous_filename?: string;
}

export class GitHubError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'GitHubError';
  }
}

function b64encode(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64');
}

function b64decode(text: string): string {
  return Buffer.from(text.replace(/\n/g, ''), 'base64').toString('utf8');
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

export type GitHubRequester = (method: string, path: string, body?: unknown) => Promise<unknown>;

/** Raw REST requester, scoped to ONE repo. Wrapped as orchestrator tools in tools.ts. */
export function createGitHubRequester(token: string, owner: string, repo: string): GitHubRequester {
  return async function request(method, path, body) {
    if (!path.startsWith('/')) throw new Error('GitHub path must start with /');
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'content-type': 'application/json',
        'user-agent': 'portal-guardian',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) throw new GitHubError(response.status, `GitHub ${method} ${path} -> ${response.status}: ${text.slice(0, 200)}`);
    return text === '' ? null : JSON.parse(text);
  };
}

export class GitHub {
  constructor(private readonly request: GitHubRequester, private readonly ref: RepoRef) {}

  async headSha(branch: string = this.ref.base): Promise<string> {
    const out = (await this.request('GET', `/git/ref/heads/${encodePath(branch)}`)) as { object: { sha: string } };
    return out.object.sha;
  }

  async listPaths(): Promise<string[]> {
    const sha = await this.headSha();
    const out = (await this.request('GET', `/git/trees/${sha}?recursive=1`)) as { tree: Array<{ path: string; type: string; size?: number }> };
    return out.tree.filter((e) => e.type === 'blob').map((e) => e.path);
  }

  /** File text + blob sha at a ref, or null if the file does not exist there. */
  async readFile(path: string, ref: string = this.ref.base): Promise<{ text: string; sha: string } | null> {
    try {
      const out = (await this.request('GET', `/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`)) as { content?: string; sha: string; type: string };
      if (out.type !== 'file' || out.content === undefined) return null;
      return { text: b64decode(out.content), sha: out.sha };
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) return null;
      throw error;
    }
  }

  async recentCommits(path: string, count: number): Promise<Array<{ sha: string; message: string; date: string }>> {
    const out = (await this.request('GET', `/commits?sha=${encodeURIComponent(this.ref.base)}&path=${encodeURIComponent(path)}&per_page=${count}`)) as Array<{ sha: string; commit: { message: string; author?: { date?: string } } }>;
    return out.map((c) => ({ sha: c.sha.slice(0, 7), message: c.commit.message.split('\n')[0] ?? '', date: c.commit.author?.date ?? '' }));
  }

  async createBranch(name: string, fromSha: string): Promise<void> {
    await this.request('POST', '/git/refs', { ref: `refs/heads/${name}`, sha: fromSha });
  }

  async writeFile(branch: string, path: string, text: string, message: string, sha: string | null): Promise<void> {
    const body: Record<string, unknown> = { message, content: b64encode(text), branch };
    if (sha !== null) body['sha'] = sha;
    await this.request('PUT', `/contents/${encodePath(path)}`, body);
  }

  async deleteFile(branch: string, path: string, message: string, sha: string): Promise<void> {
    await this.request('DELETE', `/contents/${encodePath(path)}`, { message, sha, branch });
  }

  async openPr(head: string, title: string, body: string): Promise<{ number: number; url: string }> {
    const out = (await this.request('POST', '/pulls', { head, base: this.ref.base, title, body })) as { number: number; html_url: string };
    return { number: out.number, url: out.html_url };
  }

  async commentPr(number: number, body: string): Promise<void> {
    await this.request('POST', `/issues/${number}/comments`, { body });
  }

  async closePr(number: number): Promise<void> {
    await this.request('PATCH', `/pulls/${number}`, { state: 'closed' });
  }

  async prState(number: number): Promise<{ state: string; merged: boolean; mergeSha: string | null }> {
    const out = (await this.request('GET', `/pulls/${number}`)) as { state: string; merged: boolean; merge_commit_sha: string | null };
    return { state: out.state, merged: out.merged, mergeSha: out.merge_commit_sha };
  }

  /** Squash-merge; returns the merge commit sha. */
  async mergePr(number: number, title: string): Promise<string> {
    const out = (await this.request('PUT', `/pulls/${number}/merge`, { merge_method: 'squash', commit_title: title })) as { sha: string; merged: boolean };
    if (!out.merged) throw new Error(`PR #${number} did not merge`);
    return out.sha;
  }

  async commitInfo(sha: string): Promise<{ parent: string; files: ChangedFile[] }> {
    const out = (await this.request('GET', `/commits/${sha}`)) as { parents: Array<{ sha: string }>; files?: ChangedFile[] };
    const parent = out.parents[0]?.sha;
    if (parent === undefined) throw new Error(`commit ${sha} has no parent`);
    return { parent, files: out.files ?? [] };
  }
}
