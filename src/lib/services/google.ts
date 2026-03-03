/**
 * Google services: OAuth2 client, Gmail send, token management.
 *
 * Uses the Google OAuth2 "web" client flow:
 *   1. User authorizes via /api/google/auth (redirects to Google consent)
 *   2. Google redirects back to /api/google/callback with an auth code
 *   3. We exchange the code for access + refresh tokens, store in Supabase
 *   4. Subsequent Gmail sends use the stored refresh token
 *
 * Environment variables:
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET  — from Google Cloud Console
 *   GOOGLE_REDIRECT_URI                     — callback URL (auto-derived if not set)
 *   GMAIL_FROM                              — sender display address (optional)
 */
import { google } from 'googleapis';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/* ------------------------------------------------------------------ */
/*  OAuth2 client singleton                                           */
/* ------------------------------------------------------------------ */

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/google/callback';

let _oauth2: InstanceType<typeof google.auth.OAuth2> | null = null;

export function getOAuth2Client() {
  if (!CLIENT_ID || !CLIENT_SECRET) return null;
  if (!_oauth2) {
    _oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  }
  return _oauth2;
}

/* ------------------------------------------------------------------ */
/*  Token storage (Supabase)                                          */
/* ------------------------------------------------------------------ */

/**
 * Store Google OAuth tokens for a user.
 */
export async function storeGoogleTokens(
  userId: string,
  tokens: { access_token?: string | null; refresh_token?: string | null; expiry_date?: number | null },
) {
  const admin = getSupabaseAdmin();
  if (!admin) return;

  const row: Record<string, unknown> = {
    user_id: userId,
    provider: 'google',
    access_token: tokens.access_token ?? null,
    refresh_token: tokens.refresh_token ?? null,
    expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    updated_at: new Date().toISOString(),
  };

  // Upsert: one google token row per user
  const { error } = await admin
    .from('oauth_tokens')
    .upsert(row as never, { onConflict: 'user_id,provider' });

  if (error) console.error('[google] Failed to store tokens:', error.message);
}

/**
 * Load Google OAuth tokens for a user and apply them to the OAuth2 client.
 * Returns the client ready to use, or null if no tokens are stored.
 */
export async function getAuthenticatedClient(userId: string) {
  const oauth2 = getOAuth2Client();
  if (!oauth2) return null;

  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const { data, error } = await admin
    .from('oauth_tokens')
    .select('access_token, refresh_token, expiry_date')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .single();

  if (error || !data) return null;

  const row = data as unknown as {
    access_token: string | null;
    refresh_token: string | null;
    expiry_date: string | null;
  };

  if (!row.refresh_token) return null;

  oauth2.setCredentials({
    access_token: row.access_token ?? undefined,
    refresh_token: row.refresh_token,
    expiry_date: row.expiry_date ? new Date(row.expiry_date).getTime() : undefined,
  });

  return oauth2;
}

/* ------------------------------------------------------------------ */
/*  Gmail send                                                        */
/* ------------------------------------------------------------------ */

/**
 * Build an RFC 2822 email message and base64url-encode it for the Gmail API.
 */
function buildRawEmail(params: {
  from: string;
  to: string;
  subject: string;
  html: string;
}): string {
  const boundary = '____boundary____' + Date.now();
  const lines = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    params.html.replace(/<[^>]*>/g, ''), // plain-text fallback
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    '',
    params.html,
    '',
    `--${boundary}--`,
  ];

  const raw = lines.join('\r\n');
  // base64url encode (no padding, URL-safe alphabet)
  return Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export interface GmailSendParams {
  userId: string;
  to: string;
  subject: string;
  body: string; // HTML
}

export interface GmailSendResult {
  success: boolean;
  error?: string;
  messageId?: string;
}

/**
 * Send an email via the authenticated user's Gmail account.
 */
export async function sendViaGmail(params: GmailSendParams): Promise<GmailSendResult> {
  const client = await getAuthenticatedClient(params.userId);
  if (!client) {
    return {
      success: false,
      error: 'Google account not connected. Authorize at /api/google/auth first.',
    };
  }

  const gmail = google.gmail({ version: 'v1', auth: client });

  // Get the user's email address for the From header
  let fromEmail = process.env.GMAIL_FROM || '';
  if (!fromEmail) {
    try {
      const profile = await gmail.users.getProfile({ userId: 'me' });
      fromEmail = profile.data.emailAddress || 'me';
    } catch {
      fromEmail = 'me';
    }
  }

  const raw = buildRawEmail({
    from: fromEmail,
    to: params.to,
    subject: params.subject,
    html: params.body,
  });

  try {
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });

    // Persist refreshed tokens if the library auto-refreshed
    const creds = client.credentials;
    if (creds.access_token) {
      await storeGoogleTokens(params.userId, creds);
    }

    return { success: true, messageId: res.data.id ?? undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gmail API error';
    return { success: false, error: message };
  }
}
