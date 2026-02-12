import { NavLink } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { getSidebarItemsForRole } from '@/lib/sidebarConfig';

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { user } = useAuth();
  const navItems = user ? getSidebarItemsForRole(user.roleName) : [];

  return (
    <motion.aside
      className="flex flex-col border-r border-surface-border bg-surface-elevated"
      initial={false}
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="flex h-14 items-center justify-between border-b border-surface-border px-3">
        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.span
              key="logo"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="truncate text-sm font-semibold text-white"
            >
              MacTech QMS
            </motion.span>
          )}
        </AnimatePresence>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="rounded p-2 text-gray-400 hover:bg-surface-overlay hover:text-gray-200 transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        <ul className="space-y-0.5 px-2">
          {navItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-200 ${
                    isActive
                      ? 'bg-mactech-blue-muted text-mactech-blue border border-mactech-blue/30'
                      : 'text-gray-400 hover:bg-surface-overlay hover:text-gray-200'
                  }`
                }
                end={item.path === '/'}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                <AnimatePresence mode="wait">
                  {!collapsed && (
                    <motion.span
                      key="label"
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      className="truncate"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </motion.aside>
  );
}
