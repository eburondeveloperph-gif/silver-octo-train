import { NextResponse } from 'next/server';
import {
  listDatasets,
  createDataset,
} from '@/lib/services/knowledge';
import { authenticateRequest, unauthorizedResponse } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

/**
 * GET /api/knowledge — List the current user's datasets (metadata).
 */
export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated) return unauthorizedResponse();

  try {
    const datasets = auth.userId ? await listDatasets(auth.userId) : [];
    return NextResponse.json({ datasets });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/knowledge — Create a new dataset.
 * Body: { name: string, description?: string, data: any[] }
 */
export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.userId) return unauthorizedResponse();

  try {
    const body = await request.json();
    const { name, description, data } = body;

    if (!name || !Array.isArray(data)) {
      return NextResponse.json(
        { error: 'name (string) and data (array) are required' },
        { status: 400 },
      );
    }

    const dataset = await createDataset({
      userId: auth.userId,
      name,
      description,
      data,
    });

    return NextResponse.json(dataset, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
