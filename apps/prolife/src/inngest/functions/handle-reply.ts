import { inngest } from "@agency/queue";
import { prisma } from "@agency/db";
import { createAIClient } from "@agency/ai";

/**
 * Handle Reply
 * When a reply is received, classify the intent
 * and route appropriately (interested → handoff to sales).
 */
export const handleReply = inngest.createFunction(
  {
    id: "prolife-handle-reply",
    retries: 2,
  },
  { event: "prolife/reply.received" },
  async ({ event, step }) => {
    const { tenantId, companyId, emailId, replyBody } = event.data;

    // Step 1: Classify reply intent with AI
    const intent = await step.run("classify-reply", async () => {
      const ai = createAIClient();

      const response = await ai.classify<{
        intent: "interested" | "not_interested" | "request_info" | "out_of_office" | "unclear";
        confidence: number;
        summary: string;
      }>({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        tools: [
          {
            name: "classify_reply",
            description: "Classify the intent of an email reply",
            input_schema: {
              type: "object" as const,
              properties: {
                intent: {
                  type: "string",
                  enum: ["interested", "not_interested", "request_info", "out_of_office", "unclear"],
                },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                summary: { type: "string" },
              },
              required: ["intent", "confidence", "summary"],
            },
          },
        ],
        tool_choice: { type: "tool" as const, name: "classify_reply" },
        messages: [
          {
            role: "user",
            content: `Classify this email reply from a potential distribution partner:\n\n${replyBody}`,
          },
        ],
      });

      return response;
    });

    // Step 2: Update email and company status
    await step.run("update-status", async () => {
      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: "REPLIED",
          repliedAt: new Date(),
          replyBody,
        },
      });

      const statusMap: Record<string, string> = {
        interested: "INTERESTED",
        not_interested: "NOT_INTERESTED",
        request_info: "REPLIED",
        out_of_office: "OUTREACH_SENT",
        unclear: "REPLIED",
      };

      await prisma.company.update({
        where: { id: companyId },
        data: {
          status: statusMap[intent.intent] as any,
        },
      });
    });

    // Step 3: If interested, hand off to sales
    if (intent.intent === "interested") {
      await step.sendEvent("handoff-to-sales", {
        name: "prolife/sales.handoff",
        data: {
          tenantId,
          companyId,
          salesDirectorId: "", // Will be assigned based on region
        },
      });
    }

    return { intent: intent.intent, confidence: intent.confidence };
  }
);
