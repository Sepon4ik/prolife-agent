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

  const result = await client.emails.send({
    from: params.from ?? "ProLife Partnership <partnerships@prolife.swiss>",
    to: params.to,
    subject: params.subject,
    html: wrapInTemplate(params.body),
    reply_to: params.replyTo ?? "partnerships@prolife.swiss",
  });

  return {
    messageId: result.data?.id ?? "",
  };
}

function wrapInTemplate(body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto;">
  ${body}
  <br><br>
  <div style="border-top: 1px solid #eee; padding-top: 16px; font-size: 12px; color: #999;">
    ProLife AG | Swiss Medical Technology<br>
    <a href="https://prolife.swiss" style="color: #c41e3a;">prolife.swiss</a>
  </div>
</body>
</html>`;
}
