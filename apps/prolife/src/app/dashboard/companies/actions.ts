"use server";

import { prisma, PipelineStage, SalesStatus } from "@agency/db";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const MoveToStageSchema = z.object({
  companyId: z.string().min(1),
  stage: z.nativeEnum(PipelineStage),
  trashReason: z.string().optional(),
});

const BulkMoveSchema = z.object({
  companyIds: z.array(z.string().min(1)).min(1),
  stage: z.nativeEnum(PipelineStage),
  trashReason: z.string().optional(),
});

const SetSalesStatusSchema = z.object({
  companyId: z.string().min(1),
  salesStatus: z.nativeEnum(SalesStatus),
});

type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string };

export async function moveToStage(
  input: z.infer<typeof MoveToStageSchema>
): Promise<ActionResult> {
  const parsed = MoveToStageSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { companyId, stage, trashReason } = parsed.data;

  if (stage === PipelineStage.TRASH && !trashReason?.trim()) {
    return { success: false, error: "Trash reason is required" };
  }

  await prisma.company.update({
    where: { id: companyId },
    data: {
      stage,
      trashReason: stage === PipelineStage.TRASH ? trashReason : null,
      salesStatus:
        stage === PipelineStage.LAST_STAGE
          ? SalesStatus.READY_TO_WORK
          : null,
      stageMovedAt: new Date(),
    },
  });

  revalidatePath("/dashboard/companies");
  return { success: true };
}

export async function bulkMoveToStage(
  input: z.infer<typeof BulkMoveSchema>
): Promise<ActionResult<{ count: number }>> {
  const parsed = BulkMoveSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { companyIds, stage, trashReason } = parsed.data;

  if (stage === PipelineStage.TRASH && !trashReason?.trim()) {
    return { success: false, error: "Trash reason is required" };
  }

  const result = await prisma.company.updateMany({
    where: { id: { in: companyIds } },
    data: {
      stage,
      trashReason: stage === PipelineStage.TRASH ? trashReason : null,
      salesStatus:
        stage === PipelineStage.LAST_STAGE
          ? SalesStatus.READY_TO_WORK
          : null,
      stageMovedAt: new Date(),
    },
  });

  revalidatePath("/dashboard/companies");
  return { success: true, data: { count: result.count } };
}

export async function setSalesStatus(
  input: z.infer<typeof SetSalesStatusSchema>
): Promise<ActionResult> {
  const parsed = SetSalesStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const { companyId, salesStatus } = parsed.data;

  // Verify company is in LAST_STAGE
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { stage: true },
  });

  if (!company) {
    return { success: false, error: "Company not found" };
  }

  if (company.stage !== PipelineStage.LAST_STAGE) {
    return { success: false, error: "Sales status only applies to Last Stage" };
  }

  await prisma.company.update({
    where: { id: companyId },
    data: { salesStatus },
  });

  revalidatePath("/dashboard/companies");
  return { success: true };
}
