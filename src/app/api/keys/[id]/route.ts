import { NextResponse } from 'next/server';
import { revokeApiKey } from '@/lib/api-keys';
import { authenticateRequest, unauthorizedResponse } from '@/lib/auth/guard';

/**
 * DELETE /api/keys/:id — Revoke an API key.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.userId) return unauthorizedResponse();

  try {
    const { id } = await params;
    await revokeApiKey(auth.userId, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
