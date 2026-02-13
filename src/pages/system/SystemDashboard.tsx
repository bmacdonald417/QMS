import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';
import {
  Users,
  Shield,
  FileText,
  Lock,
  Database,
  FileSignature,
  Archive,
} from 'lucide-react';

interface DashboardStats {
  userCount: number;
  roleCount: number;
  auditCount: number;
}

const cardLinks = [
  { path: '/system/users', label: 'Users & Access', icon: Users, description: 'Manage users, roles, and access control' },
  { path: '/system/roles', label: 'Roles & Permissions', icon: Shield, description: 'View and assign permissions' },
  { path: '/system/audit', label: 'Audit Logs', icon: FileText, description: 'View and export audit trail' },
  { path: '/system/security-policies', label: 'Security Policies', icon: Lock, description: 'Password, session, and MFA settings' },
  { path: '/system/reference', label: 'Reference Data', icon: Database, description: 'Departments, sites, job titles' },
  { path: '/system/esign', label: 'E-Signature Settings', icon: FileSignature, description: 'Configure e-sign requirements' },
  { path: '/system/retention', label: 'Retention & Backups', icon: Archive, description: 'Retention policies and backup status' },
];

export function SystemDashboard() {
  const { token } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    apiRequest<DashboardStats>('/api/system/dashboard', { token })
      .then(setStats)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [token]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">System Management</h1>
        <p className="mt-1 text-gray-500">User administration, security policies, and compliance controls</p>
      </div>

      {error && <p className="text-compliance-red text-sm">{error}</p>}

      {stats && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card padding="md">
            <span className="label-caps text-gray-500">Users</span>
            <p className="mt-1 text-2xl font-semibold text-white">{stats.userCount}</p>
          </Card>
          <Card padding="md">
            <span className="label-caps text-gray-500">Roles</span>
            <p className="mt-1 text-2xl font-semibold text-white">{stats.roleCount}</p>
          </Card>
          <Card padding="md">
            <span className="label-caps text-gray-500">Audit log entries</span>
            <p className="mt-1 text-2xl font-semibold text-white">{stats.auditCount}</p>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cardLinks.map(({ path, label, icon: Icon, description }) => (
          <Link key={path} to={path}>
            <Card padding="md" className="h-full transition-colors hover:border-mactech-blue/50">
              <div className="flex items-start gap-4">
                <div className="rounded-lg bg-surface-overlay p-3">
                  <Icon className="h-6 w-6 text-mactech-blue" />
                </div>
                <div>
                  <h2 className="font-medium text-white">{label}</h2>
                  <p className="mt-1 text-sm text-gray-500">{description}</p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
