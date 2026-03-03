import { NextResponse } from 'next/server';
import { createApiKey, listApiKeys } from '@/lib/api-keys';
import { authenticateRequest, unauthorizedResponse } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

/**
 * GET /api/keys — List the current user's API keys (metadata only).
 */
export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.userId) return unauthorizedResponse();

  try {
    const keys = await listApiKeys(auth.userId);
    return NextResponse.json({ keys });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/keys — Create a new API key.
 * Body: { name?: string }
 * Returns the plaintext key (shown once) + metadata.
 */
export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.userId) return unauthorizedResponse();

  try {
    const body = await request.json().catch(() => ({}));
    const name = (body as { name?: string }).name || 'Default';
    const result = await createApiKey(auth.userId, name);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
