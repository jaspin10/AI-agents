import { z } from 'zod';

/** Allowlisted diagnostics only. Provider messages may contain prompts or keys. */
export function briefFailure(error: unknown): {code:string; message:string} {
 const e=error instanceof Error?error:null;
 const status=typeof error==='object'&&error!==null&&'status' in error?error.status:null;
 if(e?.message==='LLM key or positive budget unavailable')return {code:'generation_not_configured',message:'AI generation is not configured. Ask Jas to check the model key and budget settings.'};
 if(e?.message==='LLM budget unavailable or exhausted; no call made')return {code:'generation_budget_unavailable',message:'The AI budget could not authorize this call. Ask Jas to check the budget and reservation service; do not keep retrying.'};
 if(e?.message==='LLM accounting unavailable; reservation retained')return {code:'generation_accounting_unavailable',message:'AI usage could not be recorded. Ask Jas to check accounting before trying again.'};
 if(e?.message==='brand_checks_unavailable')return {code:'generation_brand_unavailable',message:'Required brand rules are missing. Ask Jas to restore them; checks cannot be skipped.'};
 if(status===401||status===403)return {code:'generation_provider_auth',message:'The AI provider rejected access. Ask Jas to check the provider configuration.'};
 if(status===429)return {code:'generation_rate_limited',message:'The AI provider is limiting requests. Wait before trying again; ask Jas if it continues.'};
 if(e?.name==='APIConnectionTimeoutError'||e?.name==='TimeoutError')return {code:'generation_timeout',message:'The AI request timed out. Your saved brief is unchanged. Check the job status before retrying.'};
 if(error instanceof SyntaxError||error instanceof z.ZodError||['invalid_evidence_reference','beat_outside_duration'].includes(e?.message??''))return {code:'generation_invalid_output',message:'The AI returned an invalid or incomplete response. No new revision was saved. You can try once more; ask Jas if it repeats.'};
 return {code:'generation_failed',message:'AI generation or its checks failed. Your saved brief is unchanged. Send Jas the request ID shown below.'};
}
