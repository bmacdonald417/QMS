import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Table, Badge, Button, Modal, Input } from '@/components/ui';
import { PageShell } from './PageShell';
import type { Column } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';

interface FormRecordListItem {
  id: string;
  recordNumber: string;
  templateCode: string;
  title: string;
  status: string;
  relatedEntityType: string;
  relatedEntityId: string;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; firstName: string; lastName: string } | null;
  templateDocument: { documentId: string; title: string; versionMajor: number; versionMinor: number } | null;
}

interface FormTemplate {
  id: string;
  documentId: string;
  title: string;
  versionMajor: number;
  versionMinor: number;
}

const statusVariant: Record<string, 'default' | 'info' | 'success' | 'warning' | 'neutral'> = {
  DRAFT: 'neutral',
  FINAL: 'success',
  VOID: 'default',
};

export function CompletedForms() {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const canDelete = user?.permissions?.includes('form_records:delete');
  const [records, setRecords] = useState<FormRecordListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    formCode: '',
    status: '',
    q: '',
    startDate: '',
    endDate: '',
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [showNewModal, setShowNewModal] = useState(false);
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [relatedEntityType, setRelatedEntityType] = useState('OTHER');
  const [relatedEntityId, setRelatedEntityId] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchRecords = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.formCode) params.set('templateCode', filters.formCode);
      if (filters.status) params.set('status', filters.status);
      if (filters.q) params.set('q', filters.q);
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      params.set('page', String(page));
      params.set('limit', '20');
      const data = await apiRequest<{ records: FormRecordListItem[]; pagination: { total: number; totalPages: number } }>(
        `/api/form-records?${params}`,
        { token }
      );
      setRecords(data.records);
      setTotalPages(data.pagination?.totalPages ?? 1);
      setTotal(data.pagination?.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load form records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [token, page]);

  const handleApplyFilters = () => {
    setPage(1);
    fetchRecords();
  };

  const fetchTemplates = async () => {
    if (!token) return;
    setTemplatesLoading(true);
    try {
      const data = await apiRequest<{ documents: FormTemplate[] }>('/api/documents/templates/forms', { token });
      setTemplates(data.documents ?? []);
      setSelectedTemplateId(data.documents?.[0]?.id ?? '');
    } catch {
      setTemplates([]);
    } finally {
      setTemplatesLoading(false);
    }
  };

  useEffect(() => {
    if (showNewModal) fetchTemplates();
  }, [showNewModal, token]);

  const handleCreate = async () => {
    if (!token || !selectedTemplateId) return;
    setCreateError('');
    setCreateSubmitting(true);
    try {
      const data = await apiRequest<{ record: { id: string } }>('/api/form-records', {
        token,
        method: 'POST',
        body: {
          templateDocumentId: selectedTemplateId,
          relatedEntityType: relatedEntityType || 'OTHER',
          relatedEntityId: relatedEntityId || '',
        },
      });
      setShowNewModal(false);
      setRelatedEntityType('OTHER');
      setRelatedEntityId('');
      fetchRecords();
      if (data.record?.id) navigate(`/completed-forms/${data.record.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create form record');
    } finally {
      setCreateSubmitting(false);
    }
  };

  const columns: Column<FormRecordListItem>[] = [
    { key: 'templateCode', header: 'Form Code', width: '140px' },
    { key: 'title', header: 'Title' },
    {
      key: 'status',
      header: 'Status',
      width: '100px',
      render: (row) => <Badge variant={statusVariant[row.status] || 'default'}>{row.status}</Badge>,
    },
    {
      key: 'relatedEntity',
      header: 'Related Entity',
      width: '160px',
      render: (row) => (row.relatedEntityType || row.relatedEntityId ? `${row.relatedEntityType || '—'} ${row.relatedEntityId || ''}`.trim() : '—'),
    },
    {
      key: 'createdBy',
      header: 'Created By',
      width: '140px',
      render: (row) => (row.createdBy ? `${row.createdBy.firstName} ${row.createdBy.lastName}` : '—'),
    },
    {
      key: 'updatedAt',
      header: 'Updated',
      width: '120px',
      render: (row) => new Date(row.updatedAt).toLocaleDateString(),
    },
    ...(canDelete
      ? [
          {
            key: 'actions',
            header: '',
            width: '80px',
            render: (row) => (
              <Button
                variant="ghost"
                size="sm"
                className="text-compliance-red hover:text-compliance-red"
                disabled={deletingId === row.id}
                onClick={async (e) => {
                  e.stopPropagation();
                  if (!token || !window.confirm(`Delete ${row.recordNumber} – ${row.title}? This cannot be undone.`)) return;
                  setDeletingId(row.id);
                  try {
                    await apiRequest(`/api/form-records/${row.id}`, { token, method: 'DELETE' });
                    await fetchRecords();
                  } finally {
                    setDeletingId(null);
                  }
                }}
              >
                {deletingId === row.id ? '…' : 'Delete'}
              </Button>
            ),
          } as Column<FormRecordListItem>,
        ]
      : []),
  ];

  const isSystemAdmin = user?.roleName === 'System Admin' || user?.roleName === 'Admin';
  const showNewFormButton = !isSystemAdmin && (user?.permissions?.includes('form_records:create') ?? true);

  return (
    <PageShell
      title="Completed Forms"
      subtitle="View and manage completed form instances (e.g. Clause Risk Assessment)."
      primaryAction={showNewFormButton ? { label: 'New Completed Form', onClick: () => setShowNewModal(true) } : undefined}
    >
      {error && (
        <div className="mb-3 rounded-lg border border-compliance-red/30 bg-compliance-red/10 p-3">
          <p className="text-sm text-compliance-red">{error}</p>
          {error.includes('prisma') || error.includes('db push') || error.includes('schema') ? (
            <p className="mt-2 text-xs text-gray-400">
              In the project folder run: <code className="rounded bg-black/30 px-1">cd server && npx prisma db push</code>, then restart the server.
            </p>
          ) : null}
        </div>
      )}

      <Card padding="md" className="mb-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
          <Input
            label="Form Code"
            value={filters.formCode}
            onChange={(e) => setFilters((f) => ({ ...f, formCode: e.target.value }))}
            placeholder="e.g. MAC-FRM-013"
          />
          <div>
            <label className="label-caps mb-1.5 block">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              className="w-full rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-gray-100"
            >
              <option value="">All</option>
              <option value="DRAFT">DRAFT</option>
              <option value="FINAL">FINAL</option>
              <option value="VOID">VOID</option>
            </select>
          </div>
          <Input
            label="Search"
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            placeholder="Record # or title"
          />
          <Input
            label="Start Date"
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
          />
          <Input
            label="End Date"
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
          />
        </div>
        <div className="mt-3 flex gap-2">
          <Button onClick={handleApplyFilters}>Apply filters</Button>
        </div>
      </Card>

      <Card padding="none">
        <Table
          columns={columns}
          data={records}
          keyExtractor={(row) => row.id}
          onRowClick={(row) => navigate(`/completed-forms/${row.id}`)}
          emptyMessage="No form records. Create one from a template."
        />
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-surface-border px-4 py-2">
            <span className="text-sm text-gray-400">Total: {total}</span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Modal
        isOpen={showNewModal}
        onClose={() => { setShowNewModal(false); setCreateError(''); }}
        title="New Completed Form"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowNewModal(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!selectedTemplateId || templatesLoading || createSubmitting}>
              {createSubmitting ? 'Creating…' : 'Create'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {createError && <p className="text-sm text-compliance-red">{createError}</p>}
          <div>
            <label className="label-caps mb-1.5 block">Template (Effective Form)</label>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-gray-100"
              disabled={templatesLoading}
            >
              <option value="">Select template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.documentId} – {t.title} (v{t.versionMajor}.{t.versionMinor})
                </option>
              ))}
            </select>
            {templates.length === 0 && !templatesLoading && (
              <p className="mt-1 text-xs text-gray-400">No EFFECTIVE form documents found. Create and release a FORM document first.</p>
            )}
          </div>
          <div>
            <label className="label-caps mb-1.5 block">Related Entity Type</label>
            <select
              value={relatedEntityType}
              onChange={(e) => setRelatedEntityType(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-gray-100"
            >
              <option value="OTHER">Other</option>
              <option value="SOLICITATION">Solicitation</option>
              <option value="CONTRACT">Contract</option>
              <option value="CHANGE">Change</option>
              <option value="CAPA">CAPA</option>
            </select>
          </div>
          <Input
            label="Related Entity ID (optional)"
            value={relatedEntityId}
            onChange={(e) => setRelatedEntityId(e.target.value)}
            placeholder="e.g. solicitation or contract id"
          />
        </div>
      </Modal>
    </PageShell>
  );
}
