import { Outlet, NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const tabs = [
  { to: '/documents', end: true, label: 'All Documents' },
  { to: '/documents/cmmc-bundle', end: false, label: 'CMMC Bundle' },
];

export function DocumentsSection() {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="border-b border-border bg-background px-6">
        <nav className="flex gap-0" aria-label="Document Control tabs">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cn(
                  'px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                  isActive
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                )
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
