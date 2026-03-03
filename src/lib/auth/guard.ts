/**
 * Auth guard helper shared by all API routes.
 *
 * Supports TWO auth mechanisms (checked in order):
 *   1. `X-API-Key` header  → validated against api_keys table
 *   2. `Authorization: Bearer <jwt>` → validated via Supabase Auth
 *
 * When SUPABASE_SERVICE_ROLE_KEY is not set (demo / local dev), all
 * requests are allowed through so existing behaviour is preserved.
 */
import { NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-keys';
import { createSupabaseClientFromRequest } from '@/lib/supabase-server';

export interface AuthResult {
  userId: string | null;
  /** true = auth was enforced and passed */
  authenticated: boolean;
}

/**
 * Paths that skip authentication entirely (webhooks, health, etc.).
 */
const PUBLIC_PATHS = [
  '/api/webhooks/',
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

/**
 * Authenticate the request. Returns an AuthResult.
 * When the admin client is unavailable (no SUPABASE_SERVICE_ROLE_KEY),
 * falls back to permissive mode for backward-compat.
 */
export async function authenticateRequest(request: Request): Promise<AuthResult> {
  const url = new URL(request.url);

  // Public paths bypass auth
  if (isPublicPath(url.pathname)) {
    return { userId: null, authenticated: true };
  }

  // 1) Try X-API-Key
  const apiKey = request.headers.get('X-API-Key') || request.headers.get('x-api-key');
  if (apiKey) {
    const userId = await validateApiKey(apiKey);
    if (userId) return { userId, authenticated: true };
    // Invalid key → reject immediately
    return { userId: null, authenticated: false };
  }

  // 2) Try Supabase JWT
  const supabase = createSupabaseClientFromRequest(request);
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return { userId: user.id, authenticated: true };
  }

  // 3) No credentials supplied — fall back to permissive if service role is not configured
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!serviceRoleKey) {
    // Demo mode: allow unauthenticated access (backward-compat)
    return { userId: null, authenticated: true };
  }

  return { userId: null, authenticated: false };
}

/**
 * Helper to return a 401 response.
 */
export function unauthorizedResponse() {
  return NextResponse.json(
    {
      error: 'Unauthorized',
      message: 'Provide a valid API key via X-API-Key header, or a Bearer JWT via Authorization header.',
    },
    { status: 401 },
  );
}
