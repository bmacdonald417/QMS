// MacTech Identity Command Center (ICC) → QMS role mapping.
//
// QMS roles are: System Admin, Quality Manager, Manager, User, Read-Only.
// ICC roles are: customer_owner, customer_admin, compliance_manager,
//                security_manager, evidence_contributor, auditor,
//                read_only_user.
//
// Used at JIT-provision time (server/src/auth.js) to set the default QMS
// role for a user signing in for the first time. After provisioning, the
// QMS role is the source of truth — manual overrides via /system/users
// take precedence over ICC. See:
//   docs/specs/identity-and-roles-architecture.md  (codex repo)
//
// CMMC alignment:
//   3.1.1 Account management — JIT only creates accounts for ICC-entitled users
//   3.1.2 Access enforcement — QMS-local roles enforce the actual permissions
//   3.4.5 Authorize changes — every role override audit-logged in QMS

/**
 * @param {string|null|undefined} iccRole
 * @param {boolean} isInternalMacTechUser
 * @returns {string} QMS Role.name
 */
export function mapIccRoleToQmsRole(iccRole, isInternalMacTechUser) {
  if (isInternalMacTechUser) return 'System Admin';
  switch (iccRole) {
    case 'customer_owner':
    case 'customer_admin':
      return 'System Admin';
    case 'compliance_manager':
      return 'Quality Manager';
    case 'security_manager':
      return 'Manager';
    case 'evidence_contributor':
      return 'User';
    case 'auditor':
    case 'read_only_user':
    default:
      return 'Read-Only';
  }
}

/**
 * Authoritative table for the override-detection UI. The frontend asks
 * "what would the ICC default for this iccRoleAtProvision be?" — if it
 * differs from the user's current QMS role, the row has been overridden.
 *
 * Returned as a {iccRole: qmsRole} map so the UI can render a hint
 * without re-implementing the mapping logic.
 */
export const ICC_TO_QMS_DEFAULT_TABLE = Object.freeze({
  customer_owner: 'System Admin',
  customer_admin: 'System Admin',
  compliance_manager: 'Quality Manager',
  security_manager: 'Manager',
  evidence_contributor: 'User',
  auditor: 'Read-Only',
  read_only_user: 'Read-Only',
});

/** Sentinel for the internal-MacTech case (not a real ICC role). */
export const INTERNAL_MACTECH_SENTINEL = '__internal_mactech__';
