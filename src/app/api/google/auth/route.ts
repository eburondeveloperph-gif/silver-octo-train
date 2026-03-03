import { NextResponse } from 'next/server';
import { getOAuth2Client } from '@/lib/services/google';

/**
 * GET /api/google/auth
 *
 * Redirects the user to Google's OAuth2 consent screen.
 * Required scopes: Gmail send, profile email.
 *
 * Optional query param: ?userId=<uuid> — passed through via `state` so the
 * callback can associate the tokens with the correct user.
 */
export async function GET(request: Request) {
  const oauth2 = getOAuth2Client();
  if (!oauth2) {
    return NextResponse.json(
      { error: 'Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.' },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId') || '';

  const url = oauth2.generateAuthUrl({
    access_type: 'offline',   // get a refresh_token
    prompt: 'consent',        // always show consent to guarantee refresh_token
    scope: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
    state: userId,            // pass userId through the OAuth flow
  });

  return NextResponse.redirect(url);
}
