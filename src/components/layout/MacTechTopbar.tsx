import { useLocation, Link, useNavigate } from 'react-router-dom';
import { LogOut, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { initialsFor } from '@/lib/utils';
import { NotificationBell } from './NotificationBell';

const PATH_LABELS: Record<string, string> = {
  '': 'Dashboard',
  dashboard: 'Quality Health',
  search: 'Search',
  documents: 'Document Control',
  training: 'Training',
  'periodic-reviews': 'Periodic Reviews',
  'team-documents': 'Team Documents',
  'team-training': 'Team Training',
  'my-tasks': 'My Tasks',
  'my-training': 'My Training',
  audits: 'Audit Management',
  capas: 'CAPA',
  capa: 'CAPA',
  'change-control': 'Change Control',
  risk: 'Risk Management',
  equipment: 'Equipment & Assets',
  suppliers: 'Supplier Quality',
  system: 'System Management',
  users: 'Users',
  roles: 'Roles & Permissions',
  audit: 'Audit Logs',
  'security-policies': 'Security Policies',
  reference: 'Reference Data',
  retention: 'Retention',
  esign: 'E-Signature',
  approvals: 'Approvals',
  'completed-forms': 'Completed Forms',
  'qms-agent': 'QMS Agent',
  'execution-packages': 'Execution Packages',
  'governance-manifest': 'Governance Manifest',
  'governance-package': 'Governance Package',
  'governance-release': 'Governance Release',
  'release-readiness': 'Release Readiness',
  cmmc: 'CMMC',
  'control-tags': 'Control Tags',
};

function audienceLabel(roleName: string | undefined): string {
  if (!roleName) return 'Viewer';
  if (roleName === 'Admin' || roleName === 'System Admin' || roleName === 'System Administrator')
    return 'Admin';
  if (roleName === 'Quality' || roleName === 'Quality Manager') return 'Quality';
  if (roleName === 'Manager') return 'Manager';
  return roleName;
}

/**
 * Sticky h-14 topbar — role badge + breadcrumb on the left, identity chip +
 * notifications + sign-out on the right. Mirrors vetted's `cleard-topbar` but
 * keeps QMS's breadcrumb (which auditors use to navigate evidence chains)
 * and the notification bell.
 */
export function MacTechTopbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const segments = location.pathname.split('/').filter(Boolean);
  const breadcrumbs = [
    { path: '/', label: 'Home' },
    ...segments.map((segment, i) => ({
      path: '/' + segments.slice(0, i + 1).join('/'),
      label: PATH_LABELS[segment] ?? segment,
    })),
  ];

  const fullName = user ? `${user.firstName} ${user.lastName}`.trim() : '';
  const audience = audienceLabel(user?.roleName);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-border bg-background/80 px-4 md:px-6 backdrop-blur">
      <div className="flex items-center gap-3 min-w-0">
        {user && (
          <Badge variant="outline" className="hidden md:inline-flex gap-1.5 shrink-0">
            <ShieldCheck className="h-3 w-3 text-primary" aria-hidden />
            {audience}
          </Badge>
        )}
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-sm min-w-0 overflow-hidden"
        >
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.path} className="flex items-center gap-2 min-w-0">
              {i > 0 && <span className="text-muted-foreground/60">/</span>}
              <Link
                to={crumb.path}
                className={
                  i === breadcrumbs.length - 1
                    ? 'font-medium text-foreground truncate'
                    : 'text-muted-foreground hover:text-foreground transition-colors truncate'
                }
              >
                {crumb.label}
              </Link>
            </span>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <NotificationBell />
        {user && (
          <div className="flex items-center gap-3 rounded-md border border-border bg-card px-2 py-1">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-semibold"
              aria-hidden
            >
              {initialsFor(fullName, user.email)}
            </div>
            <div className="hidden sm:block leading-tight">
              <div className="text-xs font-medium text-foreground">{fullName || user.email}</div>
              <div className="text-[10px] text-muted-foreground">{user.email}</div>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Sign out"
          onClick={() => {
            logout();
            navigate('/sign-in');
          }}
        >
          <LogOut className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </header>
  );
}
