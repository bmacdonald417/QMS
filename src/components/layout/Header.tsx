import { useLocation, Link, useNavigate } from 'react-router-dom';
import { Search, LogOut } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { NotificationBell } from './NotificationBell';
import { apiUrl } from '@/lib/api';

const pathToBreadcrumb: Record<string, string> = {
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
};

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [buildId, setBuildId] = useState<string | null>(null);
  useEffect(() => {
    fetch(apiUrl('/api/version'), { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { buildId?: string }) => setBuildId(d?.buildId ?? null))
      .catch(() => {});
  }, []);

  const segments = location.pathname.split('/').filter(Boolean);
  const breadcrumbs = [
    { path: '/', label: 'Home' },
    ...segments.map((segment, i) => ({
      path: '/' + segments.slice(0, i + 1).join('/'),
      label: pathToBreadcrumb[segment] ?? segment,
    })),
  ];

  return (
    <header className="flex h-14 items-center justify-between gap-4 border-b border-surface-border bg-surface-elevated px-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.path} className="flex items-center gap-2">
            {i > 0 && <span className="text-gray-600">/</span>}
            <Link
              to={crumb.path}
              className={
                i === breadcrumbs.length - 1
                  ? 'font-medium text-white'
                  : 'text-gray-400 hover:text-gray-200 transition-colors'
              }
            >
              {crumb.label}
            </Link>
          </span>
        ))}
      </nav>
      <div className="flex items-center gap-4">
        <div className="relative w-64 hidden sm:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            type="search"
            placeholder="Search documents, CAPAs, audits..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-surface-border bg-surface-overlay py-2 pl-9 pr-3 text-sm text-gray-100 placeholder-gray-500 focus:border-mactech-blue focus:outline-none focus:ring-1 focus:ring-mactech-blue"
          />
        </div>
        <span className="text-xs text-gray-400 hidden sm:inline">
          {user ? `${user.firstName} ${user.lastName}` : ''}
        </span>
        {buildId && buildId !== 'dev' && (
          <span className="text-[10px] text-gray-500 hidden lg:inline" title={`Build: ${buildId}`}>
            {buildId.slice(0, 12)}…
          </span>
        )}
        <NotificationBell />
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-xs text-gray-300"
          onClick={() => {
            logout();
            navigate('/login');
          }}
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden md:inline">Sign out</span>
        </Button>
      </div>
    </header>
  );
}
