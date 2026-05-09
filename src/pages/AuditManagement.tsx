import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Table, Badge, Button, Input, Modal } from '@/components/ui';
import { PageShell } from './PageShell';
import { TraceLink } from '@/components/modules/compliance';
import type { Column } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';

interface AuditListRow {
  id: string;
  name: string;
  auditKind: string;
  scheduledDate: string;
  status: string;
  findingsCount: number;
  linkedCapaId: string | null;
}

const statusVariant: Record<string, 'default' | 'success' | 'warning' | 'info' | 'neutral'> = {
  SCHEDULED: 'info',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
};

export function AuditManagement() {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [audits, setAudits] = useState<AuditListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [name, setName] = useState('');
  const [auditKind, setAuditKind] = useState<'INTERNAL' | 'EXTERNAL' | 'SUPPLIER'>('INTERNAL');
  const [scheduledDate, setScheduledDate] = useState('');
  const [submitErr, setSubmitErr] = useState('');

  const canManage = user?.permissions?.includes('audit:manage');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiRequest<{ audits: AuditListRow[] }>('/api/audits', { token });
      setAudits(data.audits || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audits');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const createAudit = async () => {
    if (!token || !name.trim() || !scheduledDate) return;
    setSubmitErr('');
    try {
      const iso = new Date(scheduledDate).toISOString();
      await apiRequest('/api/audits', {
        token,
        method: 'POST',
        body: { name: name.trim(), auditKind, scheduledDate: iso },
      });
      setScheduleOpen(false);
      setName('');
      setScheduledDate('');
      load();
    } catch (e) {
      setSubmitErr(e instanceof Error ? e.message : 'Failed to schedule');
    }
  };

  const columns: Column<AuditListRow>[] = [
    { key: 'name', header: 'Audit' },
    { key: 'auditKind', header: 'Type', width: '100px' },
    {
      key: 'scheduledDate',
      header: 'Scheduled',
      render: (row) => new Date(row.scheduledDate).toLocaleDateString(),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge variant={statusVariant[row.status] ?? 'neutral'}>{row.status.replace(/_/g, ' ')}</Badge>,
    },
    { key: 'findingsCount', header: 'Findings', width: '90px' },
    {
      key: 'links',
      header: 'Linked CAPA',
      render: (row) =>
        row.linkedCapaId ? (
          <TraceLink type="capa" id={row.linkedCapaId} label="Open CAPA" />
        ) : (
          '—'
        ),
    },
  ];

  return (
    <PageShell
      title="Audit Management"
      subtitle="Quality audits and findings with CAPA traceability"
      primaryAction={
        canManage
          ? { label: 'Schedule audit', onClick: () => { setScheduleOpen(true); setSubmitErr(''); } }
          : undefined
      }
    >
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="text-gray-400">Loading…</p>
      ) : (
        <Card padding="none">
          <Table
            columns={columns}
            data={audits}
            keyExtractor={(row) => row.id}
            emptyMessage="No audits yet. Schedule an audit to record findings and link CAPAs."
            onRowClick={(row) => navigate(`/audits/${row.id}`)}
          />
        </Card>
      )}

      <Modal
        isOpen={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        title="Schedule audit"
        footer={
          <>
            <Button variant="secondary" onClick={() => setScheduleOpen(false)}>Cancel</Button>
            <Button onClick={createAudit} disabled={!name.trim() || !scheduledDate}>Save</Button>
          </>
        }
      >
        {submitErr && <p className="text-sm text-destructive mb-2">{submitErr}</p>}
        <div className="space-y-3">
          <Input label="Audit name *" value={name} onChange={(e) => setName(e.target.value)} />
          <div>
            <label className="label-caps block mb-1">Type</label>
            <select
              value={auditKind}
              onChange={(e) => setAuditKind(e.target.value as typeof auditKind)}
              className="w-full rounded border border-border bg-card px-3 py-2 text-gray-200"
            >
              <option value="INTERNAL">Internal</option>
              <option value="EXTERNAL">External</option>
              <option value="SUPPLIER">Supplier</option>
            </select>
          </div>
          <Input label="Scheduled date *" type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
        </div>
      </Modal>
    </PageShell>
  );
}
