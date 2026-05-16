import { Outlet, NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const tabs = [
  { to: '/documents', end: true, label: 'All Documents' },
  { to: '/documents/cmmc-bundle', end: false, label: 'CMMC Bundle' },
];

export function DocumentsSection() {
  return (
    <div>
      <div className="border-b border-border -mx-4 md:-mx-8 px-4 md:px-8 mb-6">
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
      <Outlet />
    </div>
  );
}
