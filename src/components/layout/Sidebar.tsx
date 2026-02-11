import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  GraduationCap,
  ClipboardCheck,
  AlertTriangle,
  GitBranch,
  Shield,
  Wrench,
  Truck,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const navItems: { path: string; label: string; icon: React.ReactNode }[] = [
  { path: '/', label: 'Executive Dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
  { path: '/documents', label: 'Document Control', icon: <FileText className="h-5 w-5" /> },
  { path: '/training', label: 'Training & Competency', icon: <GraduationCap className="h-5 w-5" /> },
  { path: '/audits', label: 'Audit Management', icon: <ClipboardCheck className="h-5 w-5" /> },
  { path: '/capa', label: 'CAPA', icon: <AlertTriangle className="h-5 w-5" /> },
  { path: '/change-control', label: 'Change Control', icon: <GitBranch className="h-5 w-5" /> },
  { path: '/risk', label: 'Risk Management', icon: <Shield className="h-5 w-5" /> },
  { path: '/equipment', label: 'Equipment & Assets', icon: <Wrench className="h-5 w-5" /> },
  { path: '/suppliers', label: 'Supplier Quality', icon: <Truck className="h-5 w-5" /> },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

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
