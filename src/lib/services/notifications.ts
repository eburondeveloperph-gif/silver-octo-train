/**
 * Notification service: send SMS (via Twilio) and email (via Gmail / SendGrid / Resend).
 *
 * Environment variables:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER  — SMS
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET                     — Gmail (OAuth2, preferred)
 *   SENDGRID_API_KEY, SENDGRID_FROM                            — SendGrid transactional email
 *   RESEND_API_KEY, RESEND_FROM                                — Resend.com fallback
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { sendViaGmail } from '@/lib/services/google';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface SendSmsParams {
  to: string;       // E.164 phone number
  body: string;
  userId?: string;
  callId?: string;
  assistantId?: string;
}

export interface SendEmailParams {
  to: string;       // email address
  subject: string;
  body: string;     // plain-text or HTML
  userId?: string;
  callId?: string;
  assistantId?: string;
}

export interface NotificationResult {
  success: boolean;
  channel: 'sms' | 'email';
  error?: string;
  providerResponse?: unknown;
}

/* ------------------------------------------------------------------ */
/*  SMS via Twilio REST API                                           */
/* ------------------------------------------------------------------ */

export async function sendSms(params: SendSmsParams): Promise<NotificationResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || '';
  const authToken = process.env.TWILIO_AUTH_TOKEN || '';
  const fromNumber = process.env.TWILIO_FROM_NUMBER || '';

  if (!accountSid || !authToken || !fromNumber) {
    return { success: false, channel: 'sms', error: 'Twilio credentials not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)' };
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const body = new URLSearchParams({
      To: params.to,
      From: fromNumber,
      Body: params.body,
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    const data = await res.json();

    if (!res.ok) {
      await logNotification(params, 'sms', 'failed', data);
      return { success: false, channel: 'sms', error: data.message || 'Twilio error', providerResponse: data };
    }

    await logNotification(params, 'sms', 'sent', data);
    return { success: true, channel: 'sms', providerResponse: data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await logNotification(params, 'sms', 'failed', { error: message });
    return { success: false, channel: 'sms', error: message };
  }
}

/* ------------------------------------------------------------------ */
/*  Email: Gmail → SendGrid → Resend (priority order)                */
/* ------------------------------------------------------------------ */

export async function sendEmail(params: SendEmailParams): Promise<NotificationResult> {
  // 1) Gmail OAuth2 — if user has connected their Google account
  if (params.userId) {
    const gmailResult = await sendEmailViaGmail(params);
    if (gmailResult.success) return gmailResult;
    // If Gmail fails because account isn't connected, fall through silently
    if (!gmailResult.error?.includes('not connected')) {
      return gmailResult; // real Gmail error → surface it
    }
  }

  // 2) SendGrid — transactional email (production-recommended)
  const sendgridKey = process.env.SENDGRID_API_KEY || '';
  if (sendgridKey) {
    return sendEmailViaSendGrid(params, sendgridKey);
  }

  // 3) Resend — lightweight alternative
  const resendKey = process.env.RESEND_API_KEY || '';
  if (resendKey) {
    return sendEmailViaResend(params, resendKey);
  }

  return {
    success: false,
    channel: 'email',
    error: 'No email provider configured. Connect Gmail (/api/google/auth), or set SENDGRID_API_KEY or RESEND_API_KEY.',
  };
}

/* ── Gmail (OAuth2) ─────────────────────────────────────────────── */

async function sendEmailViaGmail(params: SendEmailParams): Promise<NotificationResult> {
  if (!params.userId) {
    return { success: false, channel: 'email', error: 'Gmail: not connected (no userId)' };
  }

  const result = await sendViaGmail({
    userId: params.userId,
    to: params.to,
    subject: params.subject,
    body: params.body,
  });

  if (!result.success) {
    await logNotification(params, 'email', 'failed', { provider: 'gmail', error: result.error });
    return { success: false, channel: 'email', error: result.error };
  }

  await logNotification(params, 'email', 'sent', { provider: 'gmail', messageId: result.messageId });
  return { success: true, channel: 'email', providerResponse: { provider: 'gmail', messageId: result.messageId } };
}

/* ── SendGrid ───────────────────────────────────────────────────── */

async function sendEmailViaSendGrid(params: SendEmailParams, apiKey: string): Promise<NotificationResult> {
  const from = process.env.SENDGRID_FROM || process.env.GMAIL_FROM || 'noreply@eburon.ai';
  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: params.to }] }],
        from: { email: from },
        subject: params.subject,
        content: [
          { type: 'text/plain', value: params.body.replace(/<[^>]*>/g, '') },
          { type: 'text/html', value: params.body },
        ],
      }),
    });

    // SendGrid returns 202 on success with no body
    if (res.status === 202 || res.ok) {
      await logNotification(params, 'email', 'sent', { provider: 'sendgrid', status: res.status });
      return { success: true, channel: 'email', providerResponse: { provider: 'sendgrid' } };
    }

    const data = await res.json().catch(() => ({}));
    await logNotification(params, 'email', 'failed', { provider: 'sendgrid', ...data });
    return {
      success: false,
      channel: 'email',
      error: (data as { errors?: { message?: string }[] }).errors?.[0]?.message || `SendGrid error (${res.status})`,
      providerResponse: data,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await logNotification(params, 'email', 'failed', { provider: 'sendgrid', error: message });
    return { success: false, channel: 'email', error: message };
  }
}

async function sendEmailViaResend(params: SendEmailParams, apiKey: string): Promise<NotificationResult> {
  const from = process.env.RESEND_FROM || 'noreply@eburon.ai';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: params.subject,
        html: params.body,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      await logNotification(params, 'email', 'failed', data);
      return { success: false, channel: 'email', error: data.message || 'Resend error', providerResponse: data };
    }

    await logNotification(params, 'email', 'sent', data);
    return { success: true, channel: 'email', providerResponse: data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await logNotification(params, 'email', 'failed', { error: message });
    return { success: false, channel: 'email', error: message };
  }
}

/* ── Resend ──────────────────────────────────────────────────────── */

/* ------------------------------------------------------------------ */
/*  Audit log                                                         */
/* ------------------------------------------------------------------ */

async function logNotification(
  params: SendSmsParams | SendEmailParams,
  channel: 'sms' | 'email',
  status: 'sent' | 'failed',
  providerResponse: unknown,
) {
  const admin = getSupabaseAdmin();
  if (!admin || !params.userId) return;

  try {
    await admin.from('notification_logs').insert({
      user_id: params.userId,
      call_id: params.callId ?? null,
      assistant_id: params.assistantId ?? null,
      channel,
      recipient: params.to,
      subject: 'subject' in params ? params.subject : null,
      body: params.body,
      status,
      provider_response: providerResponse,
    } as never);
  } catch {
    // Non-critical: don't let logging failures bubble up
    console.error('[notification-log] Failed to save audit log');
  }
}
