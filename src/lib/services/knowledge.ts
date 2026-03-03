/**
 * Knowledge service: manage dynamic datasets and inject them into
 * assistant system prompts for call-time context.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface KnowledgeDataset {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  data: unknown[];
  created_at: string;
  updated_at: string;
}

/* ------------------------------------------------------------------ */
/*  CRUD                                                              */
/* ------------------------------------------------------------------ */

export async function listDatasets(userId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return [];

  const { data, error } = await admin
    .from('knowledge_datasets')
    .select('id, name, description, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Pick<KnowledgeDataset, 'id' | 'name' | 'description' | 'created_at' | 'updated_at'>[];
}

export async function getDataset(userId: string, datasetId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Supabase admin not configured');

  const { data, error } = await admin
    .from('knowledge_datasets')
    .select('*')
    .eq('id', datasetId)
    .eq('user_id', userId)
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as KnowledgeDataset;
}

export async function createDataset(params: {
  userId: string;
  name: string;
  description?: string;
  data: unknown[];
}) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Supabase admin not configured');

  const { data, error } = await admin
    .from('knowledge_datasets')
    .insert({
      user_id: params.userId,
      name: params.name,
      description: params.description ?? null,
      data: params.data,
    } as never)
    .select('id, name, description, created_at')
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as Pick<KnowledgeDataset, 'id' | 'name' | 'description' | 'created_at'>;
}

export async function updateDataset(params: {
  userId: string;
  datasetId: string;
  name?: string;
  description?: string;
  data?: unknown[];
}) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Supabase admin not configured');

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (params.name !== undefined) updates.name = params.name;
  if (params.description !== undefined) updates.description = params.description;
  if (params.data !== undefined) updates.data = params.data;

  const { data, error } = await admin
    .from('knowledge_datasets')
    .update(updates as never)
    .eq('id', params.datasetId)
    .eq('user_id', params.userId)
    .select('id, name, description, updated_at')
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as Pick<KnowledgeDataset, 'id' | 'name' | 'description' | 'updated_at'>;
}

export async function deleteDataset(userId: string, datasetId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Supabase admin not configured');

  const { error } = await admin
    .from('knowledge_datasets')
    .delete()
    .eq('id', datasetId)
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
}

/* ------------------------------------------------------------------ */
/*  Call-time injection                                               */
/* ------------------------------------------------------------------ */

/**
 * Build a system prompt addendum from one or more datasets.
 * This is injected into the assistant's system prompt before
 * initiating a call, so the AI has access to dynamic data.
 */
export function buildKnowledgePrompt(datasets: { name: string; data: unknown[] }[]): string {
  if (!datasets.length) return '';

  const sections = datasets.map((ds) => {
    const json = JSON.stringify(ds.data, null, 2);
    return `### Dataset: ${ds.name}\n\`\`\`json\n${json}\n\`\`\``;
  });

  return [
    '\n\n---',
    '## Dynamic Knowledge Base',
    'Use the following datasets to answer questions during this call.',
    'Always reference this data when relevant.\n',
    ...sections,
    '---\n',
  ].join('\n');
}

/**
 * Resolve dataset references for a call.
 * Accepts either:
 *   - datasetIds: string[]  → fetch from Supabase
 *   - inlineData: { name: string, data: unknown[] }[]  → use directly
 */
export async function resolveKnowledgeForCall(params: {
  userId?: string;
  datasetIds?: string[];
  inlineData?: { name: string; data: unknown[] }[];
}): Promise<string> {
  const datasets: { name: string; data: unknown[] }[] = [];

  // Inline data (passed directly in the API call)
  if (params.inlineData?.length) {
    datasets.push(...params.inlineData);
  }

  // Stored datasets (referenced by ID)
  if (params.datasetIds?.length && params.userId) {
    for (const id of params.datasetIds) {
      try {
        const ds = await getDataset(params.userId, id);
        datasets.push({ name: ds.name, data: ds.data as unknown[] });
      } catch {
        console.warn(`[knowledge] Dataset ${id} not found, skipping`);
      }
    }
  }

  return buildKnowledgePrompt(datasets);
}
