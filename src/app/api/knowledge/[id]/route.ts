import { NextResponse } from 'next/server';
import {
  getDataset,
  updateDataset,
  deleteDataset,
} from '@/lib/services/knowledge';
import { authenticateRequest, unauthorizedResponse } from '@/lib/auth/guard';

/**
 * GET /api/knowledge/:id — Get a full dataset (with data).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.userId) return unauthorizedResponse();

  try {
    const { id } = await params;
    const dataset = await getDataset(auth.userId, id);
    return NextResponse.json(dataset);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 404 });
  }
}

/**
 * PATCH /api/knowledge/:id — Update dataset name, description, or data.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.userId) return unauthorizedResponse();

  try {
    const { id } = await params;
    const body = await request.json();
    const dataset = await updateDataset({
      userId: auth.userId,
      datasetId: id,
      name: body.name,
      description: body.description,
      data: body.data,
    });
    return NextResponse.json(dataset);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/knowledge/:id — Delete a dataset.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated || !auth.userId) return unauthorizedResponse();

  try {
    const { id } = await params;
    await deleteDataset(auth.userId, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
