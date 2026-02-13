/**
 * RBAC role catalog unit tests. Run: node src/rbac/roleCatalog.test.js (from server dir)
 */
import {
  getCanonicalRoleNames,
  isCanonicalRoleName,
  resolveToCanonical,
  getPermissionsForRole,
} from './roleCatalog.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  const canonical = getCanonicalRoleNames();
  assert(Array.isArray(canonical) && canonical.length === 5, 'Canonical roles should be 5');
  assert(canonical.includes('System Admin'), 'Must include System Admin');
  assert(canonical.includes('Quality Manager') && canonical.includes('Manager') && canonical.includes('User') && canonical.includes('Read-Only'), 'Must include all canonical names');

  assert(isCanonicalRoleName('System Admin') === true, 'System Admin is canonical');
  assert(isCanonicalRoleName('Admin') === false, 'Admin is not canonical');
  assert(isCanonicalRoleName('Quality') === false, 'Quality is not canonical');

  assert(resolveToCanonical('Admin') === 'System Admin', 'Admin -> System Admin');
  assert(resolveToCanonical('System Administrator') === 'System Admin', 'System Administrator -> System Admin');
  assert(resolveToCanonical('Quality') === 'Quality Manager', 'Quality -> Quality Manager');
  assert(resolveToCanonical('Unknown Role') === 'User', 'Unknown -> User (fallback)');
  assert(resolveToCanonical('Read-Only') === 'Read-Only', 'Read-Only stays Read-Only');

  const sysAdminPerms = getPermissionsForRole('System Admin');
  assert(Array.isArray(sysAdminPerms) && sysAdminPerms.length > 0, 'System Admin has permissions');
  const readOnlyPerms = getPermissionsForRole('Read-Only');
  assert(Array.isArray(readOnlyPerms) && readOnlyPerms.includes('document:view') && readOnlyPerms.includes('capa:view'), 'Read-Only has view permissions');

  console.log('RBAC role catalog tests: OK');
}

run();
console.log('All RBAC catalog tests passed.');
