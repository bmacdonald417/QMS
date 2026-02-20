/**
 * Single source of truth for permission codes. All codes use ":" separator.
 * Used by seed, migration, and role normalization.
 */

const PERMISSION_LIST = [
  { code: 'users:read', description: 'View users list and details' },
  { code: 'users:create', description: 'Create and invite users' },
  { code: 'users:update', description: 'Edit any user fields and roles (full)' },
  { code: 'users:update:basic', description: 'Edit basic profile (name, dept, site, status, MFA)' },
  { code: 'users:update:compliance', description: 'Edit compliance-related fields (status, MFA, dept, site)' },
  { code: 'users:assign_roles:basic', description: 'Assign basic roles (User only for Quality; User for Manager)' },
  { code: 'users:assign_roles:any', description: 'Assign any role including privileged' },
  { code: 'users:delete', description: 'Delete users (System Admin only)' },
  { code: 'users:disable', description: 'Deactivate and lock users' },
  { code: 'auditlog:view', description: 'View and export audit log' },
  { code: 'system:securitypolicy:update', description: 'Change security and retention policies' },
  { code: 'system:reference:update', description: 'Manage departments, sites, job titles' },
  { code: 'document:view', description: 'View documents and document attachments' },
  { code: 'document:create', description: 'Create documents' },
  { code: 'document:review', description: 'Review documents' },
  { code: 'document:approve', description: 'Approve documents' },
  { code: 'document:release', description: 'Release documents (quality release)' },
  { code: 'document:delete', description: 'Delete documents (System Admin only)' },
  { code: 'document:revise:major', description: 'Revise document (major)' },
  { code: 'document:revise:minor', description: 'Revise document (minor)' },
  { code: 'capa:view', description: 'View CAPA records' },
  { code: 'capa:create', description: 'Create CAPA' },
  { code: 'capa:update', description: 'Update CAPA fields' },
  { code: 'capa:assign_tasks', description: 'Assign and manage CAPA tasks' },
  { code: 'capa:approve_plan', description: 'Approve CAPA plan' },
  { code: 'capa:close', description: 'Close CAPA' },
  { code: 'capa:esign', description: 'Apply e-signature on CAPA' },
  { code: 'capa:export', description: 'Export CAPA data' },
  { code: 'change:view', description: 'View change control records' },
  { code: 'change:create', description: 'Create change control' },
  { code: 'change:update', description: 'Update change control' },
  { code: 'change:assign_tasks', description: 'Assign and manage change control tasks' },
  { code: 'change:approve', description: 'Approve change control (formal approval/signature)' },
  { code: 'change:close', description: 'Close change control' },
  { code: 'change:esign', description: 'Apply e-signature on change control' },
  { code: 'file:upload', description: 'Upload files' },
  { code: 'file:download', description: 'Download files' },
  { code: 'file:delete', description: 'Soft delete files' },
  { code: 'form_records:view', description: 'View form records (Records Vault)' },
  { code: 'form_records:create', description: 'Create form records (DRAFT)' },
  { code: 'form_records:update', description: 'Update DRAFT form records' },
  { code: 'form_records:finalize', description: 'Finalize (lock) form records' },
  { code: 'form_records:export', description: 'Export form record PDF' },
];

const VALID_CODES = new Set(PERMISSION_LIST.map((p) => p.code));

function getValidCodes() {
  return [...VALID_CODES];
}

function isValidCode(code) {
  return typeof code === 'string' && VALID_CODES.has(code);
}

function getPermissionList() {
  return [...PERMISSION_LIST];
}

export { PERMISSION_LIST, VALID_CODES, getValidCodes, getPermissionList, isValidCode };
