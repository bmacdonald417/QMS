import { Card, Table, Button } from '@/components/ui';
import { PageShell } from './PageShell';
import type { RiskItem } from '@/lib/schemas';
import type { Column } from '@/components/ui';

const sampleRisks: RiskItem[] = [
  {
    id: 'r1',
    failureMode: 'Incorrect weighing',
    severity: 7,
    occurrence: 3,
    detection: 2,
    rpn: 42,
    actions: 'Double-check balance calibration',
  },
  {
    id: 'r2',
    failureMode: 'Label mix-up',
    severity: 9,
    occurrence: 2,
    detection: 4,
    rpn: 72,
    actions: 'Barcode verification at each step',
  },
];

export function RiskManagement() {
  const columns: Column<RiskItem>[] = [
    { key: 'failureMode', header: 'Failure Mode' },
    { key: 'severity', header: 'S', width: '50px', align: 'center' },
    { key: 'occurrence', header: 'O', width: '50px', align: 'center' },
    { key: 'detection', header: 'D', width: '50px', align: 'center' },
    { key: 'rpn', header: 'RPN', width: '60px', align: 'center' },
    { key: 'actions', header: 'Actions' },
  ];

  return (
    <PageShell
      title="Risk Management"
      subtitle="FMEA and RPN (Severity × Occurrence × Detection)"
      primaryAction={{ label: 'Add Risk Item', onClick: () => {} }}
    >
      <Card padding="md" className="mb-4">
        <p className="label-caps text-gray-500 mb-2">RPN Calculator</p>
        <p className="text-sm text-gray-400">
          RPN = Severity (1–10) × Occurrence (1–10) × Detection (1–10). Higher RPN indicates
          higher priority for mitigation.
        </p>
      </Card>
      <Card padding="none">
        <Table
          columns={columns}
          data={sampleRisks}
          keyExtractor={(row) => row.id}
          emptyMessage="No risk items. Add from FMEA."
        />
      </Card>
    </PageShell>
  );
}
