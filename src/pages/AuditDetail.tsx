import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Button, Card, Input, Modal, Table } from '@/components/ui';
import type { Column } from '@/components/ui';
import { PageShell } from './PageShell';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';

interface CapaBrief {
  id: string;
  capaId: string;
  title: string;
  status: string;
}

interface FindingRow {
  id: string;
  findingCode: string;
  title: string;
  severity: string;
  status: string;
  linkedCapaId: string | null;
  capa: CapaBrief | null;
}

interface AuditDetailModel {
  id: string;
  name: string;
  auditKind: string;
  scheduledDate: string;
  status: string;
  findings: FindingRow[];
}

const statusVariant: Record<string, 'default' | 'success' | 'warning' | 'info' | 'neutral'> = {
  SCHEDULED: 'info',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
};

export function AuditDetail() {
  const { auditId } = useParams<{ auditId: string }>();
  const { token, user } = useAuth();
  const [audit, setAudit] = useState<AuditDetailModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [findingCode, setFindingCode] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [linkedCapaId, setLinkedCapaId] = useState('');
  const [reason, setReason] = useState('');
  const [submitErr, setSubmitErr] = useState('');

  const canManage = user?.permissions?.includes('audit:manage');

  const load = async () => {
    if (!token || !auditId) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiRequest<{ audit: AuditDetailModel }>(`/api/audits/${auditId}`, { token });
      setAudit(data.audit);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token, auditId]);

  const submitFinding = async () => {
    if (!token || !auditId || !reason.trim() || !findingCode.trim() || !title.trim()) return;
    setSubmitErr('');
    try {
      await apiRequest(`/api/audits/${auditId}/findings`, {
        token,
        method: 'POST',
        body: {
          findingCode: findingCode.trim(),
          title: title.trim(),
          description: description.trim() || null,
          linkedCapaId: linkedCapaId.trim() || null,
          reason: reason.trim(),
        },
      });
      setModalOpen(false);
      setFindingCode('');
      setTitle('');
      setDescription('');
      setLinkedCapaId('');
      setReason('');
      load();
    } catch (e) {
      setSubmitErr(e instanceof Error ? e.message : 'Failed to create finding');
    }
  };

  const columns: Column<FindingRow>[] = [
    { key: 'findingCode', header: 'Code', width: '90px' },
    { key: 'title', header: 'Title' },
    { key: 'severity', header: 'Severity', width: '100px' },
    {
      key: 'status',
      header: 'Status',
      width: '120px',
      render: (row) => <Badge variant="neutral">{row.status}</Badge>,
    },
    {
      key: 'capa',
      header: 'Linked CAPA',
      render: (row) =>
        row.capa ? (
          <Link to={`/capas/${row.capa.id}`} className="text-[var(--mactech-blue)] hover:underline">
            {row.capa.capaId}
          </Link>
        ) : (
          '—'
        ),
    },
  ];

  if (loading || !audit) {
    return (
      <PageShell title="Audit" subtitle={loading ? 'Loading…' : error || 'Not found'} backLink={{ label: 'Audits', href: '/audits' }}>
        {error && <p className="text-compliance-red text-sm">{error}</p>}
      </PageShell>
    );
  }

  return (
    <PageShell
      title={audit.name}
      subtitle={`${audit.auditKind} · ${new Date(audit.scheduledDate).toLocaleDateString()}`}
      backLink={{ label: 'Back to audits', href: '/audits' }}
      primaryAction={
        canManage
          ? { label: 'Add finding', onClick: () => { setModalOpen(true); setSubmitErr(''); } }
          : undefined
      }
    >
      <div className="mb-4">
        <Badge variant={statusVariant[audit.status] ?? 'neutral'}>{audit.status.replace(/_/g, ' ')}</Badge>
      </div>
      <Card padding="none">
        <Table
          columns={columns}
          data={audit.findings}
          keyExtractor={(row) => row.id}
          emptyMessage="No findings recorded."
        />
      </Card>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New finding"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={submitFinding} disabled={!findingCode.trim() || !title.trim() || !reason.trim()}>
              Create
            </Button>
          </>
        }
      >
        {submitErr && <p className="text-sm text-compliance-red mb-2">{submitErr}</p>}
        <div className="space-y-3">
          <Input label="Finding code *" value={findingCode} onChange={(e) => setFindingCode(e.target.value)} placeholder="e.g. F-01" />
          <Input label="Title *" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div>
            <label className="label-caps block mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded border border-[var(--surface-border)] bg-[var(--surface-elevated)] px-3 py-2 text-gray-200"
            />
          </div>
          <Input
            label="Linked CAPA id (UUID)"
            value={linkedCapaId}
            onChange={(e) => setLinkedCapaId(e.target.value)}
            placeholder="Optional"
          />
          <div>
            <label className="label-caps block mb-1">Reason for record *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full rounded border border-[var(--surface-border)] bg-[var(--surface-elevated)] px-3 py-2 text-gray-200"
            />
          </div>
        </div>
      </Modal>
    </PageShell>
  );
}
