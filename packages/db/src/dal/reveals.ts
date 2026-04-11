import { prisma } from "../index";

export async function getDailyRevealCount(
  tenantId: string,
  userId: string
): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  return prisma.revealLog.count({
    where: {
      tenantId,
      userId,
      createdAt: { gte: startOfDay },
    },
  });
}

export async function getDailyRevealLimit(
  tenantId: string
): Promise<number> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { dailyRevealLimit: true },
  });
  return tenant?.dailyRevealLimit ?? 30;
}

export async function createReveal(data: {
  tenantId: string;
  userId: string;
  companyId: string;
  contactId?: string;
}): Promise<{ id: string }> {
  return prisma.revealLog.create({
    data: {
      tenantId: data.tenantId,
      userId: data.userId,
      companyId: data.companyId,
      contactId: data.contactId ?? null,
    },
    select: { id: true },
  });
}

export async function hasRevealedCompany(
  tenantId: string,
  userId: string,
  companyId: string
): Promise<boolean> {
  const count = await prisma.revealLog.count({
    where: { tenantId, userId, companyId },
  });
  return count > 0;
}
