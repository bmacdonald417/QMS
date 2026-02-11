import { Card, Table, Badge, Button } from '@/components/ui';
import { PageShell } from './PageShell';
import type { Column } from '@/components/ui';

interface SupplierRecord {
  id: string;
  name: string;
  tier: 'critical' | 'approved' | 'provisional';
  scorecardScore: number;
  lastAuditDate: string;
  nextAuditDue: string;
}

const sample: SupplierRecord[] = [
  {
    id: 'sup-1',
    name: 'ABC Raw Materials Inc.',
    tier: 'critical',
    scorecardScore: 92,
    lastAuditDate: '2024-01-15',
    nextAuditDue: '2025-01-15',
  },
  {
    id: 'sup-2',
    name: 'XYZ Packaging Ltd.',
    tier: 'approved',
    scorecardScore: 88,
    lastAuditDate: '2023-11-01',
    nextAuditDue: '2024-11-01',
  },
];

const tierVariant: Record<string, 'success' | 'info' | 'warning'> = {
  critical: 'success',
  approved: 'info',
  provisional: 'warning',
};

export function SupplierQuality() {
  const columns: Column<SupplierRecord>[] = [
    { key: 'name', header: 'Supplier' },
    {
      key: 'tier',
      header: 'Tier',
      render: (row) => <Badge variant={tierVariant[row.tier]}>{row.tier}</Badge>,
    },
    { key: 'scorecardScore', header: 'Score', width: '80px', align: 'center' },
    { key: 'lastAuditDate', header: 'Last Audit' },
    { key: 'nextAuditDue', header: 'Next Audit Due' },
  ];

  return (
    <PageShell
      title="Supplier Quality"
      subtitle="Vendor qualification, scorecards, and external audit logs"
      primaryAction={{ label: 'Add Supplier', onClick: () => {} }}
    >
      <Card padding="none">
        <Table
          columns={columns}
          data={sample}
          keyExtractor={(row) => row.id}
          emptyMessage="No suppliers. Add to manage qualification."
        />
      </Card>
    </PageShell>
  );
}
