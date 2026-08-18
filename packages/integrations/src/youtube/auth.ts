import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { readYouTubeConfig } from '../config.js';
import { requestJson } from '../http.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES = [
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  'https://www.googleapis.com/auth/youtube.readonly',
].join(' ');
const REDIRECT_URI = 'http://localhost:8765/callback';

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number(),
});

const RefreshResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number(),
});

/** Exchange the stored refresh token for a fresh access token (used by the sync). */
export async function refreshYouTubeAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string> {
  const raw = await requestJson<unknown>(GOOGLE_TOKEN_URL, {
    method: 'POST',
    form: {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    },
  });
  return RefreshResponseSchema.parse(raw).access_token;
}

async function main(): Promise<void> {
  const config = readYouTubeConfig();
  if (config === null) {
    throw new Error(
      'YOUTUBE_API_KEY / YOUTUBE_CHANNEL_ID / YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET missing from .env'
    );
  }

  const pasted = process.env['YOUTUBE_AUTH_CODE'];

  if (pasted === undefined || pasted.trim() === '') {
    const state = randomBytes(16).toString('hex');
    const authUrl = new URL(GOOGLE_AUTH_URL);
    authUrl.searchParams.set('client_id', config.clientId);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', state);

    console.log('\n1. Open this URL in a browser logged into the CHANNEL-OWNING Google account:');
    console.log(`\n${authUrl.toString()}\n`);
    console.log('2. If you see "Google hasn\'t verified this app": Advanced → continue.');
    console.log('3. Approve both read-only scopes. The browser will land on a localhost');
    console.log('   error page — THAT IS EXPECTED. The code is in the address bar.');
    console.log('4. Copy the value between `code=` and the next `&`, then run:');
    console.log('\n  YOUTUBE_AUTH_CODE=<paste-code-here> pnpm auth:youtube\n');
    console.log('The code expires in minutes — run it right away.');
    return;
  }

  const code = decodeURIComponent(pasted.trim());

  const raw = await requestJson<unknown>(GOOGLE_TOKEN_URL, {
    method: 'POST',
    form: {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    },
  });
  const tokens = TokenResponseSchema.parse(raw);

  console.log('\nSuccess. Add this line to .env:\n');
  console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
  console.log(
    'NOTE: if the consent screen is still in Testing mode, this token dies in 7 days.\n' +
      'Step 10 publishes it to Production so the token persists.'
  );
}

const invokedDirectly = process.argv[1]?.endsWith('auth.js') ?? false;
if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}