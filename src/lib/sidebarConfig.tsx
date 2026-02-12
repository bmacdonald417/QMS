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
};

/**
 * Role-based sidebar navigation. Matches backend role names.
 */
export function getSidebarItemsForRole(roleName: string): SidebarItem[] {
  switch (roleName) {
    case 'Admin':
    case 'System Administrator':
      return [{ path: '/system', label: 'System Management', icon: icons.system }];
    case 'Quality Manager':
    case 'Quality':
      return [
        { path: '/', label: 'Dashboard', icon: icons.dashboard },
        { path: '/documents', label: 'Document Control', icon: icons.documents },
        { path: '/training', label: 'Training', icon: icons.training },
        { path: '/change-control', label: 'Change Control', icon: icons.changeControl },
        { path: '/capa', label: 'CAPA', icon: icons.capa },
        { path: '/audits', label: 'Audits', icon: icons.audits },
        { path: '/suppliers', label: 'Suppliers', icon: icons.suppliers },
        { path: '/risk', label: 'Risk Management', icon: icons.risk },
        { path: '/equipment', label: 'Equipment & Assets', icon: icons.equipment },
      ];
    case 'Manager':
      return [
        { path: '/', label: 'Dashboard', icon: icons.dashboard },
        { path: '/team-documents', label: 'Team Documents', icon: icons.documents },
        { path: '/team-training', label: 'Team Training', icon: icons.training },
        { path: '/approvals', label: 'Approvals', icon: icons.approvals },
      ];
    case 'User':
      return [
        { path: '/my-tasks', label: 'My Tasks', icon: icons.myTasks },
        { path: '/my-training', label: 'My Training', icon: icons.training },
        { path: '/documents', label: 'Documents', icon: icons.documents },
      ];
    default:
      return [{ path: '/', label: 'Dashboard', icon: icons.dashboard }];
  }
}
