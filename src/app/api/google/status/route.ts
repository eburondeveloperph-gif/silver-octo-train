import { NextResponse } from 'next/server';
import { getAuthenticatedClient } from '@/lib/services/google';
import { authenticateRequest, unauthorizedResponse } from '@/lib/auth/guard';
import { google } from 'googleapis';

/**
 * GET /api/google/status
 *
 * Check whether the current user has a connected Google account.
 * Returns { connected: boolean, email?: string }.
 */
export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.userId) return unauthorizedResponse();

  try {
    const client = await getAuthenticatedClient(auth.userId);
    if (!client) {
      return NextResponse.json({ connected: false });
    }

    // Try to get the user's email
    let email: string | undefined;
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: client });
      const { data } = await oauth2.userinfo.get();
      email = data.email ?? undefined;
    } catch {
      // Token may be expired / revoked — still report as disconnected
      return NextResponse.json({ connected: false });
    }

    return NextResponse.json({ connected: true, email });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
