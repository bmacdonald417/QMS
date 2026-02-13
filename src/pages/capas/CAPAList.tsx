import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Table, Badge, Button, Input } from '@/components/ui';
import { PageShell } from '../PageShell';
import type { Column } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';

interface CapaListItem {
  id: string;
  capaId: string;
  title: string;
  description: string;
  status: string;
  initiator: { id: string; firstName: string; lastName: string; email: string } | null;
  owner: { id: string; firstName: string; lastName: string; email: string } | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

const statusVariant: Record<string, 'default' | 'info' | 'success' | 'warning' | 'neutral' | 'danger'> = {
  DRAFT: 'neutral',
  OPEN: 'info',
  CONTAINMENT: 'warning',
  INVESTIGATION: 'warning',
  RCA_COMPLETE: 'info',
  PLAN_APPROVAL: 'warning',
  IMPLEMENTATION: 'info',
  EFFECTIVENESS_CHECK: 'warning',
  PENDING_CLOSURE: 'warning',
  CLOSED: 'success',
  CANCELLED: 'danger',
  ARCHIVED: 'default',
};

const STATUS_OPTIONS = [
  'DRAFT', 'OPEN', 'CONTAINMENT', 'INVESTIGATION', 'RCA_COMPLETE',
  'PLAN_APPROVAL', 'IMPLEMENTATION', 'EFFECTIVENESS_CHECK', 'PENDING_CLOSURE', 'CLOSED', 'CANCELLED',
];

export function CAPAList() {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [capas, setCapas] = useState<CapaListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;
  const canCreate = user?.permissions?.includes('capa:create');

  const fetchCapas = async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (statusFilter) params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());
      const data = await apiRequest<{ capas: CapaListItem[]; total: number }>(
        `/api/capas?${params.toString()}`,
        { token }
      );
      setCapas(data.capas);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load CAPAs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCapas();
  }, [token, page, statusFilter]);

  const onSearch = () => fetchCapas();

  const columns: Column<CapaListItem>[] = [
    { key: 'capaId', header: 'CAPA ID', width: '140px' },
    { key: 'title', header: 'Title' },
    {
      key: 'status',
      header: 'Status',
      width: '160px',
      render: (row) => (
        <Badge variant={statusVariant[row.status] || 'default'}>
          {row.status.replace(/_/g, ' ')}
        </Badge>
      ),
    },
    {
      key: 'owner',
      header: 'Owner',
      width: '140px',
      render: (row) =>
        row.owner ? `${row.owner.firstName} ${row.owner.lastName}` : '—',
    },
    {
      key: 'dueDate',
      header: 'Due',
      width: '100px',
      render: (row) => (row.dueDate ? new Date(row.dueDate).toLocaleDateString() : '—'),
    },
    {
      key: 'updatedAt',
      header: 'Updated',
      width: '100px',
      render: (row) => new Date(row.updatedAt).toLocaleDateString(),
    },
  ];

  return (
    <PageShell
      title="CAPA"
      subtitle="Corrective and Preventive Action records"
      primaryAction={
        canCreate
          ? { label: 'New CAPA', onClick: () => navigate('/capas/new') }
          : undefined
      }
    >
      {error && <p className="mb-3 text-sm text-compliance-red">{error}</p>}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded border border-[var(--surface-border)] bg-[var(--surface-elevated)] px-3 py-2 text-sm text-gray-200"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <Input
          placeholder="Search CAPA ID, title..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSearch()}
          className="max-w-xs"
        />
        <Button variant="secondary" onClick={onSearch}>Search</Button>
      </div>

      <Card padding="none">
        <Table
          columns={columns}
          data={capas}
          keyExtractor={(row) => row.id}
          onRowClick={(row) => navigate(`/capas/${row.id}`)}
          emptyMessage={loading ? 'Loading…' : 'No CAPAs. Create one to get started.'}
        />
        {total > limit && (
          <div className="flex items-center justify-between border-t border-[var(--surface-border)] px-4 py-2">
            <span className="text-sm text-gray-500">
              Page {page} of {Math.ceil(total / limit)}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= Math.ceil(total / limit)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </PageShell>
  );
}
