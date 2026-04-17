/** Roles that may use QMS Agent intake, org execution packaging, and related APIs (aligned with server `requireRoles`). */
export const QMS_AGENT_ACCESS_ROLE_NAMES = ['System Admin', 'Quality Manager'] as const;

export function canAccessQmsAgent(roleName: string | undefined | null): boolean {
  return !!roleName && (QMS_AGENT_ACCESS_ROLE_NAMES as readonly string[]).includes(roleName);
}
