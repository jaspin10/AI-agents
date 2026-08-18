import { createHash, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { z } from 'zod';
import { readTikTokConfig } from '../config.js';
import { requestJson } from '../http.js';

const TIKTOK_AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const SCOPES = 'user.info.basic,user.info.profile,user.info.stats,video.list';

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number(),
  refresh_expires_in: z.number(),
  scope: z.string().optional(),
});

export const RefreshResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number(),
});

/** Exchange a refresh token for a fresh access token (used by the sync, Step 8). */
export async function refreshTikTokAccessToken(
  clientKey: string,
  clientSecret: string,
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const raw = await requestJson<unknown>(TIKTOK_TOKEN_URL, {
    method: 'POST',
    form: {
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    },
  });
  const parsed = RefreshResponseSchema.parse(raw);
  return { accessToken: parsed.access_token, refreshToken: parsed.refresh_token };
}

async function main(): Promise<void> {
  const config = readTikTokConfig();
  if (config === null) {
    throw new Error(
      'TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET / TIKTOK_REDIRECT_URI missing from .env'
    );
  }

  // PKCE: TikTok requires code_challenge on the auth request.
  const codeVerifier = randomBytes(32).toString('hex');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('hex');
  const csrfState = randomBytes(16).toString('hex');

  const authUrl = new URL(TIKTOK_AUTH_URL);
  authUrl.searchParams.set('client_key', config.clientKey);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('redirect_uri', config.redirectUri);
  authUrl.searchParams.set('state', csrfState);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  console.log('\n1. Open this URL in a browser where the SCHOOL TikTok account is logged in:');
  console.log(`\n${authUrl.toString()}\n`);
  console.log('2. Approve access. You will land on a 404 page — that is expected.');
  console.log('3. Copy the value of the `code` parameter from the address bar.');
  console.log('   (Everything between `code=` and the next `&`.)\n');

  const readline = createInterface({ input: process.stdin, output: process.stdout });
  const code = (await readline.question('Paste the code here: ')).trim();
  readline.close();
  if (code === '') throw new Error('No code pasted.');

  const raw = await requestJson<unknown>(TIKTOK_TOKEN_URL, {
    method: 'POST',
    form: {
      client_key: config.clientKey,
      client_secret: config.clientSecret,
      grant_type: 'authorization_code',
      code: decodeURIComponent(code),
      redirect_uri: config.redirectUri,
      code_verifier: codeVerifier,
    },
  });
  const tokens = TokenResponseSchema.parse(raw);

  console.log('\nSuccess. Add this line to .env:\n');
  console.log(`TIKTOK_REFRESH_TOKEN=${tokens.refresh_token}\n`);
  console.log(`Granted scopes: ${tokens.scope ?? '(not reported)'}`);
  console.log(
    `Refresh token lifetime: ~${Math.round(tokens.refresh_expires_in / 86400)} days (rotates on each sync).`
  );
}

const invokedDirectly = process.argv[1]?.endsWith('auth.js') ?? false;
if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}