import { setTimeout as sleep } from 'node:timers/promises';
import { PlatformError } from '@platform/shared';

/** Thrown for any non-OK API response after retries are exhausted. */
export class IntegrationHttpError extends PlatformError {
  readonly status: number;
  readonly url: string;

  constructor(url: string, status: number, body: string) {
    super(
      'INTEGRATION_HTTP_ERROR',
      `${status} from ${url}: ${body.slice(0, 300)}`
    );
    this.status = status;
    this.url = url;
  }
}

export interface JsonRequestOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  /** JSON body (POST). Mutually exclusive with form. */
  json?: unknown;
  /** application/x-www-form-urlencoded body (POST) — TikTok/Google token endpoints. */
  form?: Record<string, string>;
  /** Query parameters appended to the URL. */
  query?: Record<string, string | number | undefined>;
  /** Retries on 429 and 5xx. Default 3. */
  retries?: number;
}

/**
 * Read-only fetch wrapper: GET and POST only, where POST is used solely for
 * OAuth token exchanges and read-query endpoints. Retries 429/5xx with
 * exponential backoff; honours Retry-After when present.
 */
export async function requestJson<T>(
  url: string,
  options: JsonRequestOptions = {}
): Promise<T> {
  const retries = options.retries ?? 3;
  const target = new URL(url);
  if (options.query !== undefined) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined) target.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = { ...options.headers };
  let body: string | undefined;
  if (options.json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.json);
  } else if (options.form !== undefined) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(options.form).toString();
  }

  let lastError: IntegrationHttpError | null = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(target, {
      method: options.method ?? 'GET',
      headers,
      body,
    });

    if (response.ok) {
      return (await response.json()) as T;
    }

    const text = await response.text();
    lastError = new IntegrationHttpError(target.toString(), response.status, text);

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === retries) break;

    const retryAfter = Number(response.headers.get('retry-after'));
    const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 500 * 2 ** attempt;
    await sleep(delayMs);
  }

  throw lastError ?? new IntegrationHttpError(target.toString(), 0, 'unknown');
}