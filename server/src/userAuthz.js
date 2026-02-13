/**
 * Role-based access control for user management.
 * - System Admin: full (create, update any, assign any role, delete).
 * - Manager: create, update:basic, assign_roles:basic (User only), no delete.
 * - Quality Manager: create, update:compliance, assign_roles:basic (User only), no delete.
 * - User / Read-Only: no user management.
 */

const SYS_ADMIN_NAMES = ['System Admin'];
const PRIVILEGED_ROLE_NAMES = ['System Admin', 'Quality Manager', 'Manager'];
const BASIC_ROLE_NAMES = ['User', 'Read-Only'];

/**
 * Role names the actor is allowed to assign.
 * - System Admin: any role.
 * - Manager: only User (and Read-Only if in catalog).
 * - Quality Manager: only User, Read-Only.
 */
export function getAssignableRoleNames(actorRoleName) {
  if (!actorRoleName) return [];
  if (SYS_ADMIN_NAMES.includes(actorRoleName)) return null; // null = any
  if (actorRoleName === 'Manager') return [...BASIC_ROLE_NAMES];
  if (actorRoleName === 'Quality Manager') return ['User', 'Read-Only'];
  return [];
}

/**
 * Whether the target user is privileged (only Sys Admin can edit/delete them).
 */
export function isPrivilegedUser(targetRoleName) {
  return targetRoleName && PRIVILEGED_ROLE_NAMES.includes(targetRoleName);
}

/**
 * Throws 403 if actor cannot assign the given role. Use after resolving roleId to role (by name).
 */
export function assertCanAssignRole(actor, roleName) {
  const allowed = getAssignableRoleNames(actor?.roleName);
  if (allowed === null) return; // sys admin can assign any
  if (!allowed.length) {
    const err = new Error('You do not have permission to assign roles.');
    err.statusCode = 403;
    throw err;
  }
  if (!roleName || !allowed.includes(roleName)) {
    const err = new Error('You can only assign these roles: ' + allowed.join(', ') + '.');
    err.statusCode = 403;
    throw err;
  }
}

/**
 * Throws 403 if actor cannot edit the target user (e.g. manager/quality cannot edit privileged users).
 */
export function assertCanEditTarget(actor, targetUser) {
  if (!actor || !targetUser) {
    const err = new Error('Unauthorized');
    err.statusCode = 403;
    throw err;
  }
  if (SYS_ADMIN_NAMES.includes(actor.roleName)) return;
  const targetRoleName = targetUser.role?.name ?? targetUser.roleName;
  if (isPrivilegedUser(targetRoleName)) {
    const err = new Error('You cannot edit users with privileged roles (System Admin, Quality Manager, Manager).');
    err.statusCode = 403;
    throw err;
  }
}

/**
 * Throws 403 if actor cannot delete users (only System Admin / Admin).
 */
export function assertCanDeleteUser(actor) {
  if (!actor) {
    const err = new Error('Unauthorized');
    err.statusCode = 403;
    throw err;
  }
  if (SYS_ADMIN_NAMES.includes(actor.roleName)) return;
  const err = new Error('Only System Admin can delete users.');
  err.statusCode = 403;
  throw err;
}

/**
 * Returns which update fields the actor is allowed to set, based on permissions and role.
 * Returns array of field names: firstName, lastName, departmentId, siteId, jobTitle, status, mfaEnabled, roleId.
 */
export function getAllowedUpdateFields(actor) {
  const perms = actor?.permissions || [];
  const roleName = actor?.roleName;

  if (SYS_ADMIN_NAMES.includes(roleName)) {
    return ['firstName', 'lastName', 'departmentId', 'siteId', 'jobTitle', 'status', 'mfaEnabled', 'roleId'];
  }
  if (perms.includes('users:update') || perms.includes('users:update:any')) {
    return ['firstName', 'lastName', 'departmentId', 'siteId', 'jobTitle', 'status', 'mfaEnabled', 'roleId'];
  }
  if (perms.includes('users:update:basic')) {
    return ['firstName', 'lastName', 'departmentId', 'siteId', 'jobTitle', 'status', 'mfaEnabled'];
  }
  if (perms.includes('users:update:compliance')) {
    return ['status', 'mfaEnabled', 'departmentId', 'siteId'];
  }
  return [];
}

/**
 * Whether actor has permission to change the target's role (must also pass assertCanAssignRole for the new role).
 */
export function canChangeRole(actor) {
  const perms = actor?.permissions || [];
  if (SYS_ADMIN_NAMES.includes(actor?.roleName)) return true;
  return perms.includes('users:assign_roles:any') || perms.includes('users:assign_roles:basic');
}
