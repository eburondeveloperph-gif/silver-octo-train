import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Edge-compatible middleware that runs BEFORE API route handlers.
 *
 * Strategy:
 *  - When SUPABASE_SERVICE_ROLE_KEY is set, require auth on /api/ routes
 *    (except public paths like /api/webhooks/).
 *  - When the key is not set (demo/local dev), pass everything through.
 *
 * The heavy validation (SHA-256 hash lookup) is done inside the route
 * handlers via `authenticateRequest()` since the Edge runtime has limited
 * access to Node crypto.  This middleware performs a cheap "presence check"
 * only, rejecting requests with no credentials early.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only gate /api/ routes
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Public paths
  if (pathname.startsWith('/api/webhooks/')) {
    return NextResponse.next();
  }

  // When service role key is not configured, run in demo mode (permissive)
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!serviceRoleKey) {
    return NextResponse.next();
  }

  // Check for presence of EITHER auth mechanism
  const hasApiKey = !!(request.headers.get('X-API-Key') || request.headers.get('x-api-key'));
  const hasJwt = !!(request.headers.get('Authorization')?.startsWith('Bearer '));

  if (!hasApiKey && !hasJwt) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        message: 'Provide a valid API key via X-API-Key header, or a Bearer JWT via Authorization header.',
      },
      { status: 401 },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
