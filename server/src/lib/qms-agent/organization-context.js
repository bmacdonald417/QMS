import { prisma } from '../../db.js';

/** Default org slug used by the QMS Agent execution packaging APIs. */
export const PRIMARY_ORG_SLUG = 'primary';

/**
 * @param {string} slug
 */
export async function getOrganizationBySlug(slug) {
  return prisma.organization.findUnique({ where: { slug } });
}

/**
 * Ensures a membership row exists for the user in the organization.
 * @param {{ organizationId: string, userId: string }} params
 * @returns {Promise<{ id: string }>}
 */
export async function ensureOrganizationMembership({ organizationId, userId }) {
  const existing = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { id: true },
  });
  if (existing) return existing;
  return prisma.organizationMembership.create({
    data: { organizationId, userId },
    select: { id: true },
  });
}

/**
 * @param {string} membershipId
 * @param {string} organizationId
 */
export async function assertMembershipInOrg(membershipId, organizationId) {
  const m = await prisma.organizationMembership.findFirst({
    where: { id: membershipId, organizationId },
    select: { id: true },
  });
  return Boolean(m);
}
