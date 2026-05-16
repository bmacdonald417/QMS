import { NavLink, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { getSidebarItemsForRole, type SidebarItem } from '@/lib/sidebarConfig';
import { apiUrl } from '@/lib/api';

interface NavGroup {
  group: string;
  items: SidebarItem[];
}

/**
 * Map from sidebar item path → group label. Drives the "Workspace / Quality /
 * Compliance / Admin" grouping in the sidebar without rewriting the
 * role-based config in `lib/sidebarConfig.tsx` (the brief explicitly says
 * preserve the existing IA + permissions).
 *
 * Items not in the map fall through to the "Workspace" group.
 */
const PATH_TO_GROUP: Record<string, string> = {
  '/': 'Workspace',
  '/dashboard': 'Workspace',
  '/search': 'Workspace',
  '/my-tasks': 'Workspace',

  '/documents': 'Quality',
  '/training': 'Quality',
  '/team-training': 'Quality',
  '/team-documents': 'Quality',
  '/my-training': 'Quality',
  '/periodic-reviews': 'Quality',
  '/completed-forms': 'Quality',
  '/approvals': 'Quality',

  '/capas': 'Compliance',
  '/capa': 'Compliance',
  '/audits': 'Compliance',
  '/change-control': 'Compliance',
  '/risk': 'Compliance',
  '/equipment': 'Compliance',
  '/suppliers': 'Compliance',

  '/cmmc': 'CMMC L2',
  '/cmmc/documents': 'CMMC L2',
  '/cmmc/controls': 'CMMC L2',

  '/system': 'Admin',
};

const GROUP_ORDER = ['Workspace', 'Quality', 'Compliance', 'CMMC L2', 'Admin'];

function buildGroups(items: SidebarItem[]): NavGroup[] {
  const buckets = new Map<string, SidebarItem[]>();
  for (const item of items) {
    const group = PATH_TO_GROUP[item.path] ?? 'Workspace';
    const arr = buckets.get(group) ?? [];
    arr.push(item);
    buckets.set(group, arr);
  }
  const out: NavGroup[] = [];
  for (const group of GROUP_ORDER) {
    const arr = buckets.get(group);
    if (arr && arr.length > 0) out.push({ group, items: arr });
  }
  return out;
}

export function MacTechSidebar() {
  const { user } = useAuth();
  const navItems = user ? getSidebarItemsForRole(user.roleName) : [];
  const groups = buildGroups(navItems);
  const [buildId, setBuildId] = useState<string | null>(null);

  useEffect(() => {
    fetch(apiUrl('/api/version'), { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { buildId?: string }) => setBuildId(d?.buildId ?? null))
      .catch(() => {});
  }, []);

  return (
    <aside className="hidden md:flex h-screen w-64 shrink-0 flex-col border-r border-border bg-card sticky top-0">
      <Link
        to="/"
        className="flex items-center gap-2 px-5 py-5 border-b border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-md brand-mark-chip">
          <ShieldCheck className="h-4 w-4" aria-hidden />
        </div>
        <div className="leading-tight">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
            MacTech Suite
          </div>
          <div className="text-sm font-semibold leading-snug text-foreground">
            QMS
          </div>
        </div>
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 py-4 text-sm" aria-label="Primary">
        {groups.map((group) => (
          <div key={group.group} className="mb-5">
            <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {group.group}
            </div>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    end={item.path === '/'}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                        isActive
                          ? 'bg-secondary text-foreground'
                          : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                      )
                    }
                  >
                    <span className="shrink-0" aria-hidden>
                      {item.icon}
                    </span>
                    <span className="leading-snug">{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground space-y-1">
        <div className="font-mono">
          QMS · {buildId && buildId !== 'dev' ? buildId.slice(0, 7) : 'dev'}
        </div>
        <div className="text-[11px] leading-relaxed">
          Quality Management · MacTech Suite
        </div>
      </div>
    </aside>
  );
}
