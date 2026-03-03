import { NextResponse } from 'next/server';
import { sendSms, sendEmail } from '@/lib/services/notifications';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/**
 * POST /api/webhooks/vapi/end-of-call
 *
 * VAPI "end-of-call" server URL webhook.
 * Automatically sends a follow-up SMS and/or email when a call finishes.
 *
 * VAPI payload reference (relevant fields):
 *   {
 *     message: {
 *       type: "end-of-call-report",
 *       call: { id, assistantId, customer: { number }, ... },
 *       summary: string,
 *       transcript: string,
 *       endedReason: string,
 *       messages: [{ role, message }],
 *       ...
 *     }
 *   }
 *
 * The webhook checks the assistant's metadata for notification preferences:
 *   assistant.metadata.notifications = {
 *     sms?: { enabled: boolean, template?: string },
 *     email?: { enabled: boolean, to?: string, subject?: string, template?: string },
 *   }
 *
 * If no metadata is found, the webhook does nothing (graceful no-op).
 *
 * This endpoint is PUBLIC (no auth) because VAPI calls it directly.
 */
export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const message = payload?.message;

    if (!message || message.type !== 'end-of-call-report') {
      return NextResponse.json({ ok: true, skipped: 'Not an end-of-call-report' });
    }

    const call = message.call || {};
    const callId: string = call.id || '';
    const assistantId: string = call.assistantId || '';
    const customerNumber: string = call.customer?.number || '';
    const summary: string = message.summary || '';
    const transcript: string = message.transcript || '';

    // Look up notification preferences from the assistant's metadata
    const notifConfig = await getNotificationConfig(assistantId);
    if (!notifConfig) {
      return NextResponse.json({ ok: true, skipped: 'No notification config for assistant' });
    }

    const results: unknown[] = [];

    // ── SMS ──────────────────────────────────────────────────────────
    if (notifConfig.sms?.enabled && customerNumber) {
      const template = notifConfig.sms.template ||
        'Thank you for the call! Here is a summary:\n\n{{summary}}';
      const body = renderTemplate(template, { summary, transcript, callId, customerNumber });

      const smsResult = await sendSms({
        to: customerNumber,
        body,
        callId,
        assistantId,
      });
      results.push(smsResult);
    }

    // ── Email ────────────────────────────────────────────────────────
    if (notifConfig.email?.enabled && notifConfig.email.to) {
      const template = notifConfig.email.template ||
        '<h2>Call Summary</h2><p>{{summary}}</p><h3>Full Transcript</h3><pre>{{transcript}}</pre>';
      const subject = notifConfig.email.subject || `Call Summary – ${callId}`;
      const body = renderTemplate(template, { summary, transcript, callId, customerNumber });

      const emailResult = await sendEmail({
        to: notifConfig.email.to,
        subject,
        body,
        callId,
        assistantId,
      });
      results.push(emailResult);
    }

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    console.error('[end-of-call webhook]', err);
    // Always return 200 to VAPI so it doesn't retry
    return NextResponse.json({ ok: false, error: String(err) });
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

interface NotificationConfig {
  sms?: { enabled: boolean; template?: string };
  email?: { enabled: boolean; to?: string; subject?: string; template?: string };
}

/**
 * Fetch the notification config from the VAPI assistant's metadata.
 * Falls back to checking a `notification_configs` setting in Supabase.
 */
async function getNotificationConfig(assistantId: string): Promise<NotificationConfig | null> {
  if (!assistantId) return null;

  // 1) Try fetching from VAPI assistant metadata
  try {
    const orbitSecret = (
      process.env.VAPI_PRIVATE_API_KEY ||
      process.env.ORBIT_SECRET ||
      process.env.VAPI_API_KEY ||
      ''
    ).trim();

    if (orbitSecret) {
      const res = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
        headers: { Authorization: `Bearer ${orbitSecret}` },
      });
      if (res.ok) {
        const assistant = await res.json();
        if (assistant?.metadata?.notifications) {
          return assistant.metadata.notifications as NotificationConfig;
        }
      }
    }
  } catch {
    // Non-critical: fall through to Supabase
  }

  // 2) Try fetching from a supabase-stored config (future enhancement)
  const admin = getSupabaseAdmin();
  if (admin) {
    try {
      const { data } = await admin
        .from('notification_configs')
        .select('config')
        .eq('assistant_id', assistantId)
        .single();
      if (data) return (data as unknown as { config: NotificationConfig }).config;
    } catch {
      // Table may not exist yet — that's fine
    }
  }

  return null;
}

/**
 * Simple mustache-style template renderer.
 */
function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}
