import { Resend } from "resend";

let resend: Resend | null = null;

function getResend(): Resend {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

interface TransactionalEmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export async function sendTransactionalEmail(params: TransactionalEmailParams) {
  const client = getResend();

  const result = await client.emails.send({
    from: params.from ?? "ProLife <noreply@prolife.swiss>",
    to: params.to,
    subject: params.subject,
    html: params.html,
  });

  return result;
}
