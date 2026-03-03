import { NextResponse } from 'next/server';
import { sendSms, sendEmail } from '@/lib/services/notifications';

/**
 * POST /api/webhooks/vapi/tool-call
 *
 * VAPI "server tool" webhook — invoked mid-conversation when the AI
 * agent decides to call one of our registered tools (send_sms, send_email).
 *
 * VAPI sends:
 *   {
 *     message: {
 *       type: "tool-calls",
 *       toolCallList: [
 *         {
 *           id: string,
 *           type: "function",
 *           function: { name: string, arguments: Record<string, unknown> }
 *         }
 *       ],
 *       call: { id, assistantId, customer: { number }, ... }
 *     }
 *   }
 *
 * We must respond with:
 *   { results: [{ toolCallId: string, result: string }] }
 *
 * This endpoint is PUBLIC (no auth) because VAPI calls it directly.
 */
export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const message = payload?.message;

    // VAPI may send different message types — only handle tool-calls
    if (!message || message.type !== 'tool-calls') {
      return NextResponse.json({ ok: true, skipped: 'Not a tool-calls message' });
    }

    const toolCalls: {
      id: string;
      type: string;
      function: { name: string; arguments: Record<string, unknown> | string };
    }[] = message.toolCallList || [];

    const call = message.call || {};
    const callId: string = call.id || '';
    const assistantId: string = call.assistantId || '';

    const results: { toolCallId: string; result: string }[] = [];

    for (const tc of toolCalls) {
      const args =
        typeof tc.function.arguments === 'string'
          ? JSON.parse(tc.function.arguments)
          : tc.function.arguments;

      let result: string;

      switch (tc.function.name) {
        case 'send_sms': {
          const smsResult = await sendSms({
            to: args.to,
            body: args.message,
            callId,
            assistantId,
          });
          result = smsResult.success
            ? `SMS sent successfully to ${args.to}.`
            : `Failed to send SMS: ${smsResult.error}`;
          break;
        }

        case 'send_email': {
          const emailResult = await sendEmail({
            to: args.to,
            subject: args.subject,
            body: args.body,
            callId,
            assistantId,
          });
          result = emailResult.success
            ? `Email sent successfully to ${args.to}.`
            : `Failed to send email: ${emailResult.error}`;
          break;
        }

        default:
          result = `Unknown tool: ${tc.function.name}`;
      }

      results.push({ toolCallId: tc.id, result });
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error('[tool-call webhook]', err);
    // Return a graceful error so VAPI can relay it to the caller
    return NextResponse.json({
      results: [{ toolCallId: 'error', result: `Internal error: ${String(err)}` }],
    });
  }
}
