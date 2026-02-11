import { Card, Table, Badge, Button } from '@/components/ui';
import { PageShell } from './PageShell';
import type { Column } from '@/components/ui';

interface EquipmentRecord {
  id: string;
  name: string;
  assetId: string;
  calibrationDue: string;
  lastMaintenance: string;
  validationStatus: 'validated' | 'pending' | 'overdue';
}

const sample: EquipmentRecord[] = [
  {
    id: 'eq-1',
    name: 'Balance B-01',
    assetId: 'AST-001',
    calibrationDue: '2024-03-15',
    lastMaintenance: '2024-01-10',
    validationStatus: 'validated',
  },
  {
    id: 'eq-2',
    name: 'pH Meter P-02',
    assetId: 'AST-002',
    calibrationDue: '2024-02-28',
    lastMaintenance: '2024-02-01',
    validationStatus: 'pending',
  },
];

const statusVariant: Record<string, 'success' | 'warning' | 'danger'> = {
  validated: 'success',
  pending: 'warning',
  overdue: 'danger',
};

export function EquipmentAssets() {
  const columns: Column<EquipmentRecord>[] = [
    { key: 'assetId', header: 'Asset ID', width: '100px' },
    { key: 'name', header: 'Equipment' },
    { key: 'calibrationDue', header: 'Calibration Due' },
    { key: 'lastMaintenance', header: 'Last Maintenance' },
    {
      key: 'validationStatus',
      header: 'Status',
      render: (row) => (
        <Badge variant={statusVariant[row.validationStatus]}>{row.validationStatus}</Badge>
      ),
    },
  ];

  return (
    <PageShell
      title="Equipment & Asset Management"
      subtitle="Calibration, maintenance, and validation status"
      primaryAction={{ label: 'Add Equipment', onClick: () => {} }}
    >
      <Card padding="none">
        <Table
          columns={columns}
          data={sample}
          keyExtractor={(row) => row.id}
          emptyMessage="No equipment records."
        />
      </Card>
    </PageShell>
  );
}
