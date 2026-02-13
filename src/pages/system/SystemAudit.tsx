import { useEffect, useState } from 'react';
import { Card, Button, Input, Table } from '@/components/ui';
import { PageShell } from '@/pages/PageShell';
import { useAuth } from '@/context/AuthContext';
import { apiRequest, apiUrl } from '@/lib/api';
import type { Column } from '@/components/ui';

interface AuditLogRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  reason: string | null;
  ip: string | null;
  requestId: string | null;
  createdAt: string;
  user: { firstName: string; lastName: string; email: string };
}

export function SystemAudit() {
  const { token } = useAuth();
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchLogs = (page = 1) => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '50' });
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (actionFilter) params.set('action', actionFilter);
    apiRequest<{ logs: AuditLogRow[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(
      `/api/system/audit?${params}`,
      { token }
    )
      .then((data) => {
        setLogs(data.logs);
        setPagination((prev) => ({ ...prev, ...data.pagination }));
      })
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLogs(pagination.page);
  }, [token, pagination.page, startDate, endDate, actionFilter]);

  const exportCsv = async () => {
    if (!token) return;
    const params = new URLSearchParams({ format: 'csv' });
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    const res = await fetch(apiUrl(`/api/system/audit/export?${params}`), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit-log.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns: Column<AuditLogRow>[] = [
    { key: 'createdAt', header: 'Time', render: (r) => new Date(r.createdAt).toLocaleString() },
    { key: 'user', header: 'User', render: (r) => `${r.user.firstName} ${r.user.lastName}` },
    { key: 'action', header: 'Action' },
    { key: 'entityType', header: 'Entity' },
    { key: 'entityId', header: 'Entity ID', render: (r) => (r.entityId ? String(r.entityId).slice(0, 8) + '…' : '—') },
    { key: 'reason', header: 'Reason', render: (r) => (r.reason ? String(r.reason).slice(0, 40) + (r.reason.length > 40 ? '…' : '') : '—') },
  ];

  return (
    <PageShell title="Audit Logs" subtitle="Tamper-evident audit trail. Logs are append-only and cannot be edited or deleted.">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-4">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-sm text-gray-100"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-sm text-gray-100"
          />
          <Input
            placeholder="Action filter"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          />
          <Button variant="secondary" onClick={() => fetchLogs(1)}>
            Apply
          </Button>
          <Button variant="secondary" onClick={exportCsv}>
            Export CSV
          </Button>
        </div>

        <Card padding="none">
          {loading ? (
            <p className="p-6 text-gray-400">Loading...</p>
          ) : (
            <>
              <Table columns={columns} data={logs} keyExtractor={(r) => r.id} emptyMessage="No audit entries." />
              {pagination.totalPages > 1 && (
                <div className="flex justify-between border-t border-surface-border px-4 py-2">
                  <span className="text-sm text-gray-500">Page {pagination.page} of {pagination.totalPages}</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" disabled={pagination.page <= 1} onClick={() => fetchLogs(pagination.page - 1)}>Previous</Button>
                    <Button size="sm" variant="secondary" disabled={pagination.page >= pagination.totalPages} onClick={() => fetchLogs(pagination.page + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
