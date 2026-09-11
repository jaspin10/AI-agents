import { ContractViolationError, PlatformError } from '@platform/shared';

/** §6 hard spend cap: refused runs carry this stable code in agent_logs. */
export class LlmCapExceededError extends PlatformError {
  constructor(used: number, cap: number, month: string) {
    super(
      'LLM_CAP_EXCEEDED',
      `LLM monthly cap reached for ${month}: ${used} tokens used, cap is ${cap} (LLM_MONTHLY_CAP). ` +
        'Run refused. Raise the cap or wait for the next month.'
    );
  }
}

/** Total tokens (input+output) allowed per UTC month. Unset/empty = no cap. */
export function readMonthlyCap(): number | null {
  const raw = process.env['LLM_MONTHLY_CAP'];
  if (raw === undefined || raw.trim() === '') return null;
  const cap = Number(raw);
  if (!Number.isFinite(cap) || cap <= 0) {
    throw new ContractViolationError(
      `LLM_MONTHLY_CAP must be a positive number of tokens, got '${raw}'.`
    );
  }
  return cap;
}
