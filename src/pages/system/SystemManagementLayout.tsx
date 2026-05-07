import { Outlet, NavLink } from 'react-router-dom';

const navItems = [
  { to: '/system', end: true, label: 'Dashboard' },
  { to: '/system/users', end: false, label: 'Users' },
  { to: '/system/roles', end: false, label: 'Roles & Permissions' },
  { to: '/system/audit', end: false, label: 'Audit Logs' },
  { to: '/system/security-policies', end: false, label: 'Security Policies' },
  { to: '/system/reference', end: false, label: 'Reference Data' },
  { to: '/system/esign', end: false, label: 'E-Signature' },
  { to: '/system/retention', end: false, label: 'Retention' },
  { to: '/system/integrations', end: false, label: 'Integrations' },
  { to: '/system/qms-agent', end: false, label: 'QMS Agent' },
  { to: '/system/qms-agent/execution-packages', end: false, label: 'Execution packages' },
  { to: '/system/governance-manifest', end: false, label: 'Governance manifest' },
  { to: '/system/governance-package', end: false, label: 'Vault package (canonical)' },
  { to: '/system/release-readiness', end: false, label: 'Release readiness' },
  { to: '/system/governance-release', end: false, label: 'Bulk release to Codex' },
];

export function SystemManagementLayout() {
  return (
    <div className="flex gap-6">
      <nav className="w-52 flex-shrink-0">
        <ul className="space-y-0.5 rounded-lg border border-surface-border bg-surface-elevated p-2">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `block rounded-md px-3 py-2 text-sm transition-colors ${
                    isActive ? 'bg-mactech-blue-muted text-mactech-blue' : 'text-gray-400 hover:bg-surface-overlay hover:text-gray-200'
                  }`
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
