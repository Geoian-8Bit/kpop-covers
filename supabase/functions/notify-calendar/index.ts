// REQ-05 · Edge Function `notify-calendar`: sends one Web Push per new row of `public.calendar_changes`.
// Called by a Supabase Database Webhook (INSERT on calendar_changes) with the header `x-webhook-secret`, which must
// match the secret PUSH_WEBHOOK_SECRET. Reads the group's subscriptions with the service role (server only), skips
// the author's devices, sends `{ title, body, tag, url }` and removes the subscriptions that answer 404 / 410.
// Deploy: `supabase functions deploy notify-calendar --no-verify-jwt` (docs/DEPLOY.md, «Avisos del calendario»).
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…), PUSH_WEBHOOK_SECRET.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase to every function.

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  buildPayload,
  isGoneStatus,
  parseWebhook,
  pickRecipients,
  sameSecret,
  type SubscriptionRow,
} from './rules.ts';

const env = (name: string) => Deno.env.get(name) ?? '';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!sameSecret(request.headers.get('x-webhook-secret'), env('PUSH_WEBHOOK_SECRET'))) {
    return json(401, { error: 'unauthorized' });
  }

  const publicKey = env('VAPID_PUBLIC_KEY');
  const privateKey = env('VAPID_PRIVATE_KEY');
  const subject = env('VAPID_SUBJECT');
  if (!publicKey || !privateKey || !subject) return json(500, { error: 'vapid_not_configured' });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'bad_json' });
  }
  const change = parseWebhook(body);
  // Not ours (another table or event): acknowledged so the webhook doesn't retry.
  if (!change) return json(200, { sent: 0, skipped: 'not_a_calendar_change' });

  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, member_id')
    .eq('crew_id', change.crew_id);
  if (error) return json(500, { error: 'subscriptions_unreadable' });

  webpush.setVapidDetails(subject, publicKey, privateKey);
  const payload = JSON.stringify(buildPayload(change));
  const recipients = pickRecipients((data ?? []) as SubscriptionRow[], change);

  const gone: string[] = [];
  const ok: string[] = [];
  await Promise.all(
    recipients.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          {
            TTL: 60 * 60 * 24,
            urgency: 'normal',
          },
        );
        ok.push(s.endpoint);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (isGoneStatus(status)) gone.push(s.endpoint);
      }
    }),
  );

  if (gone.length) await admin.from('push_subscriptions').delete().in('endpoint', gone);
  if (ok.length)
    await admin
      .from('push_subscriptions')
      .update({ last_ok_at: new Date().toISOString() })
      .in('endpoint', ok);

  return json(200, { sent: ok.length, removed: gone.length, recipients: recipients.length });
});
