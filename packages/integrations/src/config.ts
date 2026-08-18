import { z } from 'zod';

/** TikTok sandbox app (Display API scopes). Redirect URI must match byte-for-byte. */
const TikTokConfigSchema = z.object({
  clientKey: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUri: z.url(),
  refreshToken: z.string().min(1).optional(),
});
export type TikTokConfig = z.infer<typeof TikTokConfigSchema>;

/** YouTube: API key for public data, OAuth desktop client for Analytics API. */
const YouTubeConfigSchema = z.object({
  apiKey: z.string().min(1),
  channelId: z.string().regex(/^UC/, 'channel id must start with UC'),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  refreshToken: z.string().min(1).optional(),
});
export type YouTubeConfig = z.infer<typeof YouTubeConfigSchema>;

/** Stripe restricted read-only key. */
const StripeConfigSchema = z.object({
  secretKey: z
    .string()
    .regex(/^rk_/, 'must be a restricted key (rk_…), not a full secret key'),
});
export type StripeConfig = z.infer<typeof StripeConfigSchema>;

function env(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
}

/** Returns null when the platform's vars are entirely absent; throws when partial. */
export function readTikTokConfig(): TikTokConfig | null {
  const clientKey = env('TIKTOK_CLIENT_KEY');
  const clientSecret = env('TIKTOK_CLIENT_SECRET');
  const redirectUri = env('TIKTOK_REDIRECT_URI');
  if (
    clientKey === undefined &&
    clientSecret === undefined &&
    redirectUri === undefined
  ) {
    return null;
  }
  return TikTokConfigSchema.parse({
    clientKey,
    clientSecret,
    redirectUri,
    refreshToken: env('TIKTOK_REFRESH_TOKEN'),
  });
}

export function readYouTubeConfig(): YouTubeConfig | null {
  const apiKey = env('YOUTUBE_API_KEY');
  const channelId = env('YOUTUBE_CHANNEL_ID');
  const clientId = env('YOUTUBE_CLIENT_ID');
  const clientSecret = env('YOUTUBE_CLIENT_SECRET');
  if (
    apiKey === undefined &&
    channelId === undefined &&
    clientId === undefined &&
    clientSecret === undefined
  ) {
    return null;
  }
  return YouTubeConfigSchema.parse({
    apiKey,
    channelId,
    clientId,
    clientSecret,
    refreshToken: env('YOUTUBE_REFRESH_TOKEN'),
  });
}

export function readStripeConfig(): StripeConfig | null {
  const secretKey = env('STRIPE_SECRET_KEY');
  if (secretKey === undefined) return null;
  return StripeConfigSchema.parse({ secretKey });
}