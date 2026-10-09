/**
 * Small / big / blocked classification of a proposed repair.
 * Rules locked by Jas 2026-10-08 (docs/spec/guardian.md, "What counts as big").
 *
 * Pure function, no I/O, so it is fully unit-tested. It errs towards "big":
 * a false "big" only costs Jas one click; a false "small" ships unreviewed code.
 */

export interface ProposedEdit {
  path: string;
  oldStr: string;
  newStr: string;
}

export interface IncidentFacts {
  feature: string;
  operation: string;
  route: string;
  severity: string;
}

export interface Classification {
  size: 'small' | 'big' | 'blocked';
  /** Plain-language reasons, shown in the PR, the Error Inbox and notices. */
  reasons: string[];
}

interface Rule {
  reason: string;
  path?: RegExp;
  text?: RegExp;
}

/**
 * HARD WALL - never auto-repaired, never even opened as a PR by Guardian.
 * The WhatsApp bot's role and permission rules may only be changed by Jas by hand,
 * and Guardian never touches build/deploy plumbing or secrets.
 */
const WALL: Rule[] = [
  { reason: 'touches the WhatsApp bot or its role/permission rules (only Jas may change these)', path: /whatsapp/i },
  { reason: 'touches the WhatsApp bot or its role/permission rules (only Jas may change these)', text: /whatsapp_people|whatsapp_messages/i },
  { reason: 'touches build, deploy or dependency files', path: /(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|vercel\.json|railway\.json|vite\.config\.[cm]?[jt]s)$/i },
  { reason: 'touches CI or repository settings', path: /^\.github\// },
  { reason: 'touches secrets or environment files', path: /(^|\/)\.env/i },
  { reason: 'touches the repository rules or Guardian itself', path: /(^|\/)(CLAUDE\.md|AGENTS\.md)$|guardian/i },
];

/** BIG - opens a PR that waits for Jas's Approve in the Error Inbox. */
const BIG: Rule[] = [
  // login / sign-up
  { reason: 'touches login or sign-up', path: /auth|login|signup|sign-up|register|registration|claim/i },
  { reason: 'touches login or sign-up', text: /supabase\.auth|signIn|signUp|signOut|claim_enrollment|password|magic.?link|oauth/i },
  // who can see what
  { reason: 'changes who can see what (roles, access, permissions)', path: /access|viewAs|App\.jsx$|AppShell|routes?\b|policy|rls/i },
  { reason: 'changes who can see what (roles, access, permissions)', text: /\brole\b|is_owner|is_teacher|is_sales|is_teacher_15|is_staff|access_status|permission|ownerRoutes|isOwner|row level security|create policy|alter policy|grant |revoke /i },
  // payments
  { reason: 'touches payments (Stripe, Interac, prices)', path: /stripe|checkout|payment|pay|offer|price|billing|webhook|interac/i },
  { reason: 'touches payments (Stripe, Interac, prices)', text: /stripe|checkout|interac|price|plan_amount|amount_|payment|invoice|subscription/i },
  // database structure / student data
  { reason: 'changes the database structure (migration)', path: /supabase\/migrations\/|\.sql$/i },
  { reason: 'changes the database structure (migration)', text: /\b(create|alter|drop|truncate)\s+(table|function|index|trigger|view|type|policy|schema)\b/i },
  { reason: 'deletes or edits student data', text: /\.(delete|update|upsert)\s*\(|\bdelete\s+from\b|\bupdate\s+\w+\s+set\b|\binsert\s+into\s+profiles\b/i },
  // anti-fraud (2026-10-08)
  { reason: 'touches licenses, access dates, free access, discounts or refunds (anti-fraud)', path: /licen[cs]e|discount|refund|coupon|renewal|expir|unlock|plan/i },
  { reason: 'touches licenses, access dates, free access, discounts or refunds (anti-fraud)', text: /plan_end|plan_start|start_date|first_monday|licen[cs]e|expir|extend|free|discount|refund|coupon|access_until|unlock|grant|trial|is_locked|batch_id/i },
];

/** An error that stops a class or homework from working is always big. */
const CLASS_OR_HOMEWORK = /homework|submission|submit|drill|class|live|lesson|level1|level15|exercise|challenge|listening|writing|speak|record|transcri|meet|room/i;

/**
 * A change a staff member asked for on WhatsApp (operation `change_request`, built 2026-10-09,
 * Jas: "do both"). Always big: it is new behaviour, not a repair, so Jas must see it first.
 * The hard wall above still applies to it.
 */
export const STAFF_REQUEST_REASON = 'a staff change request from WhatsApp (always waits for Jas)';

/** Changes bigger than this are big no matter what they touch. */
export const MAX_SMALL_FILES = 3;
export const MAX_SMALL_CHANGED_LINES = 60;

function lineCount(text: string): number {
  return text === '' ? 0 : text.split('\n').length;
}

function addUnique(list: string[], reason: string): void {
  if (!list.includes(reason)) list.push(reason);
}

export function classifyRepair(edits: ProposedEdit[], incident: IncidentFacts, modelSaysBlocksClassOrHomework: boolean): Classification {
  const blocked: string[] = [];
  const big: string[] = [];

  if (edits.length === 0) {
    return { size: 'blocked', reasons: ['the proposed repair changes nothing'] };
  }

  for (const edit of edits) {
    const changedText = `${edit.oldStr}\n${edit.newStr}`;
    for (const rule of WALL) {
      if ((rule.path && rule.path.test(edit.path)) || (rule.text && rule.text.test(changedText))) addUnique(blocked, rule.reason);
    }
    for (const rule of BIG) {
      if ((rule.path && rule.path.test(edit.path)) || (rule.text && rule.text.test(changedText))) addUnique(big, rule.reason);
    }
  }

  if (blocked.length > 0) return { size: 'blocked', reasons: blocked };

  if (incident.operation === 'change_request') addUnique(big, STAFF_REQUEST_REASON);

  const incidentText = `${incident.feature} ${incident.operation} ${incident.route}`;
  if (modelSaysBlocksClassOrHomework || CLASS_OR_HOMEWORK.test(incidentText)) {
    addUnique(big, 'fixes an error that stops a class or homework from working');
  }
  if (incident.severity === 'critical') addUnique(big, 'the error is marked critical');

  const files = new Set(edits.map((e) => e.path)).size;
  const changedLines = edits.reduce((sum, e) => sum + Math.max(lineCount(e.oldStr), lineCount(e.newStr)), 0);
  if (files > MAX_SMALL_FILES || changedLines > MAX_SMALL_CHANGED_LINES) {
    addUnique(big, `large change (${files} files, about ${changedLines} lines)`);
  }

  return big.length > 0 ? { size: 'big', reasons: big } : { size: 'small', reasons: ['none of the "big" rules apply'] };
}
