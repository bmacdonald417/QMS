import { useEffect, useState } from 'react';
import { Card, Button, Input, Badge, Table, Modal } from '@/components/ui';
import { PageShell } from '@/pages/PageShell';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';
import type { Column } from '@/components/ui';

interface UserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  jobTitle?: string | null;
  mfaEnabled: boolean;
  lastLoginAt?: string | null;
  lockedAt?: string | null;
  createdAt: string;
  roleName?: string;
  department?: { id: string; name: string } | null;
  site?: { id: string; name: string } | null;
}

interface RolesResponse {
  roles: { id: number; name: string }[];
}

const FORBIDDEN_MSG = "You don't have permission to perform this action.";

function isForbiddenError(e: unknown): boolean {
  if (e instanceof Error) {
    const m = e.message.toLowerCase();
    return m.includes('permission') || m.includes('cannot edit') || m.includes('only assign');
  }
  return false;
}

export function SystemUsers() {
  const { token, user } = useAuth();
  const canDeleteUsers = Boolean(user?.permissions?.includes('users:delete'));
  const [users, setUsers] = useState<UserRow[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [roles, setRoles] = useState<{ id: number; name: string }[]>([]);
  const [assignableRoles, setAssignableRoles] = useState<{ id: number; name: string }[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionModal, setActionModal] = useState<{ user: UserRow; action: string } | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState('');
  const [addForm, setAddForm] = useState({
    firstName: '', lastName: '', email: '', roleId: '', departmentId: '', siteId: '', jobTitle: '', temporaryPassword: '',
  });

  const fetchUsers = (page = 1) => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);
    if (roleFilter) params.set('roleId', roleFilter);
    apiRequest<{ users: UserRow[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(
      `/api/system/users?${params}`,
      { token }
    )
      .then((data) => {
        setUsers(data.users);
        setPagination(data.pagination);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load users'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUsers(pagination.page);
  }, [token, pagination.page, search, statusFilter, roleFilter]);

  useEffect(() => {
    if (!token) return;
    apiRequest<RolesResponse>('/api/system/roles', { token })
      .then((data) => setRoles(data.roles || []))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token || !showAddModal) return;
    apiRequest<RolesResponse>('/api/system/users/assignable-roles', { token })
      .then((data) => {
        const list = data.roles || [];
        setAssignableRoles(list);
        setAddForm((f) => ({
          ...f,
          roleId: list.length ? String(list[0].id) : '',
        }));
      })
      .catch(() => setAssignableRoles([]));
  }, [token, showAddModal]);

  const runAction = async () => {
    if (!token || !actionModal) return;
    const { user, action } = actionModal;
    const needsReason = action !== 'delete' && !reason.trim();
    if (needsReason) return;
    const isDelete = action === 'delete';
    const url = isDelete ? `/api/system/users/${user.id}` : `/api/system/users/${user.id}/${action}`;
    try {
      await apiRequest(url, {
        token,
        method: isDelete ? 'DELETE' : 'POST',
        body: isDelete ? (reason.trim() ? { reason: reason.trim() } : undefined) : { reason: reason.trim() },
      });
      setActionModal(null);
      setReason('');
      fetchUsers(pagination.page);
    } catch (e) {
      setError(isForbiddenError(e) ? FORBIDDEN_MSG : (e instanceof Error ? e.message : 'Action failed'));
    }
  };

  const columns: Column<UserRow>[] = [
    { key: 'name', header: 'Name', render: (r) => `${r.firstName} ${r.lastName}` },
    { key: 'email', header: 'Email' },
    { key: 'roleName', header: 'Role' },
    { key: 'department', header: 'Department', render: (r) => r.department?.name ?? '—' },
    { key: 'site', header: 'Site', render: (r) => r.site?.name ?? '—' },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Badge variant={r.status === 'ACTIVE' ? 'success' : r.status === 'LOCKED' ? 'danger' : 'default'}>
          {r.status}
        </Badge>
      ),
    },
    { key: 'mfaEnabled', header: 'MFA', render: (r) => (r.mfaEnabled ? 'Yes' : 'No') },
    { key: 'lastLoginAt', header: 'Last login', render: (r) => (r.lastLoginAt ? new Date(r.lastLoginAt).toLocaleString() : '—') },
    { key: 'createdAt', header: 'Created', render: (r) => new Date(r.createdAt).toLocaleDateString() },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.status === 'ACTIVE' && (
            <Button size="sm" variant="danger" onClick={() => setActionModal({ user: r, action: 'deactivate' })}>
              Deactivate
            </Button>
          )}
          {r.status === 'INACTIVE' && (
            <Button size="sm" variant="secondary" onClick={() => setActionModal({ user: r, action: 'reactivate' })}>
              Reactivate
            </Button>
          )}
          {!r.lockedAt && r.status === 'ACTIVE' && (
            <Button size="sm" variant="secondary" onClick={() => setActionModal({ user: r, action: 'lock' })}>
              Lock
            </Button>
          )}
          {r.lockedAt && (
            <Button size="sm" variant="secondary" onClick={() => setActionModal({ user: r, action: 'unlock' })}>
              Unlock
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setActionModal({ user: r, action: 'revoke-sessions' })}>
            Revoke sessions
          </Button>
          {canDeleteUsers && (
            <Button size="sm" variant="danger" onClick={() => setActionModal({ user: r, action: 'delete' })}>
              Delete
            </Button>
          )}
        </div>
      ),
    },
  ];

  const createUser = async () => {
    if (!token) {
      setAddError('Not signed in.');
      return;
    }
    if (!addForm.firstName.trim() || !addForm.lastName.trim() || !addForm.email.trim() || !addForm.roleId || !addForm.temporaryPassword.trim()) {
      setAddError('Please fill in first name, last name, email, role, and temporary password.');
      return;
    }
    if (addForm.temporaryPassword.length < 8) {
      setAddError('Temporary password must be at least 8 characters.');
      return;
    }
    setAddError('');
    setAddSubmitting(true);
    try {
      await apiRequest('/api/system/users', {
        token,
        method: 'POST',
        body: {
          firstName: addForm.firstName.trim(),
          lastName: addForm.lastName.trim(),
          email: addForm.email.trim(),
          roleId: parseInt(addForm.roleId, 10),
          departmentId: addForm.departmentId || undefined,
          siteId: addForm.siteId || undefined,
          jobTitle: addForm.jobTitle.trim() || undefined,
          temporaryPassword: addForm.temporaryPassword,
        },
      });
      setShowAddModal(false);
      setAddForm({ firstName: '', lastName: '', email: '', roleId: '', departmentId: '', siteId: '', jobTitle: '', temporaryPassword: '' });
      fetchUsers(1);
    } catch (e) {
      setAddError(isForbiddenError(e) ? FORBIDDEN_MSG : (e instanceof Error ? e.message : 'Create failed'));
    } finally {
      setAddSubmitting(false);
    }
  };

  return (
    <PageShell
      title="Users & Access"
      subtitle="Manage user accounts and access control"
      primaryAction={{ label: 'Add User', onClick: () => { setShowAddModal(true); setAddError(''); } }}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-4">
          <Input
            placeholder="Search by name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchUsers(1)}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-sm text-gray-100"
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="LOCKED">Locked</option>
          </select>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-sm text-gray-100"
          >
            <option value="">All roles</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={() => fetchUsers(1)}>
            Search
          </Button>
        </div>

        {error && <p className="text-compliance-red text-sm">{error}</p>}

        <Card padding="none">
          {loading ? (
            <p className="p-6 text-gray-400">Loading...</p>
          ) : (
            <>
              <Table
                columns={columns}
                data={users}
                keyExtractor={(r) => r.id}
                emptyMessage="No users found."
              />
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-surface-border px-4 py-2">
                  <span className="text-sm text-gray-500">
                    Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pagination.page <= 1}
                      onClick={() => fetchUsers(pagination.page - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pagination.page >= pagination.totalPages}
                      onClick={() => fetchUsers(pagination.page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      <Modal
        isOpen={!!actionModal}
        onClose={() => { setActionModal(null); setReason(''); }}
        title={actionModal ? `Reason for ${actionModal.action.replace(/-/g, ' ')}` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => { setActionModal(null); setReason(''); }}>
              Cancel
            </Button>
            <Button onClick={runAction} disabled={actionModal?.action !== 'delete' && !reason.trim()}>
              Confirm
            </Button>
          </>
        }
      >
        {actionModal && (
          <p className="mb-4 text-sm text-gray-400">
            User: {actionModal.user.firstName} {actionModal.user.lastName} ({actionModal.user.email})
          </p>
        )}
        <Input
          label="Reason for change (required)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Offboarding; policy change"
        />
      </Modal>

      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add User"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddModal(false)} disabled={addSubmitting}>Cancel</Button>
            <Button onClick={createUser} loading={addSubmitting} disabled={!addForm.firstName.trim() || !addForm.lastName.trim() || !addForm.email.trim() || !addForm.roleId || !addForm.temporaryPassword.trim() || addForm.temporaryPassword.length < 8}>
              Create user
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {addError && <p className="text-compliance-red text-sm">{addError}</p>}
          <Input label="First name" value={addForm.firstName} onChange={(e) => setAddForm((f) => ({ ...f, firstName: e.target.value }))} />
          <Input label="Last name" value={addForm.lastName} onChange={(e) => setAddForm((f) => ({ ...f, lastName: e.target.value }))} />
          <Input label="Email" type="email" value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} />
          <Input label="Temporary password" type="password" value={addForm.temporaryPassword} onChange={(e) => setAddForm((f) => ({ ...f, temporaryPassword: e.target.value }))} placeholder="User must change on first login" />
          <div>
            <label className="label-caps mb-1.5 block text-gray-400">Role</label>
            <select
              value={addForm.roleId}
              onChange={(e) => setAddForm((f) => ({ ...f, roleId: e.target.value }))}
              className="w-full rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-gray-100"
            >
              <option value="">Select role</option>
              {(assignableRoles.length ? assignableRoles : roles).map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <Input label="Job title (optional)" value={addForm.jobTitle} onChange={(e) => setAddForm((f) => ({ ...f, jobTitle: e.target.value }))} />
        </div>
      </Modal>
    </PageShell>
  );
}
