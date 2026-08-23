import { randomUUID } from 'node:crypto';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { ANALYST_AGENT_NAME, analystAgent, type AnalystOutput } from '@platform/agent-analyst';
import { createLogStore, createMemoryClient } from '@platform/memory';
import { Orchestrator } from '@platform/orchestrator';
import { createLogger, type NextVideoSuggestion } from '@platform/shared';
import { verifySlackSignature } from './verify.js';

const logger = createLogger('slack');

const botToken = process.env['SLACK_BOT_TOKEN'];
const signingSecret = process.env['SLACK_SIGNING_SECRET'];
const channelId = process.env['SLACK_CHANNEL_ID'];
if (botToken === undefined || signingSecret === undefined || channelId === undefined) {
  throw new Error('SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET and SLACK_CHANNEL_ID are all required.');
}
// Narrowed non-undefined copies for use inside closures.
const SIGNING_SECRET: string = signingSecret;
const BOT_TOKEN: string = botToken;

const memory = createMemoryClient();
const orchestrator = new Orchestrator({ logStore: createLogStore() });
orchestrator.registerAgent(analystAgent);

const app = new Hono();

/** Post a message to Slack via chat.postMessage. */
async function postToSlack(body: Record<string, unknown>): Promise<void> {
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      authorization: `Bearer ${BOT_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as { ok: boolean; error?: string };
  if (!result.ok) logger.error(`chat.postMessage failed: ${result.error ?? 'unknown'}`);
}

/** Block Kit for one suggestion, with posted/skipped buttons (§2 write path). */
function suggestionBlocks(s: NextVideoSuggestion): unknown[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `*${s.theme}*\n` +
          `*Hook:* ${s.hook}\n` +
          `*Format:* ${s.format}\n` +
          `*Hypothesis:* ${s.hypothesis ?? 'untagged'}\n` +
          `_${s.rationale}_`,
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '✓ Posted' },
          style: 'primary',
          action_id: 'suggestion_posted',
          value: s.id,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '✗ Skipped' },
          action_id: 'suggestion_skipped',
          value: s.id,
        },
      ],
    },
    { type: 'divider' },
  ];
}

/** Runs the analyst through the orchestrator and posts results to the channel. */
async function runAndDeliver(focus: string | undefined, requestedBy: string): Promise<void> {
  const result = await orchestrator.dispatch({
    id: randomUUID(),
    type: 'analysis.next_video',
    agent: ANALYST_AGENT_NAME,
    payload: focus === undefined || focus === '' ? { count: 2 } : { count: 2, focus },
    requestedBy,
    createdAt: new Date().toISOString(),
  });

  if (!result.ok) {
    await postToSlack({
      channel: channelId,
      text: `Suggestion run failed [${result.error.code}]: ${result.error.message}`,
    });
    return;
  }

  const output = result.output as AnalystOutput;
  if (output.suggestions.length === 0) {
    await postToSlack({
      channel: channelId,
      text: `No suggestions passed the checks this run (${output.rejected} rejected). Try again or adjust focus.`,
    });
    return;
  }

  const blocks = output.suggestions.flatMap((s) => suggestionBlocks(s));
  const capLine =
    output.capStatus !== null && output.capStatus.used >= output.capStatus.cap * 0.8
      ? `\n⚠️ LLM cap: ${output.capStatus.used}/${output.capStatus.cap} tokens used in ${output.capStatus.month} (past 80%).`
      : '';
  await postToSlack({
    channel: channelId,
    text: `${output.suggestions.length} suggestion(s) ready${capLine}`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `*Next video suggestions*${capLine}` } },
      { type: 'divider' },
      ...blocks,
    ],
  });
}

/** /slack/commands — the /nextvideo slash command. */
app.post('/slack/commands', async (c) => {
  const rawBody = await c.req.text();
  if (
    !verifySlackSignature(
      SIGNING_SECRET,
      c.req.header('x-slack-request-timestamp'),
      c.req.header('x-slack-signature'),
      rawBody
    )
  ) {
    logger.warn('rejected /slack/commands request: bad signature');
    return c.text('invalid signature', 401);
  }

  const params = new URLSearchParams(rawBody);
  const focus = params.get('text') ?? '';
  const userId = params.get('user_id') ?? 'slack-user';

  // Slack demands a response within 3s; the analyst takes ~30-60s.
  // Acknowledge now, run in the background, deliver to the channel when done.
  void runAndDeliver(focus === '' ? undefined : focus, `slack:${userId}`).catch((error: unknown) => {
    logger.error(error instanceof Error ? error.message : String(error));
  });

  return c.json({
    response_type: 'ephemeral',
    text: `On it — analysing and generating${focus === '' ? '' : ` (focus: ${focus})`}. Suggestions arrive in <#${channelId}> in ~1 minute.`,
  });
});

/** /slack/events — app_mention → same flow as the slash command. */
app.post('/slack/events', async (c) => {
  const rawBody = await c.req.text();
  if (
    !verifySlackSignature(
      SIGNING_SECRET,
      c.req.header('x-slack-request-timestamp'),
      c.req.header('x-slack-signature'),
      rawBody
    )
  ) {
    logger.warn('rejected /slack/events request: bad signature');
    return c.text('invalid signature', 401);
  }

  const body = JSON.parse(rawBody) as {
    type: string;
    challenge?: string;
    event?: { type: string; text?: string; user?: string };
  };

  // Slack URL verification handshake (happens once, at Step 13 URL setup).
  if (body.type === 'url_verification') {
    return c.json({ challenge: body.challenge ?? '' });
  }

  if (body.type === 'event_callback' && body.event?.type === 'app_mention') {
    const text = (body.event.text ?? '').replace(/<@[^>]+>/g, '').trim();
    void runAndDeliver(text === '' ? undefined : text, `slack:${body.event.user ?? 'mention'}`).catch(
      (error: unknown) => {
        logger.error(error instanceof Error ? error.message : String(error));
      }
    );
  }

  return c.text('ok');
});

/** /slack/interactions — posted/skipped button clicks. */
app.post('/slack/interactions', async (c) => {
  const rawBody = await c.req.text();
  if (
    !verifySlackSignature(
      SIGNING_SECRET,
      c.req.header('x-slack-request-timestamp'),
      c.req.header('x-slack-signature'),
      rawBody
    )
  ) {
    logger.warn('rejected /slack/interactions request: bad signature');
    return c.text('invalid signature', 401);
  }

  const payloadRaw = new URLSearchParams(rawBody).get('payload');
  if (payloadRaw === null) return c.text('missing payload', 400);
  const payload = JSON.parse(payloadRaw) as {
    actions?: Array<{ action_id: string; value: string }>;
  };

  const action = payload.actions?.[0];
  if (action === undefined) return c.text('ok');

  if (action.action_id === 'suggestion_posted' || action.action_id === 'suggestion_skipped') {
    const status = action.action_id === 'suggestion_posted' ? 'posted' : 'skipped';
    await memory.suggestions.updateStatus(action.value, status);
    logger.info(`suggestion ${action.value} → ${status} (via Slack button)`);
    await postToSlack({
      channel: channelId,
      text: `Noted: suggestion marked *${status}*.`,
    });
  }

  return c.text('ok');
});

app.get('/health', (c) => c.text('ok'));

const port = Number(process.env['PORT'] ?? 3000);
serve({ fetch: app.fetch, port }, () => logger.info(`slack app listening on :${port}`));