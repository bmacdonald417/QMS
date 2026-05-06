// Single-tenant org-scope helper. Read once at startup; reused by every Prisma
// query that touches Document or CmmcDocument.
//
// TODO(multi-tenant): when QMS hosts >1 org, replace this with a per-request
// helper that reads the `org` JWT claim from req.integration / req.user and
// returns it. The single-tenant call sites become per-request calls.

const value = process.env.MACTECH_DEFAULT_ORG_ID;

export function getMacTechOrgId() {
  if (!value) {
    throw new Error(
      'MACTECH_DEFAULT_ORG_ID is not set. Run the phase1a rename SQL and set the returned id in env.'
    );
  }
  return value;
}

export const MACTECH_DEFAULT_ORG_ID = value;
