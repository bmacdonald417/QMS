import { useLocation, Link, useNavigate } from 'react-router-dom';
import { Search, LogOut } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui';

const pathToBreadcrumb: Record<string, string> = {
  '': 'Dashboard',
  documents: 'Document Control',
  training: 'Training & Competency',
  audits: 'Audit Management',
  capa: 'CAPA',
  'change-control': 'Change Control',
  risk: 'Risk Management',
  equipment: 'Equipment & Assets',
  suppliers: 'Supplier Quality',
};

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

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
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-xs text-gray-300"
          onClick={() => navigate('/login')}
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden md:inline">Sign out</span>
        </Button>
      </div>
    </header>
  );
}
