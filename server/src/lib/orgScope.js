/**
 * Multi-tenant org-scope helpers.
 *
 * resolveRequestOrgId(req) — primary path for every authenticated route.
 *   1. req.clerkPayload.org_id  → find / JIT-create the QMS Organization row.
 *   2. MACTECH_DEFAULT_ORG_ID   → fallback for integration-token routes and
 *                                  internal MacTech users with no active Clerk org.
 *
 * getMacTechOrgId() — kept for integration-token routes that still need the
 *   single-tenant default (Codex federation, CMMC read endpoints). Will be
 *   replaced when those routes are made org-aware.
 */

import { prisma } from '../db.js';

const _defaultOrgId = process.env.MACTECH_DEFAULT_ORG_ID;

export const MACTECH_DEFAULT_ORG_ID = _defaultOrgId;

export function getMacTechOrgId() {
  if (!_defaultOrgId) {
    throw new Error(
      'MACTECH_DEFAULT_ORG_ID is not set. Run the phase1a rename SQL and set the returned id in env.'
    );
  }
  return _defaultOrgId;
}

/**
 * Resolve the QMS Organization for this request and cache on req._qmsOrgId.
 * Always await this; route handlers should use req.organizationId instead
 * (set by authMiddleware via this function).
 *
 * @param {import('express').Request} req
 * @returns {Promise<string>} QMS organization UUID
 */
export async function resolveRequestOrgId(req) {
  if (req._qmsOrgId) return req._qmsOrgId;

  const clerkOrgId = req.clerkPayload?.org_id;
  if (clerkOrgId) {
    let org = await prisma.organization.findUnique({
      where: { clerkOrgId },
      select: { id: true },
    });

    if (!org) {
      // JIT-provision: first time this Clerk org accesses the QMS.
      const rawSlug = (req.clerkPayload.org_slug ?? clerkOrgId)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .slice(0, 63);
      const name = req.clerkPayload.org_slug ?? clerkOrgId;
      try {
        org = await prisma.organization.create({
          data: { name, slug: rawSlug, clerkOrgId },
          select: { id: true },
        });
        console.log(`[orgScope] JIT-provisioned QMS org ${org.id} for Clerk org ${clerkOrgId}`);
      } catch (err) {
        // P2002 = unique constraint — another concurrent request won the race.
        if (err.code === 'P2002') {
          org = await prisma.organization.findUnique({
            where: { clerkOrgId },
            select: { id: true },
          });
        }
        if (!org) throw err;
      }
    }

    req._qmsOrgId = org.id;
    return org.id;
  }

  // Clerk-authenticated user with no active organization — reject rather than
  // silently fall through to the MacTech default. The frontend is responsible
  // for ensuring an org is selected before making API calls.
  if (req.clerkPayload) {
    throw Object.assign(
      new Error('No active organization in session. Select an organization in the QMS before proceeding.'),
      { statusCode: 403 },
    );
  }

  // No Clerk payload at all (integration token, internal tooling).
  // Fall back to the global default org.
  if (!_defaultOrgId) {
    throw new Error(
      'No org context: MACTECH_DEFAULT_ORG_ID is not set.'
    );
  }
  req._qmsOrgId = _defaultOrgId;
  return _defaultOrgId;
}
