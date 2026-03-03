// Server-side only: use private API key for fetching/creating assistants.
const SECRET =
  process.env.VAPI_PRIVATE_API_KEY ||
  process.env.ORBIT_SECRET ||
  process.env.VAPI_API_KEY ||
  '';

function getOrbitSecret() {
  return SECRET.trim();
}

export async function orbitCoreRequest(method: string, endpoint: string, payload: unknown = null) {
  const orbitSecret = getOrbitSecret();
  if (!orbitSecret) {
    throw new Error(
      'Missing agents API key. Set ORBIT_SECRET in .env.local (server-side only).'
    );
  }

  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${orbitSecret}`,
    },
    ...(method === 'GET' && { cache: 'no-store' as RequestCache }),
  };

  if (payload) {
    options.headers = {
      ...options.headers,
      'Content-Type': 'application/json',
    };
    options.body = JSON.stringify(payload);
  }

  const res = await fetch(`https://api.vapi.ai${endpoint}`, options);
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || "Orbit core Request failed");
  }
  return res.json();
}

export async function fetchAssistants() {
  // Keep the dashboard usable when Orbit is not configured.
  if (!getOrbitSecret()) return [];
  const raw = await orbitCoreRequest('GET', '/assistant');
  // VAPI returns an array; normalize in case of paginated/wrapped response.
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object' && Array.isArray((raw as { assistants?: unknown[] }).assistants)) {
    return (raw as { assistants: unknown[] }).assistants;
  }
  if (raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown[] }).data)) {
    return (raw as { data: unknown[] }).data;
  }
  return [];
}

export async function createAgent(payload: unknown) {
  return orbitCoreRequest('POST', '/assistant', payload);
}

/** Assistant from VAPI (for get/update) */
export type VapiAssistant = {
  id: string;
  name?: string;
  firstMessage?: string;
  model?: { messages?: { role?: string; content?: string }[] };
  voice?: { provider?: string; voiceId?: string };
  transcriber?: { language?: string };
  [key: string]: unknown;
};

export async function fetchAssistantById(id: string) {
  if (!getOrbitSecret()) return null;
  return orbitCoreRequest('GET', `/assistant/${id}`) as Promise<VapiAssistant>;
}

export async function updateAssistant(id: string, payload: Partial<{
  name: string;
  firstMessage: string;
  model: { messages: { role: string; content: string }[] };
  voice: { provider: string; voiceId: string };
  transcriber: { language: string };
}>) {
  return orbitCoreRequest('PATCH', `/assistant/${id}`, payload) as Promise<VapiAssistant>;
}

/**
 * Create a new assistant from scratch (full CreateAssistantDTO).
 * Used when user provides name, firstMessage, model.messages (system prompt), etc.
 * voice: { provider: 'vapi'|'11labs', voiceId: string }
 */
/** Valid Deepgram nova-2 transcriber language codes. Maps form values to valid API values. */
export const NOVA2_LANGUAGES = new Set([
  'en', 'bg', 'ca', 'zh', 'zh-CN', 'zh-HK', 'zh-Hans', 'zh-TW', 'zh-Hant', 'cs', 'da', 'da-DK',
  'nl', 'en-US', 'en-AU', 'en-GB', 'en-NZ', 'en-IN', 'et', 'fi', 'nl-BE', 'fr', 'fr-CA', 'de',
  'de-CH', 'el', 'hi', 'hu', 'id', 'it', 'ja', 'ko', 'ko-KR', 'lv', 'lt', 'ms', 'multi', 'no',
  'pl', 'pt', 'pt-BR', 'ro', 'ru', 'sk', 'es', 'es-419', 'sv', 'sv-SE', 'th', 'th-TH', 'tr', 'uk', 'vi',
]);

export function toNova2Language(lang: string | undefined): string {
  if (!lang) return 'en';
  if (lang === 'multilingual') return 'multi';
  if (NOVA2_LANGUAGES.has(lang)) return lang;
  return 'multi'; // fallback for unsupported (ar, fil, he, etc.)
}

export async function createAssistantFromScratch(params: {
  name: string;
  firstMessage: string;
  systemPrompt: string;
  language?: string;
  voice?: { provider: 'vapi' | '11labs'; voiceId: string };
  enableTools?: boolean;
}) {
  const { name, firstMessage, systemPrompt, language, voice, enableTools = true } = params;
  const voiceConfig = voice?.provider && voice?.voiceId
    ? { provider: voice.provider as 'vapi' | '11labs', voiceId: voice.voiceId }
    : { provider: '11labs' as const, voiceId: 'EXAVITQu4vr4xnSDxMaL' };

  // Import agent tools dynamically to avoid circular deps
  const { notificationTools, NOTIFICATION_TOOLS_PROMPT } = await import('@/lib/services/agent-tools');

  const finalSystemPrompt = enableTools
    ? (systemPrompt || 'You are a helpful AI assistant.') + NOTIFICATION_TOOLS_PROMPT
    : (systemPrompt || 'You are a helpful AI assistant.');

  const payload: Record<string, unknown> = {
    name,
    firstMessage: firstMessage || undefined,
    firstMessageMode: 'assistant-speaks-first' as const,
    model: {
      provider: 'openai' as const,
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system' as const, content: finalSystemPrompt },
      ],
      ...(enableTools ? { tools: notificationTools } : {}),
    },
    voice: voiceConfig,
    transcriber: {
      provider: 'deepgram' as const,
      model: 'nova-2',
      language: toNova2Language(language),
    },
    // VAPI server URL for tool execution
    ...(enableTools ? {
      serverUrl: process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/vapi/tool-call`
        : undefined,
    } : {}),
  };
  return orbitCoreRequest('POST', '/assistant', payload);
}

/**
 * Create an outbound phone call. Requires PHONE_NUMBER_ID in .env.
 */
export async function createOutboundCall(params: {
  assistantId: string;
  customerNumber: string;
}) {
  const phoneNumberId = (process.env.PHONE_NUMBER_ID || process.env.VAPI_PHONE_NUMBER_ID || '').trim();
  if (!phoneNumberId) {
    throw new Error(
      'Missing PHONE_NUMBER_ID. Add a phone number ID to .env.local for outbound calls.'
    );
  }
  const e164 = params.customerNumber.startsWith('+')
    ? params.customerNumber
    : params.customerNumber.length === 10
      ? `+1${params.customerNumber}`
      : `+${params.customerNumber}`;
  const payload = {
    assistantId: params.assistantId,
    phoneNumberId,
    customer: { number: e164 },
  };
  return orbitCoreRequest('POST', '/call', payload);
}

/** Call record from VAPI list endpoint */
export type VapiCallRecord = {
  id: string;
  type?: 'inboundPhoneCall' | 'outboundPhoneCall' | 'webCall' | 'vapi.websocketCall';
  status?: string;
  customer?: { number?: string };
  assistantId?: string;
  createdAt?: string;
  endedAt?: string;
  [key: string]: unknown;
};

/**
 * List recent calls from VAPI.
 */
export async function fetchCalls(params?: { limit?: number; assistantId?: string }) {
  if (!getOrbitSecret()) return [];
  const limit = params?.limit ?? 20;
  const assistantId = params?.assistantId;
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  if (assistantId) qs.set('assistantId', assistantId);
  const raw = await orbitCoreRequest('GET', `/call?${qs.toString()}`);
  if (Array.isArray(raw)) return raw as VapiCallRecord[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as { calls?: unknown[] }).calls)) {
    return (raw as { calls: VapiCallRecord[] }).calls;
  }
  return [];
}

/**
 * Fetch a single call by ID (includes artifact with recordingUrl if recording was enabled).
 */
export async function fetchCallById(id: string) {
  if (!getOrbitSecret()) return null;
  return orbitCoreRequest('GET', `/call/${id}`) as Promise<VapiCallRecord & { artifact?: { recordingUrl?: string; stereoRecordingUrl?: string } }>;
}
