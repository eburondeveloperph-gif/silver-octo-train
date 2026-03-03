/**
 * API key utilities: generation, hashing, and validation.
 *
 * Key format:  eb_<32-hex-chars>  (e.g. eb_a1b2c3d4...)
 * Storage:     SHA-256 hash of the full key is stored in DB.
 * Lookup:      hashed on every request, matched against api_keys.key_hash.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateRawKey(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return (
    'eb_' +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  );
}

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface ApiKeyRow {
  id: string;
  user_id: string;
  key_hash: string;
  key_prefix: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  revoked: boolean;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

/**
 * Create a new API key for a user. Returns the **plaintext** key — this is
 * the only time it can be read. Only the hash is stored.
 */
export async function createApiKey(userId: string, name = 'Default') {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Supabase admin not configured');

  const rawKey = generateRawKey();
  const keyHash = await sha256(rawKey);
  const keyPrefix = rawKey.slice(0, 10) + '…';

  const { data, error } = await admin
    .from('api_keys')
    .insert({
      user_id: userId,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      name,
    } as never)
    .select('id, key_prefix, name, created_at')
    .single();

  if (error) throw new Error(error.message);
  const row = data as unknown as Pick<ApiKeyRow, 'id' | 'key_prefix' | 'name' | 'created_at'>;
  return { ...row, key: rawKey };
}

/**
 * Validate an API key. Returns the owning `user_id` or null.
 * Also updates `last_used_at` on a successful match.
 */
export async function validateApiKey(rawKey: string): Promise<string | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const keyHash = await sha256(rawKey);
  const { data, error } = await admin
    .from('api_keys')
    .select('id, user_id')
    .eq('key_hash', keyHash)
    .eq('revoked', false)
    .single();

  if (error || !data) return null;
  const row = data as unknown as Pick<ApiKeyRow, 'id' | 'user_id'>;

  // Fire-and-forget: update last_used_at
  admin
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() } as never)
    .eq('id', row.id)
    .then(() => {});

  return row.user_id;
}

/**
 * List API keys (meta only — never returns the hash or raw key).
 */
export async function listApiKeys(userId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return [];

  const { data, error } = await admin
    .from('api_keys')
    .select('id, key_prefix, name, created_at, last_used_at, revoked')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Pick<ApiKeyRow, 'id' | 'key_prefix' | 'name' | 'created_at' | 'last_used_at' | 'revoked'>[];
}

/**
 * Revoke (soft-delete) an API key.
 */
export async function revokeApiKey(userId: string, keyId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Supabase admin not configured');

  const { error } = await admin
    .from('api_keys')
    .update({ revoked: true } as never)
    .eq('id', keyId)
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
}
