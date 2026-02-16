/**
 * Canonical RBAC roles. Only these roles are kept after cleanup.
 * Deprecated role names are mapped to a canonical role for user migration.
 */

import { getValidCodes } from './permissionCatalog.js';

const CANONICAL_ROLE_NAMES = [
  'System Admin',
  'Quality Manager',
  'Manager',
  'User',
  'Read-Only',
];

const DEPRECATED_TO_CANONICAL = {
  Admin: 'System Admin',
  'System Administrator': 'System Admin',
  Quality: 'Quality Manager',
  'Quality Admin': 'Quality Manager',
  'Read-Only': 'Read-Only', // already canonical; no change
};

/** Default fallback when role name is unknown (log for review). */
const FALLBACK_CANONICAL = 'User';

/**
 * Desired permission codes per canonical role (source of truth for seed and normalization).
 * Only codes present in permissionCatalog are included.
 */
function getPermissionsForRole(roleName) {
  const all = getValidCodes();
  const byRole = {
    'System Admin': all,
    'Quality Manager': [
      'document:view', 'document:create', 'document:review', 'document:approve', 'document:release', 'document:revise:major', 'document:revise:minor',
      'users:read', 'users:create', 'users:update:compliance', 'users:assign_roles:basic', 'users:disable',
      'auditlog:view', 'system:reference:update', 'system:securitypolicy:update',
      'capa:view', 'capa:create', 'capa:update', 'capa:assign_tasks', 'capa:approve_plan', 'capa:close', 'capa:esign', 'capa:export',
      'change:view', 'change:create', 'change:update', 'change:assign_tasks', 'change:approve', 'change:close', 'change:esign',
      'file:upload', 'file:download', 'file:delete',
      'form_records:view', 'form_records:create', 'form_records:update', 'form_records:finalize', 'form_records:export',
    ],
    Manager: [
      'document:view', 'document:create', 'document:review', 'document:approve', 'document:revise:major', 'document:revise:minor',
      'users:read', 'users:create', 'users:update:basic', 'users:assign_roles:basic', 'users:disable',
      'capa:view', 'capa:update', 'capa:assign_tasks',
      'change:view', 'change:update', 'change:assign_tasks',
      'file:upload', 'file:download',
    ],
    User: [
      'document:view', 'document:create', 'document:review', 'document:revise:major', 'document:revise:minor',
      'capa:view', 'change:view', 'file:download',
    ],
    'Read-Only': [
      'document:view', 'capa:view', 'change:view', 'file:download',
    ],
  };
  const list = byRole[roleName];
  if (!list) return [];
  return list.filter((c) => all.includes(c));
}

function getCanonicalRoleNames() {
  return [...CANONICAL_ROLE_NAMES];
}

function isCanonicalRoleName(name) {
  return typeof name === 'string' && CANONICAL_ROLE_NAMES.includes(name);
}

function resolveToCanonical(deprecatedName) {
  if (!deprecatedName || typeof deprecatedName !== 'string') return FALLBACK_CANONICAL;
  const trimmed = deprecatedName.trim();
  if (CANONICAL_ROLE_NAMES.includes(trimmed)) return trimmed;
  if (Object.prototype.hasOwnProperty.call(DEPRECATED_TO_CANONICAL, trimmed)) {
    return DEPRECATED_TO_CANONICAL[trimmed];
  }
  return FALLBACK_CANONICAL;
}

export {
  CANONICAL_ROLE_NAMES,
  DEPRECATED_TO_CANONICAL,
  FALLBACK_CANONICAL,
  getCanonicalRoleNames,
  getPermissionsForRole,
  isCanonicalRoleName,
  resolveToCanonical,
};
