/**
 * VAPI tool definitions for email and SMS that the AI agent can invoke
 * mid-conversation. These are "server" type tools — VAPI sends the
 * tool-call to our webhook, we execute it, and return the result.
 *
 * VAPI docs: https://docs.vapi.ai/tools/server-tools
 *
 * The serverUrl should point to:
 *   https://<your-domain>/api/webhooks/vapi/tool-call
 */

const TOOL_CALL_ENDPOINT = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/vapi/tool-call`
  : '/api/webhooks/vapi/tool-call';

/**
 * "send_sms" tool — the agent can send an SMS during a conversation.
 */
export const sendSmsTool = {
  type: 'function' as const,
  function: {
    name: 'send_sms',
    description:
      'Send an SMS text message to a phone number. Use this when the caller asks you to send them (or someone else) a text message, confirmation, link, or follow-up information via SMS.',
    parameters: {
      type: 'object' as const,
      properties: {
        to: {
          type: 'string' as const,
          description: 'The recipient phone number in E.164 format (e.g. +14155551234). If the caller provides their number without a country code, assume +1 for US numbers.',
        },
        message: {
          type: 'string' as const,
          description: 'The text message body to send.',
        },
      },
      required: ['to', 'message'],
    },
  },
  server: {
    url: TOOL_CALL_ENDPOINT,
  },
};

/**
 * "send_email" tool — the agent can send an email during a conversation.
 */
export const sendEmailTool = {
  type: 'function' as const,
  function: {
    name: 'send_email',
    description:
      'Send an email to a recipient. Use this when the caller asks you to email them (or someone else) information, a summary, documents, follow-up details, or confirmations.',
    parameters: {
      type: 'object' as const,
      properties: {
        to: {
          type: 'string' as const,
          description: 'The recipient email address.',
        },
        subject: {
          type: 'string' as const,
          description: 'The email subject line.',
        },
        body: {
          type: 'string' as const,
          description: 'The email body content. Can include basic formatting.',
        },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  server: {
    url: TOOL_CALL_ENDPOINT,
  },
};

/**
 * All notification tools, ready to spread into an assistant's model.tools array.
 */
export const notificationTools = [sendSmsTool, sendEmailTool];

/**
 * System prompt addendum that tells the agent about its email/SMS capabilities.
 */
export const NOTIFICATION_TOOLS_PROMPT = `

## Communication Tools
You have tools to send SMS messages and emails during the conversation.

### When to use:
- **send_sms**: When the caller asks you to text them something (confirmation, link, summary, info). Always confirm the phone number before sending.
- **send_email**: When the caller asks you to email them something (summary, details, documents). Always confirm the email address before sending.

### Guidelines:
- Always confirm the recipient's contact information before sending.
- After sending, confirm to the caller that the message was sent successfully.
- If sending fails, apologize and offer to try again or suggest an alternative.
- Keep SMS messages concise (under 160 characters when possible).
- For emails, use a clear subject line and well-structured body.
`;
