import { Card, Table, Badge, Button } from '@/components/ui';
import { PageShell } from './PageShell';
import { TraceLink } from '@/components/modules/compliance';
import type { Column } from '@/components/ui';

interface AuditRecord {
  id: string;
  name: string;
  type: 'internal' | 'external' | 'supplier';
  scheduledDate: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  findingsCount: number;
  linkedCapaId?: string;
}

const sample: AuditRecord[] = [
  {
    id: 'aud-1',
    name: 'Q1 2024 Internal GMP',
    type: 'internal',
    scheduledDate: '2024-03-15',
    status: 'completed',
    findingsCount: 3,
    linkedCapaId: 'capa-1',
  },
  {
    id: 'aud-2',
    name: 'Supplier ABC Audit',
    type: 'external',
    scheduledDate: '2024-04-01',
    status: 'scheduled',
    findingsCount: 0,
  },
];

const statusVariant: Record<string, 'default' | 'success' | 'warning' | 'info' | 'neutral'> = {
  scheduled: 'info',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'neutral',
};

export function AuditManagement() {
  const columns: Column<AuditRecord>[] = [
    { key: 'name', header: 'Audit' },
    { key: 'type', header: 'Type', width: '100px' },
    { key: 'scheduledDate', header: 'Scheduled' },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge variant={statusVariant[row.status]}>{row.status}</Badge>,
    },
    { key: 'findingsCount', header: 'Findings', width: '90px' },
    {
      key: 'links',
      header: 'Linked',
      render: (row) =>
        row.linkedCapaId ? (
          <TraceLink type="capa" id={row.linkedCapaId} label={`CAPA-${row.linkedCapaId}`} />
        ) : (
          '—'
        ),
    },
  ];

  return (
    <PageShell
      title="Audit Management"
      subtitle="Calendar-based scheduling and finding-to-CAPA linkage"
      primaryAction={{ label: 'Schedule Audit', onClick: () => {} }}
    >
      <Card padding="none">
        <Table
          columns={columns}
          data={sample}
          keyExtractor={(row) => row.id}
          emptyMessage="No audits scheduled."
        />
      </Card>
    </PageShell>
  );
}
