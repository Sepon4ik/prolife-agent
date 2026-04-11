import { prisma } from "../index";

/** Get company contacts — only used after reveal check passes */
export async function getCompanyContacts(tenantId: string, companyId: string) {
  return prisma.contact.findMany({
    where: {
      company: { id: companyId, tenantId },
    },
    select: {
      id: true,
      name: true,
      title: true,
      email: true,
      phone: true,
      linkedin: true,
      photoUrl: true,
      bio: true,
      languages: true,
      isPrimary: true,
      linkedinHeadline: true,
      linkedinSeniority: true,
      linkedinDepartment: true,
    },
    orderBy: { isPrimary: "desc" },
  });
}
