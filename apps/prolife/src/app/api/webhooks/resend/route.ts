import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@agency/db";

// Email status rank — higher number = more progressed, never downgrade
const STATUS_RANK: Record<string, number> = {
  QUEUED: 0,
  SENT: 1,
  DELIVERED: 2,
  OPENED: 3,
  CLICKED: 4,
  REPLIED: 5,
  BOUNCED: 6,
  FAILED: 7,
};

// Map Resend event types to our EmailStatus enum
const EVENT_TO_STATUS: Record<string, string> = {
  "email.sent": "SENT",
  "email.delivered": "DELIVERED",
  "email.opened": "OPENED",
  "email.clicked": "CLICKED",
  "email.bounced": "BOUNCED",
  "email.complained": "BOUNCED",
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");

    // Verify webhook signature if secret is configured
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (webhookSecret && (!svixId || !svixTimestamp || !svixSignature)) {
      return NextResponse.json({ error: "Missing signature headers" }, { status: 401 });
    }

    if (webhookSecret && svixId && svixTimestamp && svixSignature) {
      const isValid = await verifySignature(webhookSecret, svixId, svixTimestamp, svixSignature, JSON.stringify(body));
      if (!isValid) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const eventType: string = body.type;
    const eventData = body.data;

    // Only process known email events
    const newStatus = EVENT_TO_STATUS[eventType];
    if (!newStatus) {
      // Unknown event type (e.g., email.delivery_delayed) — acknowledge but skip
      return NextResponse.json({ received: true });
    }

    // Use svix-id for idempotency, fallback to generated key
    const externalId = svixId ?? `${eventType}-${eventData?.email_id ?? "unknown"}-${Date.now()}`;

    // Check idempotency
    const existing = await prisma.webhookEvent.findUnique({
      where: { externalId },
    });
    if (existing) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    // Find the email by Resend message ID
    const resendEmailId: string | undefined = eventData?.email_id;
    if (!resendEmailId) {
      return NextResponse.json({ received: true, skipped: "no email_id" });
    }

    const email = await prisma.email.findFirst({
      where: { messageId: resendEmailId },
    });

    if (!email) {
      // Store event even if email not found (for debugging)
      await prisma.webhookEvent.create({
        data: {
          externalId,
          type: eventType,
          payload: body,
          processedAt: new Date(),
        },
      });
      return NextResponse.json({ received: true, skipped: "email not found" });
    }

    // Progressive status check — never downgrade
    const currentRank = STATUS_RANK[email.status] ?? 0;
    const newRank = STATUS_RANK[newStatus] ?? 0;
    const shouldUpdateStatus = newRank > currentRank;

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (shouldUpdateStatus) {
      updateData.status = newStatus;
    }
    if (newStatus === "OPENED" && !email.openedAt) {
      updateData.openedAt = new Date();
    }

    // Atomic: store webhook event + update email
    await prisma.$transaction([
      prisma.webhookEvent.create({
        data: {
          externalId,
          type: eventType,
          payload: body,
          processedAt: new Date(),
        },
      }),
      ...(Object.keys(updateData).length > 0
        ? [
            prisma.email.update({
              where: { id: email.id },
              data: updateData,
            }),
          ]
        : []),
    ]);

    return NextResponse.json({
      received: true,
      emailId: email.id,
      statusUpdated: shouldUpdateStatus,
      newStatus: shouldUpdateStatus ? newStatus : email.status,
    });
  } catch (error) {
    console.error("[Webhook] Error processing Resend webhook:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Verify Svix webhook signature using Web Crypto API (no external deps)
async function verifySignature(
  secret: string,
  msgId: string,
  timestamp: string,
  signatures: string,
  body: string
): Promise<boolean> {
  try {
    // Resend/Svix secret is base64-encoded, prefixed with "whsec_"
    const secretBytes = base64ToUint8Array(
      secret.startsWith("whsec_") ? secret.slice(6) : secret
    );

    const signedContent = `${msgId}.${timestamp}.${body}`;
    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
      "raw",
      secretBytes.buffer as ArrayBuffer,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(signedContent)
    );

    const expectedSignature = uint8ArrayToBase64(new Uint8Array(signature));

    // Svix sends multiple signatures separated by space, each prefixed with "v1,"
    const providedSignatures = signatures.split(" ");
    return providedSignatures.some((sig) => {
      const sigValue = sig.startsWith("v1,") ? sig.slice(3) : sig;
      return sigValue === expectedSignature;
    });
  } catch {
    return false;
  }
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
