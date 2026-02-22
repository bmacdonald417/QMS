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
  Settings,
  CheckSquare,
  ListTodo,
  Search,
  CalendarCheck,
  HeartPulse,
  FileCheck,
} from 'lucide-react';

export interface SidebarItem {
  path: string;
  label: string;
  icon: React.ReactNode;
}

const icons = {
  dashboard: <LayoutDashboard className="h-5 w-5" />,
  documents: <FileText className="h-5 w-5" />,
  training: <GraduationCap className="h-5 w-5" />,
  audits: <ClipboardCheck className="h-5 w-5" />,
  capa: <AlertTriangle className="h-5 w-5" />,
  changeControl: <GitBranch className="h-5 w-5" />,
  risk: <Shield className="h-5 w-5" />,
  equipment: <Wrench className="h-5 w-5" />,
  suppliers: <Truck className="h-5 w-5" />,
  system: <Settings className="h-5 w-5" />,
  approvals: <CheckSquare className="h-5 w-5" />,
  myTasks: <ListTodo className="h-5 w-5" />,
  search: <Search className="h-5 w-5" />,
  periodicReviews: <CalendarCheck className="h-5 w-5" />,
  qualityHealth: <HeartPulse className="h-5 w-5" />,
  completedForms: <FileCheck className="h-5 w-5" />,
  cmmc: <Shield className="h-5 w-5" />,
};

/**
 * Role-based sidebar navigation. Matches backend role names.
 */
export function getSidebarItemsForRole(roleName: string): SidebarItem[] {
  switch (roleName) {
    case 'Admin':
    case 'System Administrator':
    case 'System Admin':
      return [
        { path: '/', label: 'Dashboard', icon: icons.dashboard },
        { path: '/documents', label: 'Document Control', icon: icons.documents },
        { path: '/search', label: 'Search', icon: icons.search },
        { path: '/change-control', label: 'Change Control', icon: icons.changeControl },
        { path: '/capas', label: 'CAPA', icon: icons.capa },
        { path: '/system', label: 'System Management', icon: icons.system },
        { path: '/completed-forms', label: 'Completed Forms', icon: icons.completedForms },
      ];
    case 'Quality Manager':
    case 'Quality':
      return [
        { path: '/', label: 'Dashboard', icon: icons.dashboard },
        { path: '/system', label: 'System Management', icon: icons.system },
        { path: '/dashboard', label: 'Quality Health', icon: icons.qualityHealth },
        { path: '/documents', label: 'Document Control', icon: icons.documents },
        { path: '/search', label: 'Search', icon: icons.search },
        { path: '/training', label: 'Training', icon: icons.training },
        { path: '/periodic-reviews', label: 'Periodic Reviews', icon: icons.periodicReviews },
        { path: '/change-control', label: 'Change Control', icon: icons.changeControl },
        { path: '/capas', label: 'CAPA', icon: icons.capa },
        { path: '/audits', label: 'Audits', icon: icons.audits },
        { path: '/suppliers', label: 'Suppliers', icon: icons.suppliers },
        { path: '/risk', label: 'Risk Management', icon: icons.risk },
        { path: '/equipment', label: 'Equipment & Assets', icon: icons.equipment },
        { path: '/completed-forms', label: 'Completed Forms', icon: icons.completedForms },
      ];
    case 'Manager':
      return [
        { path: '/', label: 'Dashboard', icon: icons.dashboard },
        { path: '/training', label: 'Training', icon: icons.training },
        { path: '/periodic-reviews', label: 'Periodic Reviews', icon: icons.periodicReviews },
        { path: '/documents', label: 'Document Control', icon: icons.documents },
        { path: '/team-training', label: 'Team Training', icon: icons.training },
        { path: '/approvals', label: 'Approvals', icon: icons.approvals },
        { path: '/completed-forms', label: 'Completed Forms', icon: icons.completedForms },
      ];
    case 'User':
      return [
        { path: '/my-tasks', label: 'My Tasks', icon: icons.myTasks },
        { path: '/training', label: 'My Training', icon: icons.training },
        { path: '/documents', label: 'Documents', icon: icons.documents },
        { path: '/search', label: 'Search', icon: icons.search },
      ];
    default:
      return [{ path: '/', label: 'Dashboard', icon: icons.dashboard }];
  }
}
