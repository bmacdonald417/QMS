import { Card, Table, Badge, Button } from '@/components/ui';
import { PageShell } from './PageShell';
import type { Column } from '@/components/ui';

interface TrainingRecord {
  id: string;
  employee: string;
  course: string;
  assignedDate: string;
  dueDate: string;
  status: 'assigned' | 'in_progress' | 'completed' | 'overdue';
  certifiedAt?: string;
}

const sample: TrainingRecord[] = [
  {
    id: 't1',
    employee: 'Jane Doe',
    course: 'GxP Fundamentals',
    assignedDate: '2024-01-15',
    dueDate: '2024-02-15',
    status: 'completed',
    certifiedAt: '2024-02-10',
  },
  {
    id: 't2',
    employee: 'John Smith',
    course: 'SOP-QA-001',
    assignedDate: '2024-02-01',
    dueDate: '2024-02-28',
    status: 'in_progress',
  },
];

const statusVariant: Record<string, 'default' | 'success' | 'warning' | 'info' | 'danger'> = {
  assigned: 'info',
  in_progress: 'warning',
  completed: 'success',
  overdue: 'danger',
};

export function TrainingCompetency() {
  const columns: Column<TrainingRecord>[] = [
    { key: 'employee', header: 'Employee' },
    { key: 'course', header: 'Course' },
    { key: 'assignedDate', header: 'Assigned' },
    { key: 'dueDate', header: 'Due' },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge variant={statusVariant[row.status]}>{row.status}</Badge>,
    },
    { key: 'certifiedAt', header: 'Certified' },
  ];

  return (
    <PageShell
      title="Training & Competency"
      subtitle="Employee matrices and certification tracking"
      primaryAction={{ label: 'Assign Course', onClick: () => {} }}
    >
      <Card padding="none">
        <Table
          columns={columns}
          data={sample}
          keyExtractor={(row) => row.id}
          emptyMessage="No training assignments."
        />
      </Card>
    </PageShell>
  );
}
