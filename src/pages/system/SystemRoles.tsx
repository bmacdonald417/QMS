import { useEffect, useState } from 'react';
import { Card, Table } from '@/components/ui';
import { PageShell } from '@/pages/PageShell';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';
import type { Column } from '@/components/ui';

interface RoleRow {
  id: number;
  name: string;
  permissions: string[];
}

export function SystemRoles() {
  const { token } = useAuth();
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [permissions, setPermissions] = useState<{ id: string; code: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    apiRequest<{ roles: RoleRow[]; permissions: { id: string; code: string }[] }>('/api/system/roles', { token })
      .then((data) => {
        setRoles(data.roles || []);
        setPermissions(data.permissions || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const columns: Column<RoleRow>[] = [
    { key: 'name', header: 'Role' },
    { key: 'permissions', header: 'Permissions', render: (r) => (r.permissions?.length ? r.permissions.join(', ') : '—') },
  ];

  return (
    <PageShell title="Roles & Permissions" subtitle="View roles and assigned permissions. System Admin and Admin have full access.">
      <div className="space-y-6">
        <Card padding="none">
          {loading ? (
            <p className="p-6 text-gray-400">Loading...</p>
          ) : (
            <Table columns={columns} data={roles} keyExtractor={(r) => String(r.id)} emptyMessage="No roles." />
          )}
        </Card>
        <Card padding="md">
          <h2 className="mb-4 text-lg text-white">Permission codes</h2>
          <ul className="space-y-1 text-sm text-gray-300">
            {permissions.map((p) => (
              <li key={p.id}><code className="rounded bg-surface-overlay px-1">{p.code}</code></li>
            ))}
          </ul>
        </Card>
      </div>
    </PageShell>
  );
}
