import { NextResponse } from 'next/server';
import { getOAuth2Client, storeGoogleTokens } from '@/lib/services/google';

/**
 * GET /api/google/callback
 *
 * Google redirects here after the user consents.
 * Exchanges the authorization code for tokens and stores them.
 */
export async function GET(request: Request) {
  const oauth2 = getOAuth2Client();
  if (!oauth2) {
    return NextResponse.json(
      { error: 'Google OAuth not configured.' },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const userId = searchParams.get('state') || '';
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.json(
      { error: `Google OAuth error: ${error}` },
      { status: 400 },
    );
  }

  if (!code) {
    return NextResponse.json(
      { error: 'Missing authorization code' },
      { status: 400 },
    );
  }

  try {
    const { tokens } = await oauth2.getToken(code);

    if (userId) {
      await storeGoogleTokens(userId, tokens);
    }

    // Redirect back to the app with success indicator
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    return NextResponse.redirect(
      `${baseUrl}?google_connected=true`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token exchange failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
