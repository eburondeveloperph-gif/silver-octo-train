import { NextResponse } from 'next/server';
import { createAgent, createAssistantFromScratch, updateAssistant, toNova2Language, orbitCoreRequest } from '@/lib/services/orbit';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const enableTools = body.enableTools !== false; // default true

    // Update existing assistant when assistantId is provided
    if (body.assistantId && body.name && (body.systemPrompt ?? body.firstMessage)) {
      const voice = body.voice
        ? { provider: body.voice.provider || '11labs', voiceId: body.voice.voiceId }
        : undefined;

      // Build model payload
      let systemPrompt = body.systemPrompt || 'You are a helpful AI assistant.';
      const modelPayload: Record<string, unknown> = {
        messages: [
          { role: 'system', content: systemPrompt },
        ],
      };

      // Attach notification tools if enabled
      if (enableTools) {
        const { notificationTools, NOTIFICATION_TOOLS_PROMPT } = await import('@/lib/services/agent-tools');
        systemPrompt += NOTIFICATION_TOOLS_PROMPT;
        modelPayload.messages = [{ role: 'system', content: systemPrompt }];
        modelPayload.tools = notificationTools;
      }

      const result = await updateAssistant(body.assistantId, {
        name: body.name,
        firstMessage: body.firstMessage || undefined,
        model: modelPayload as { messages: { role: string; content: string }[] },
        ...(voice && { voice: voice }),
        ...(body.language && {
          transcriber: { language: toNova2Language(body.language) },
        }),
      });

      // Set serverUrl for tool execution if tools enabled
      if (enableTools && process.env.NEXT_PUBLIC_APP_URL) {
        try {
          await orbitCoreRequest('PATCH', `/assistant/${body.assistantId}`, {
            serverUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/vapi/tool-call`,
          });
        } catch {
          // Non-critical
          console.warn('[agents] Could not set serverUrl for tools');
        }
      }

      return NextResponse.json(result);
    }
    // Create from scratch when assistantId is not provided
    if (!body.assistantId && body.name && (body.systemPrompt ?? body.firstMessage)) {
      const result = await createAssistantFromScratch({
        name: body.name,
        firstMessage: body.firstMessage || '',
        systemPrompt: body.systemPrompt || 'You are a helpful AI assistant.',
        language: body.language,
        voice: body.voice,
        enableTools,
      });
      return NextResponse.json(result);
    }
    // Clone from existing assistant
    const result = await createAgent(body);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
