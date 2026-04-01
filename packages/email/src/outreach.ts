import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

let sesClient: SESClient | null = null;

function getSES(): SESClient {
  if (!sesClient) {
    sesClient = new SESClient({
      region: process.env.SES_REGION ?? "eu-west-1",
      credentials: {
        accessKeyId: process.env.SES_ACCESS_KEY_ID!,
        secretAccessKey: process.env.SES_SECRET_ACCESS_KEY!,
      },
    });
  }
  return sesClient;
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
  const ses = getSES();

  const command = new SendEmailCommand({
    Source: params.from ?? "ProLife Partnership <partnerships@prolife.swiss>",
    Destination: {
      ToAddresses: [params.to],
    },
    Message: {
      Subject: { Data: params.subject, Charset: "UTF-8" },
      Body: {
        Html: {
          Data: wrapInTemplate(params.body),
          Charset: "UTF-8",
        },
      },
    },
    ReplyToAddresses: [params.replyTo ?? "partnerships@prolife.swiss"],
  });

  const result = await ses.send(command);

  return {
    messageId: result.MessageId ?? "",
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
