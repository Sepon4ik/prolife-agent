"use server";

import { prisma } from "@agency/db";
import { z } from "zod";
import { revalidatePath } from "next/cache";

const UpdateStatusSchema = z.object({
  companyId: z.string().min(1),
  status: z.enum([
    "RAW",
    "ENRICHED",
    "SCORED",
    "OUTREACH_SENT",
    "REPLIED",
    "INTERESTED",
    "NOT_INTERESTED",
    "HANDED_OFF",
    "DISQUALIFIED",
  ]),
});

export async function updateCompanyStatus(
  input: z.infer<typeof UpdateStatusSchema>
) {
  const { companyId, status } = UpdateStatusSchema.parse(input);

  await prisma.company.update({
    where: { id: companyId },
    data: { status },
  });

  revalidatePath("/dashboard/companies");
}
