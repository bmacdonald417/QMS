import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, Badge, Button, Table } from '@/components/ui';
import { PageShell } from './PageShell';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';
import type { Column } from '@/components/ui';

interface TrainingModule {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  requiredRoles: string[];
  document: {
    id: string;
    documentId: string;
    title: string;
    versionMajor: number;
    versionMinor: number;
  };
}

interface UserTrainingRecord {
  id: string;
  status: 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE';
  completionDate: string | null;
  assignedAt: string;
  trainingModule: TrainingModule;
}

const statusVariant: Record<string, 'default' | 'success' | 'warning' | 'info' | 'danger'> = {
  ASSIGNED: 'info',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  OVERDUE: 'danger',
};

export function TrainingCompetency() {
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const [assignments, setAssignments] = useState<UserTrainingRecord[]>([]);
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const moduleId = searchParams.get('module');

  useEffect(() => {
    if (!token) return;
    Promise.all([
      apiRequest<{ assignments: UserTrainingRecord[] }>('/api/training/my-assignments', { token }),
      apiRequest<{ modules: TrainingModule[] }>('/api/training/modules', { token }),
    ])
      .then(([a, m]) => {
        setAssignments(a.assignments ?? []);
        setModules(m.modules ?? []);
      })
      .catch(() => {
        setAssignments([]);
        setModules([]);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const completeAssignment = (assignmentId: string) => {
    if (!token) return;
    setCompletingId(assignmentId);
    apiRequest(`/api/training/complete/${assignmentId}`, { token, method: 'POST' })
      .then(() => {
        setAssignments((prev) =>
          prev.map((r) =>
            r.id === assignmentId ? { ...r, status: 'COMPLETED' as const, completionDate: new Date().toISOString() } : r
          )
        );
      })
      .finally(() => setCompletingId(null));
  };

  const columns: Column<UserTrainingRecord>[] = [
    { key: 'trainingModule.title', header: 'Training', render: (r) => r.trainingModule.title },
    {
      key: 'document',
      header: 'Document',
      render: (r) => (
        <Link to={`/documents/${r.trainingModule.document.id}`} className="text-mactech-blue hover:underline">
          {r.trainingModule.document.documentId} v{r.trainingModule.document.versionMajor}.{r.trainingModule.document.versionMinor}
        </Link>
      ),
    },
    { key: 'assignedAt', header: 'Assigned', render: (r) => new Date(r.assignedAt).toLocaleDateString() },
    { key: 'dueDate', header: 'Due', render: (r) => new Date(r.trainingModule.dueDate).toLocaleDateString() },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <Badge variant={statusVariant[r.status]}>{r.status.replace(/_/g, ' ')}</Badge>,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) =>
        r.status !== 'COMPLETED' ? (
          <Button
            size="sm"
            disabled={completingId === r.id}
            onClick={() => completeAssignment(r.id)}
          >
            {completingId === r.id ? 'Completing...' : 'Mark complete'}
          </Button>
        ) : (
          <span className="text-sm text-gray-500">
            {r.completionDate ? new Date(r.completionDate).toLocaleDateString() : '—'}
          </span>
        ),
    },
  ];

  return (
    <PageShell
      title="Training"
      subtitle="Training modules and your assignments"
    >
      <div className="space-y-6">
        <Card padding="md">
          <h2 className="mb-4 text-lg text-white">My Assignments</h2>
          {loading ? (
            <p className="text-gray-400">Loading...</p>
          ) : assignments.length === 0 ? (
            <p className="text-gray-500">No training assignments.</p>
          ) : (
            <Table
              columns={columns}
              data={assignments}
              keyExtractor={(row) => row.id}
              emptyMessage="No assignments"
            />
          )}
        </Card>

        <Card padding="md">
          <h2 className="mb-4 text-lg text-white">All Training Modules</h2>
          {loading ? (
            <p className="text-gray-400">Loading...</p>
          ) : modules.length === 0 ? (
            <p className="text-gray-500">No training modules yet.</p>
          ) : (
            <ul className="space-y-2">
              {modules.map((mod) => (
                <li
                  key={mod.id}
                  className={`rounded-lg border p-3 ${
                    moduleId === mod.id ? 'border-mactech-blue bg-mactech-blue-muted/30' : 'border-surface-border bg-surface-overlay'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-white">{mod.title}</p>
                      <p className="text-sm text-gray-500">{mod.description}</p>
                      <p className="mt-1 text-xs text-gray-400">
                        Due: {new Date(mod.dueDate).toLocaleDateString()} • Document:{' '}
                        <Link to={`/documents/${mod.document.id}`} className="text-mactech-blue hover:underline">
                          {mod.document.documentId} v{mod.document.versionMajor}.{mod.document.versionMinor}
                        </Link>
                      </p>
                    </div>
                    <Link
                      to={`/documents/${mod.document.id}`}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-surface-border bg-surface-elevated px-3 py-1.5 text-sm font-medium text-gray-200 transition-colors hover:bg-surface-overlay focus:outline-none focus-visible:ring-2 focus-visible:ring-mactech-blue"
                    >
                      View document
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
