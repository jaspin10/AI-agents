import type { Logger } from '@platform/shared';
import { classifyRepair, type Classification, type ProposedEdit } from './classify.js';
import { applyEdits, describeEdits } from './edits.js';
import { GitHub } from './github.js';
import { BudgetExhaustedError, type GuardianLlm } from './llm.js';
import type { Incident, Portal, Repair } from './portal.js';
import { InvestigationSchema, PROMPT_VERSION, RepairPlanSchema, investigationSystem, investigationUser, repairSystem, repairUser, type Investigation } from './prompts.js';
import { decideWatch } from './revert.js';
import { decideMergeGate } from './gate.js';
import { extractJson } from './untrusted.js';
import type { GuardianMode } from './config.js';

/**
 * The Guardian pipeline (docs/spec/guardian.md). One tick:
 *   1. merge repairs Jas approved in the Error Inbox            (auto mode)
 *   2. watch merged repairs for 2h, auto-revert per the locked rule (auto mode)
 *   3. investigate TRIGGERED incidents (both modes); in auto mode also propose a
 *      repair: small -> auto-merge, big -> PR waiting for Approve, blocked -> Jas
 * Each step is isolated: one failure never stops the others.
 */

export interface WorkflowDeps {
  mode: GuardianMode;
  portal: Portal;
  github: GitHub;
  llm: GuardianLlm;
  logger: Logger;
  model: string;
  watchMs: number;
  maxIncidents: number;
  now: () => number;
}

const MAX_FILE_CHARS = 60000;
const MAX_TOTAL_CHARS = 150000;
const READABLE = /^(src|api|supabase\/functions|lib|public)\//;
const NEVER_READ = /(^|\/)(\.env|node_modules\/|dist\/)|\.(png|jpe?g|gif|webp|ico|svg|mp3|mp4|webm|woff2?|pdf|zip|lock)$/i;

export interface TickResult {
  approvedMerged: number;
  watched: number;
  reverted: number;
  investigated: number;
  repairs: number;
  notes: string[];
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

/** WhatsApp template params cannot contain newlines/tabs or long runs of spaces. */
export function noticeText(text: string): string {
  return text.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 600);
}

export async function runTick(deps: WorkflowDeps): Promise<TickResult> {
  const result: TickResult = { approvedMerged: 0, watched: 0, reverted: 0, investigated: 0, repairs: 0, notes: [] };
  if (deps.mode === 'off') return result;

  if (deps.mode === 'auto') {
    await step(deps, result, 'merge approved', async () => {
      for (const repair of await deps.portal.listRepairs(['approved'])) {
        await mergeRepair(deps, repair, repair.size === 'small' ? 'small fix, merged automatically after the Vercel build passed' : 'approved by Jas, Vercel build passed');
        result.approvedMerged += 1;
      }
    });
    await step(deps, result, 'watch merged', async () => {
      for (const repair of await deps.portal.listRepairs(['merged'])) {
        result.watched += 1;
        if (await watchRepair(deps, repair)) result.reverted += 1;
      }
    });
  }

  await step(deps, result, 'investigate', async () => {
    const incidents = await deps.portal.listIncidents(['TRIGGERED'], deps.maxIncidents);
    for (const incident of incidents) {
      const outcome = await handleIncident(deps, incident);
      result.investigated += 1;
      if (outcome === 'repair') result.repairs += 1;
      if (outcome === 'budget') {
        result.notes.push('AI budget reached - investigations wait until next month or a higher cap');
        break;
      }
    }
  });

  return result;
}

async function step(deps: WorkflowDeps, result: TickResult, name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deps.logger.error(`guardian step '${name}' failed: ${message}`);
    result.notes.push(`${name} failed: ${message.slice(0, 200)}`);
  }
}

// ---------------------------------------------------------------- investigate

type IncidentOutcome = 'diagnosed' | 'repair' | 'blocked' | 'declined' | 'failed' | 'budget';

async function handleIncident(deps: WorkflowDeps, incident: Incident): Promise<IncidentOutcome> {
  const { portal } = deps;
  await portal.updateStatus(incident.id, 'INVESTIGATING', 'Guardian started investigating.');

  let investigation: Investigation;
  let paths: string[];
  let detail: Awaited<ReturnType<Portal['getIncident']>>;
  try {
    detail = await portal.getIncident(incident.id);
    paths = (await deps.github.listPaths()).filter((p) => READABLE.test(p) && !NEVER_READ.test(p));
    const reply = await deps.llm.complete({
      purpose: 'investigate',
      incidentId: incident.id,
      system: investigationSystem(),
      user: investigationUser(detail.incident, detail.occurrences, detail.timeline, paths),
      maxTokens: 2000,
    });
    investigation = InvestigationSchema.parse(extractJson(reply));
  } catch (error) {
    return failBack(deps, incident, error);
  }

  // Read the files the investigation asked for (only real, readable paths).
  const wanted = investigation.files_to_read.filter((p) => paths.includes(p));
  const files: Array<{ path: string; text: string; sha: string; commits: unknown }> = [];
  let total = 0;
  for (const path of wanted) {
    const file = await deps.github.readFile(path);
    if (file === null || file.text.length > MAX_FILE_CHARS || total + file.text.length > MAX_TOTAL_CHARS) continue;
    total += file.text.length;
    files.push({ path, text: file.text, sha: file.sha, commits: await deps.github.recentCommits(path, 5) });
  }

  const record: Record<string, unknown> = { ...investigation, files_read: files.map((f) => f.path), model: deps.model, prompt_version: PROMPT_VERSION, investigated_at: iso(deps.now()) };
  const canRepair = deps.mode === 'auto' && investigation.real_defect && investigation.confidence !== 'low' && files.length > 0;

  if (!canRepair) {
    const why = deps.mode !== 'auto'
      ? 'Investigation only (GUARDIAN_MODE is not auto).'
      : !investigation.real_defect ? 'Guardian thinks this is not a real defect.'
        : investigation.confidence === 'low' ? 'Guardian is not confident enough to repair.'
          : 'Guardian could not read the files it needed.';
    await portal.writeInvestigation(incident.id, { ...record, repair: { attempted: false, why } }, 'DIAGNOSED', `${investigation.summary_for_jas} ${why}`);
    return 'diagnosed';
  }

  // Ask for the smallest repair.
  let plan;
  try {
    const rules = (await deps.github.readFile('CLAUDE.md'))?.text ?? '';
    const reply = await deps.llm.complete({
      purpose: 'repair',
      incidentId: incident.id,
      system: repairSystem(rules),
      user: repairUser(detail.incident, investigation, files),
      maxTokens: 4000,
    });
    plan = RepairPlanSchema.parse(extractJson(reply));
  } catch (error) {
    return failBack(deps, incident, error, record);
  }

  if (!plan.can_fix || plan.edits.length === 0) {
    await portal.writeInvestigation(incident.id, { ...record, repair: { attempted: true, declined: plan.reason } }, 'DIAGNOSED', `${investigation.summary_for_jas} No safe automatic fix: ${plan.reason}`);
    return 'declined';
  }

  const edits: ProposedEdit[] = plan.edits.map((e) => ({ path: e.path, oldStr: e.old_str, newStr: e.new_str }));
  const classification = classifyRepair(edits, {
    feature: incident.feature ?? '',
    operation: incident.operation ?? '',
    route: incident.route ?? '',
    severity: incident.severity ?? '',
  }, investigation.blocks_class_or_homework);

  let updated: Map<string, string>;
  try {
    updated = applyEdits(new Map(files.map((f) => [f.path, f.text])), edits);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await portal.writeInvestigation(incident.id, { ...record, repair: { attempted: true, failed: message } }, 'DIAGNOSED', `${investigation.summary_for_jas} The proposed fix could not be applied safely (${message}).`);
    return 'failed';
  }

  if (classification.size === 'blocked') {
    await portal.writeInvestigation(incident.id, { ...record, repair: { attempted: true, blocked: classification.reasons, summary: plan.summary } }, 'DIAGNOSED', `${investigation.summary_for_jas} Guardian will not change this by itself: ${classification.reasons.join('; ')}.`);
    await portal.notify('guardian_repair_blocked', incident.id, noticeText(`Guardian found a fix it is not allowed to make by itself (${classification.reasons.join('; ')}). Jas, please look at incident ${shortId(incident.id)} in the Error Inbox.`), 'owner', false);
    return 'blocked';
  }

  await portal.writeInvestigation(incident.id, { ...record, repair: { attempted: true, summary: plan.summary, size: classification.size, reasons: classification.reasons } }, 'REPAIRING', `${investigation.summary_for_jas} Fix: ${plan.summary}`);
  await openRepairPr(deps, incident, investigation, plan.summary, edits, files, updated, classification);
  return 'repair';
}

async function failBack(deps: WorkflowDeps, incident: Incident, error: unknown, record?: Record<string, unknown>): Promise<IncidentOutcome> {
  if (error instanceof BudgetExhaustedError) {
    // Put it back in the queue; it will be picked up when budget allows.
    await deps.portal.updateStatus(incident.id, 'TRIGGERED', `Waiting: ${error.message}.`);
    return 'budget';
  }
  const message = error instanceof Error ? error.message : String(error);
  deps.logger.warn(`guardian incident ${shortId(incident.id)} failed: ${message}`);
  if (record !== undefined) {
    await deps.portal.writeInvestigation(incident.id, { ...record, repair: { attempted: true, failed: message.slice(0, 300) } }, 'DIAGNOSED', `Guardian diagnosed this but the repair step failed: ${message.slice(0, 200)}`);
  } else {
    await deps.portal.updateStatus(incident.id, 'FAILED', `Guardian investigation failed: ${message.slice(0, 300)}`);
  }
  return 'failed';
}

// ---------------------------------------------------------------- repair PR

async function openRepairPr(
  deps: WorkflowDeps,
  incident: Incident,
  investigation: Investigation,
  summary: string,
  edits: ProposedEdit[],
  files: Array<{ path: string; sha: string }>,
  updated: Map<string, string>,
  classification: Classification,
): Promise<void> {
  const { github, portal } = deps;
  const branch = `guardian/${shortId(incident.id)}-${deps.now().toString(36)}`;
  await github.createBranch(branch, await github.headSha());
  for (const file of files) {
    const text = updated.get(file.path);
    if (text === undefined) continue;
    const original = edits.some((e) => e.path === file.path);
    if (!original) continue;
    await github.writeFile(branch, file.path, text, `guardian: ${summary}`.slice(0, 120), file.sha);
  }

  const body = [
    `Automatic repair by **Portal Guardian** for incident \`${shortId(incident.id)}\` (${incident.feature ?? '?'} / ${incident.operation ?? '?'}).`,
    '',
    `**Size:** ${classification.size === 'big' ? 'BIG - waits for Jas to press Approve in the Error Inbox' : 'small - merges automatically, watched for 2 hours, auto-reverted if errors rise'}`,
    `**Why:** ${classification.reasons.join('; ')}`,
    '',
    `**Fix:** ${summary}`,
    '',
    '### Investigation (hypothesis until verified)',
    `- Root cause: ${investigation.root_cause}`,
    `- Component: ${investigation.component}`,
    `- Recent change: ${investigation.recent_change}`,
    `- Regression test that would catch it: ${investigation.regression_test}`,
    `- Confidence: ${investigation.confidence}`,
    '',
    '### Change',
    describeEdits(edits),
    '',
    'Rules: docs/spec/guardian.md (auto-repair rules, locked 2026-10-02 / 2026-10-08). Do not edit this branch by hand; reject in the Error Inbox instead.',
  ].join('\n');
  const pr = await github.openPr(branch, `guardian: ${summary}`.slice(0, 120), body);

  if (classification.size === 'big') {
    await portal.createRepair({ incident_id: incident.id, size: 'big', big_reasons: classification.reasons, summary, branch, pr_number: pr.number, pr_url: pr.url, status: 'awaiting_approval' });
    await portal.updateStatus(incident.id, 'AWAITING_APPROVAL', `Big fix waiting for Approve: ${pr.url}`);
    await portal.notify('guardian_awaiting_approval', incident.id, noticeText(`a big fix is waiting for Jas to approve in the Error Inbox (${summary})`), 'owner', true);
    return;
  }

  const repair = await portal.createRepair({ incident_id: incident.id, size: 'small', big_reasons: [], summary, branch, pr_number: pr.number, pr_url: pr.url, status: 'approved' });
  // Usually returns at once: the Vercel build has only just started. The next tick merges it.
  await mergeRepair(deps, repair, 'small fix, merged automatically after the Vercel build passed');
}

async function mergeRepair(deps: WorkflowDeps, repair: Repair, why: string): Promise<void> {
  const { github, portal } = deps;
  if (repair.pr_number === null) {
    await portal.updateRepair(repair.id, { status: 'failed', error: 'no PR number' });
    return;
  }
  const mergedAt = deps.now();
  let sha: string;
  try {
    const state = await github.prState(repair.pr_number);
    if (state.merged && state.mergeSha !== null) {
      sha = state.mergeSha;
    } else if (state.state !== 'open') {
      await portal.updateRepair(repair.id, { status: 'rejected', error: 'PR was closed on GitHub' });
      await portal.updateStatus(repair.incident_id, 'DIAGNOSED', 'Repair PR was closed on GitHub; not merged.');
      return;
    } else {
      // Build gate (2026-10-08): merge only after Vercel's preview build passed.
      let statuses: Array<{ context: string; state: string }>;
      try {
        statuses = await github.commitStatuses(state.headSha);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`could not read the Vercel build result (the GitHub token needs "Commit statuses: Read"): ${message.slice(0, 120)}`);
      }
      const gate = decideMergeGate(statuses, deps.now() - Date.parse(state.createdAt));
      if (gate.action === 'wait') return; // stays 'approved'; the next tick checks again
      if (gate.action === 'fail') {
        await github.closePr(repair.pr_number);
        await portal.updateRepair(repair.id, { status: 'failed', error: `not merged: ${gate.reason}` });
        await portal.updateStatus(repair.incident_id, 'DIAGNOSED', `Fix not published: ${gate.reason}. The PR was closed.`);
        await portal.notify('guardian_build_failed', repair.id, noticeText(`a fix was NOT published because ${gate.reason} (${repair.summary}). Nothing changed on the portal`), 'owner', true);
        return;
      }
      sha = await github.mergePr(repair.pr_number, `guardian: ${repair.summary}`.slice(0, 120));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await portal.updateRepair(repair.id, { status: 'failed', error: message.slice(0, 500) });
    await portal.updateStatus(repair.incident_id, 'FAILED', `Merge failed: ${message.slice(0, 200)}`);
    await portal.notify('guardian_merge_failed', repair.id, noticeText(`a fix could not be published (${repair.summary}). Jas, please check the Error Inbox.`), 'owner', false);
    return;
  }

  const before = await portal.errorCounts(repair.incident_id, iso(mergedAt - deps.watchMs), iso(mergedAt));
  await portal.updateRepair(repair.id, { status: 'merged', merge_sha: sha, merged_at: iso(mergedAt), watch_until: iso(mergedAt + deps.watchMs), before_errors: before.total });
  await portal.updateStatus(repair.incident_id, 'MONITORING', `Merged (${why}). Watching for 2 hours.`, repair.pr_url ?? undefined);
  await portal.notify('guardian_merged', repair.id, noticeText(`a ${repair.size} fix was published (${repair.summary}). Guardian is watching it for 2 hours`), 'owner_and_sales', true);
}

// ---------------------------------------------------------------- watch + revert

/** Returns true when the repair was reverted. */
async function watchRepair(deps: WorkflowDeps, repair: Repair): Promise<boolean> {
  const { portal } = deps;
  if (repair.merged_at === null || repair.watch_until === null) return false;
  const mergedAt = Date.parse(repair.merged_at);
  const now = deps.now();
  const since = await portal.errorCounts(repair.incident_id, repair.merged_at, iso(now));
  const decision = decideWatch({ sameSinceMerge: since.same, totalSinceMerge: since.total, totalBeforeMerge: repair.before_errors ?? 0 }, now, Date.parse(repair.watch_until));

  if (decision.action === 'wait') return false;
  if (decision.action === 'keep') {
    await portal.updateRepair(repair.id, { status: 'kept' });
    await portal.updateStatus(repair.incident_id, 'FIXED', `No new errors in the 2 hours after the merge (${Math.round((now - mergedAt) / 60000)} min watched).`, repair.pr_url ?? undefined);
    return false;
  }
  await revertRepair(deps, repair, decision.reason);
  return true;
}

async function revertRepair(deps: WorkflowDeps, repair: Repair, reason: string): Promise<void> {
  const { github, portal } = deps;
  if (repair.merge_sha === null) return;
  try {
    const commit = await github.commitInfo(repair.merge_sha);
    // Safety: only auto-revert when nobody changed the same files since the fix.
    for (const file of commit.files) {
      const nowAt = await github.readFile(file.filename);
      const atFix = await github.readFile(file.filename, repair.merge_sha);
      if ((nowAt?.sha ?? null) !== (atFix?.sha ?? null)) {
        throw new Error(`${file.filename} changed again after the fix, so an automatic undo could lose other work`);
      }
    }
    const branch = `guardian/revert-${shortId(repair.id)}-${deps.now().toString(36)}`;
    await github.createBranch(branch, await github.headSha());
    for (const file of commit.files) {
      const current = await github.readFile(file.filename, branch);
      const previous = await github.readFile(file.previous_filename ?? file.filename, commit.parent);
      if (previous === null) {
        if (current !== null) await github.deleteFile(branch, file.filename, `guardian: undo ${repair.summary}`.slice(0, 120), current.sha);
      } else {
        await github.writeFile(branch, file.filename, previous.text, `guardian: undo ${repair.summary}`.slice(0, 120), current?.sha ?? null);
      }
    }
    const pr = await github.openPr(branch, `guardian: undo "${repair.summary}"`.slice(0, 120), `Automatic undo of ${repair.pr_url ?? 'a Guardian fix'}.\n\n**Reason:** ${reason}\n\nRule: docs/spec/guardian.md, auto-revert rule (locked 2026-10-08).`);
    await github.mergePr(pr.number, `guardian: undo ${repair.summary}`.slice(0, 120));
    await portal.updateRepair(repair.id, { status: 'reverted', revert_pr_url: pr.url, revert_reason: reason, reverted_at: iso(deps.now()) });
    await portal.updateStatus(repair.incident_id, 'FAILED', `Fix undone automatically: ${reason}. ${pr.url}`);
    await portal.notify('guardian_reverted', repair.id, noticeText(`a fix was undone automatically because ${reason} (${repair.summary})`), 'owner_and_sales', true);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await portal.updateRepair(repair.id, { status: 'failed', error: `revert needed but not done: ${message}`.slice(0, 500), revert_reason: reason });
    await portal.updateStatus(repair.incident_id, 'FAILED', `Fix should be undone (${reason}) but Guardian could not do it safely: ${message.slice(0, 200)}`);
    await portal.notify('guardian_revert_needed', repair.id, noticeText(`a fix should be undone (${reason}) but Guardian could not do it safely. Jas, please undo ${repair.pr_url ?? 'it'} by hand`), 'owner_and_sales', true);
  }
}
