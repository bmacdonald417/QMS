import { Card, Table, Badge, Button } from '@/components/ui';
import { PageShell } from './PageShell';
import type { Column } from '@/components/ui';

interface ChangeRecord {
  id: string;
  title: string;
  impactAssessment: string;
  status: 'draft' | 'review' | 'approved' | 'rejected' | 'implemented';
  requestedBy: string;
  requestedAt: string;
}

const sample: ChangeRecord[] = [
  {
    id: 'chg-1',
    title: 'Update SOP-DEV-002 Section 4',
    impactAssessment: 'Low — documentation only',
    status: 'review',
    requestedBy: 'A. Jones',
    requestedAt: '2024-02-01',
  },
  {
    id: 'chg-2',
    title: 'New equipment calibration procedure',
    impactAssessment: 'Medium — training required',
    status: 'approved',
    requestedBy: 'J. Smith',
    requestedAt: '2024-01-20',
  },
];

const statusVariant: Record<string, 'default' | 'success' | 'warning' | 'info' | 'danger' | 'neutral'> = {
  draft: 'neutral',
  review: 'warning',
  approved: 'success',
  rejected: 'danger',
  implemented: 'success',
};

export function ChangeControl() {
  const columns: Column<ChangeRecord>[] = [
    { key: 'id', header: 'ID', width: '90px' },
    { key: 'title', header: 'Title' },
    { key: 'impactAssessment', header: 'Impact' },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge variant={statusVariant[row.status]}>{row.status}</Badge>,
    },
    { key: 'requestedBy', header: 'Requested By' },
    { key: 'requestedAt', header: 'Date' },
  ];

  return (
    <PageShell
      title="Change Control"
      subtitle="Impact assessment and multi-stage approval"
      primaryAction={{ label: 'New Change Request', onClick: () => {} }}
    >
      <Card padding="none">
        <Table
          columns={columns}
          data={sample}
          keyExtractor={(row) => row.id}
          emptyMessage="No change requests."
        />
      </Card>
    </PageShell>
  );
}
