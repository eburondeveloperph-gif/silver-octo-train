import { NextResponse } from 'next/server';
import { sendSms, sendEmail } from '@/lib/services/notifications';
import { authenticateRequest, unauthorizedResponse } from '@/lib/auth/guard';

/**
 * POST /api/notifications/send
 *
 * Send an SMS or email notification.
 *
 * Body:
 *   {
 *     channel: "sms" | "email",
 *     to: string,              // phone number or email address
 *     body: string,            // message body (plain text or HTML for email)
 *     subject?: string,        // required for email
 *     callId?: string,         // optional VAPI call ID for audit trail
 *     assistantId?: string,    // optional VAPI assistant ID
 *   }
 */
export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth.authenticated) return unauthorizedResponse();

  try {
    const body = await request.json();
    const { channel, to, body: messageBody, subject, callId, assistantId } = body;

    if (!channel || !to || !messageBody) {
      return NextResponse.json(
        { error: 'channel, to, and body are required' },
        { status: 400 },
      );
    }

    if (channel === 'sms') {
      const result = await sendSms({
        to,
        body: messageBody,
        userId: auth.userId ?? undefined,
        callId,
        assistantId,
      });
      return NextResponse.json(result, { status: result.success ? 200 : 502 });
    }

    if (channel === 'email') {
      if (!subject) {
        return NextResponse.json({ error: 'subject is required for email' }, { status: 400 });
      }
      const result = await sendEmail({
        to,
        subject,
        body: messageBody,
        userId: auth.userId ?? undefined,
        callId,
        assistantId,
      });
      return NextResponse.json(result, { status: result.success ? 200 : 502 });
    }

    return NextResponse.json(
      { error: `Invalid channel "${channel}". Use "sms" or "email".` },
      { status: 400 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
