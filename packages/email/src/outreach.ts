import { Resend } from "resend";

let resend: Resend | null = null;

function getResend(): Resend {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

interface OutreachEmailParams {
  to: string;
  subject: string;
  body: string;
  from?: string;
  replyTo?: string;
}

export async function sendOutreachEmail(
  params: OutreachEmailParams
): Promise<{ messageId: string }> {
  const client = getResend();

  // Plain text only — no HTML. Critical for cold email deliverability.
  // HTML triggers Gmail Promotions/Spam filters on new domains.
  const plainBody = stripHtml(params.body);
  const fullBody = `${plainBody}\n\n--\nProLife AG | Swiss Medical Technology\nprolife.swiss`;

  const result = await client.emails.send({
    from: params.from ?? "ProLife Partnership <partnerships@prolife-global.net>",
    to: params.to,
    subject: params.subject,
    text: fullBody,
    replyTo: params.replyTo ?? "partnerships@prolife-global.net",
  });

  return {
    messageId: result.data?.id ?? "",
  };
}

function stripHtml(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
