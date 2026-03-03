import { NextResponse } from 'next/server';
import { createOutboundCall, fetchAssistantById, updateAssistant } from '@/lib/services/orbit';
import { resolveKnowledgeForCall } from '@/lib/services/knowledge';
import { authenticateRequest } from '@/lib/auth/guard';

/**
 * POST /api/orbit/call
 *
 * Create an outbound phone call.
 *
 * Body:
 *   {
 *     assistantId: string,          // required
 *     customerNumber: string,       // required, E.164 or 10-digit
 *     // ── Dynamic Knowledge Base (optional) ──
 *     datasetIds?: string[],        // IDs of stored knowledge datasets
 *     knowledgeData?: [             // inline data attached to this call
 *       { name: string, data: any[] }
 *     ],
 *     // ── Post-call notifications (optional) ──
 *     notify?: {
 *       sms?: { enabled: boolean, template?: string },
 *       email?: { enabled: boolean, to?: string, subject?: string, template?: string },
 *     }
 *   }
 */
export async function POST(req: Request) {
  try {
    const auth = await authenticateRequest(req);
    const body = await req.json();
    const { assistantId, customerNumber, datasetIds, knowledgeData, notify } = body;

    if (!assistantId || !customerNumber) {
      return NextResponse.json(
        { error: 'assistantId and customerNumber are required' },
        { status: 400 },
      );
    }

    // ── Inject dynamic knowledge into the assistant's system prompt ──
    const knowledgePrompt = await resolveKnowledgeForCall({
      userId: auth.userId ?? undefined,
      datasetIds,
      inlineData: knowledgeData,
    });

    if (knowledgePrompt) {
      // Fetch assistant, append knowledge, update before call
      const assistant = await fetchAssistantById(assistantId);
      if (assistant) {
        const existingPrompt =
          assistant.model?.messages?.[0]?.content || 'You are a helpful AI assistant.';
        await updateAssistant(assistantId, {
          model: {
            messages: [
              { role: 'system', content: existingPrompt + knowledgePrompt },
            ],
          },
        });
      }
    }

    // ── Store notification preferences in assistant metadata ──
    if (notify) {
      try {
        const metadataPayload: Record<string, unknown> = { metadata: { notifications: notify } };
        // Use the VAPI API directly to set metadata (updateAssistant only handles known fields)
        const orbitSecret = (
          process.env.VAPI_PRIVATE_API_KEY ||
          process.env.ORBIT_SECRET ||
          process.env.VAPI_API_KEY ||
          ''
        ).trim();
        if (orbitSecret) {
          await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${orbitSecret}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(metadataPayload),
          });
        }
      } catch {
        // Non-critical: don't block the call
        console.warn('[orbit/call] Failed to set notification metadata');
      }
    }

    const result = await createOutboundCall({ assistantId, customerNumber });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
