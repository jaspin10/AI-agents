/**
 * Plain-language notice texts (Error Inbox + learn@ email + WhatsApp portal_notice).
 * Pure functions so they are unit-tested.
 */

/**
 * "Big fix waiting" notice. Carries the fix number so Jas can answer on WhatsApp with
 * "APPROVE a1b2c3d4" / "REJECT a1b2c3d4" (portal function guardian_decide_repair_whatsapp,
 * which accepts the first 4-8 characters of the fix id).
 */
export function awaitingApprovalNotice(summary: string, repairId: string, staffRequest: boolean): string {
  const id = repairId.slice(0, 8);
  const what = staffRequest ? 'a change someone asked for on WhatsApp is ready' : 'a big fix is waiting';
  return `${what} (fix #${id}: ${summary}). Jas, reply APPROVE ${id} or REJECT ${id}, or use the Error Inbox`;
}
