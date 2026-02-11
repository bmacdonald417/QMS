import { Card, Table, Badge, Button } from '@/components/ui';
import { PageShell } from './PageShell';
import { TraceLink } from '@/components/modules/compliance';
import { AuditTrailPanel } from '@/components/modules/compliance';
import type { CAPARecord } from '@/lib/schemas';
import type { Column } from '@/components/ui';

const stageLabels: Record<string, string> = {
  initiation: 'Initiation',
  investigation: 'Investigation',
  root_cause: 'Root Cause',
  action_plan: 'Action Plan',
  verification: 'Verification',
  closed: 'Closed',
};

const sampleCapas: CAPARecord[] = [
  {
    id: 'capa-1',
    title: 'Batch deviation B-2024-001',
    stage: 'action_plan',
    sourceType: 'deviation',
    sourceId: 'dev-1',
    openedAt: '2024-02-01T00:00:00Z',
    dueDate: '2024-03-01T00:00:00Z',
    owner: 'J. Smith',
  },
  {
    id: 'capa-2',
    title: 'Audit finding AF-003',
    stage: 'investigation',
    sourceType: 'audit_finding',
    sourceId: 'aud-1',
    openedAt: '2024-02-10T00:00:00Z',
    owner: 'A. Jones',
  },
];

const stageVariant: Record<string, 'default' | 'warning' | 'success' | 'info'> = {
  initiation: 'info',
  investigation: 'warning',
  root_cause: 'warning',
  action_plan: 'warning',
  verification: 'default',
  closed: 'success',
};

export function CAPA() {
  const columns: Column<CAPARecord>[] = [
    { key: 'id', header: 'ID', width: '100px' },
    { key: 'title', header: 'Title' },
    {
      key: 'stage',
      header: 'Stage',
      render: (row) => (
        <Badge variant={stageVariant[row.stage]}>{stageLabels[row.stage]}</Badge>
      ),
    },
    { key: 'owner', header: 'Owner' },
    { key: 'openedAt', header: 'Opened', render: (r) => r.openedAt.slice(0, 10) },
    {
      key: 'source',
      header: 'Source',
      render: (row) =>
        row.sourceType === 'audit_finding' && row.sourceId ? (
          <TraceLink
            type="audit_finding"
            id={row.sourceId}
            label={`Finding ${row.sourceId}`}
          />
        ) : row.sourceType === 'deviation' && row.sourceId ? (
          <TraceLink type="document" id={row.sourceId} label={`Deviation ${row.sourceId}`} />
        ) : (
          row.sourceType
        ),
    },
  ];

  const historyEntries = [
    {
      id: '1',
      entityType: 'capa',
      entityId: 'capa-1',
      action: 'update' as const,
      userId: 'u1',
      userName: 'J. Smith',
      timestamp: new Date().toISOString(),
      reason: 'Stage advanced to Action Plan',
    },
  ];

  return (
    <PageShell
      title="CAPA"
      subtitle="Corrective / Preventive Action workflow"
      primaryAction={{ label: 'New CAPA', onClick: () => {} }}
      sidePanel={<AuditTrailPanel entries={historyEntries} title="History" />}
    >
      <Card padding="none">
        <Table
          columns={columns}
          data={sampleCapas}
          keyExtractor={(row) => row.id}
          emptyMessage="No CAPAs. Create from audit finding or deviation."
        />
      </Card>
    </PageShell>
  );
}
