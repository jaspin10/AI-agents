/**
 * Minimal Slack poster shared by cron entrypoints and apps/api. Returns false
 * (and posts nothing) when SLACK_BOT_TOKEN / SLACK_CHANNEL_ID are unset, so a
 * service without Slack credentials degrades to logs instead of crashing.
 */
export async function postSlackText(text: string): Promise<boolean> {
  const token = process.env['SLACK_BOT_TOKEN'];
  const channel = process.env['SLACK_CHANNEL_ID'];
  if (token === undefined || token === '' || channel === undefined || channel === '') return false;
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8', authorization: `Bearer ${token}` },
    body: JSON.stringify({ channel, text }),
  });
  const result = (await response.json()) as { ok: boolean; error?: string };
  if (!result.ok) throw new Error(`chat.postMessage failed: ${result.error ?? 'unknown'}`);
  return true;
}
