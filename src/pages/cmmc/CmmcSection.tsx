import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Shield, LayoutGrid, BookOpen, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { to: '/cmmc',           label: 'Overview',        icon: LayoutGrid,  end: true },
  { to: '/cmmc/documents', label: 'Documents',        icon: BookOpen,    end: false },
  { to: '/cmmc/controls',  label: 'Control Index',   icon: ListChecks,  end: false },
];

export function CmmcSection() {
  const location = useLocation();

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Section header */}
      <div className="shrink-0 border-b border-border bg-card px-6 pt-5 pb-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 dark:bg-blue-950">
            <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-tight">CMMC Level 2</h1>
            <p className="text-xs text-muted-foreground">CUI Vault — NIST SP 800-171 Rev 2</p>
          </div>
        </div>

        {/* Sub-nav tabs */}
        <nav className="flex gap-1" aria-label="CMMC section">
          {TABS.map(({ to, label, icon: Icon, end }) => {
            const isActive = end
              ? location.pathname === to
              : location.pathname.startsWith(to);
            return (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 transition-colors -mb-px',
                  isActive
                    ? 'border-foreground text-foreground font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Page content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
