import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Table, Badge, Button } from '@/components/ui';
import { PageShell } from '../PageShell';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';

type PendingTask =
  | {
      type: 'DOCUMENT_ASSIGNMENT';
      id: string;
      taskType: string;
      status: string;
      documentId: string;
      docId: string;
      title: string;
      documentStatus: string;
      dueDate: string | null;
      link: string;
    }
  | {
      type: 'CAPA_TASK';
      id: string;
      taskType: string;
      status: string;
      capaId: string;
      capaNumber: string;
      title: string;
      dueDate: string | null;
      link: string;
    }
  | {
      type: 'CHANGE_TASK';
      id: string;
      taskType: string;
      status: string;
      changeControlId: string;
      changeId: string;
      title: string;
      dueDate: string | null;
      link: string;
    };

type HistoryItem = {
  type: string;
  id: string;
  taskType: string;
  status: string;
  entityLabel: string;
  documentId: string;
  docId: string;
  title: string;
  documentStatus: string;
  completedAt: string | null;
  link: string;
};

const APPROVAL_TASK_TYPES = ['REVIEW', 'APPROVAL', 'QUALITY_RELEASE'];

function isApprovalRelated(task: PendingTask): boolean {
  if (task.type === 'DOCUMENT_ASSIGNMENT') return APPROVAL_TASK_TYPES.includes(task.taskType);
  if (task.type === 'CAPA_TASK') return task.taskType === 'APPROVAL' || task.taskType === 'PLAN_APPROVAL' || task.taskType === 'CLOSURE_REVIEW';
  if (task.type === 'CHANGE_TASK') return task.taskType === 'APPROVAL' || task.taskType === 'REVIEW';
  return false;
}

function taskEntityLabel(task: PendingTask): string {
  if (task.type === 'DOCUMENT_ASSIGNMENT') return task.docId;
  if (task.type === 'CAPA_TASK') return task.capaNumber;
  if (task.type === 'CHANGE_TASK') return task.changeId;
  return '';
}

export function Approvals() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [pending, setPending] = useState<PendingTask[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const [tasksRes, historyRes] = await Promise.all([
          apiRequest<{ tasks: PendingTask[] }>('/api/tasks', { token }),
          apiRequest<{ history: HistoryItem[] }>('/api/tasks/history', { token }),
        ]);
        if (!cancelled) {
          const approvalTasks = (tasksRes.tasks || []).filter(isApprovalRelated);
          setPending(approvalTasks);
          setHistory(historyRes.history || []);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load approvals');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const pendingColumns = [
    { key: 'entity' as const, header: 'Document / Item', width: '160px', render: (row: PendingTask) => taskEntityLabel(row) },
    { key: 'title' as const, header: 'Title' },
    { key: 'taskType' as const, header: 'Task type', width: '140px', render: (row: PendingTask) => String(row.taskType).replace(/_/g, ' ') },
    { key: 'status' as const, header: 'Status', width: '100px', render: (row: PendingTask) => <Badge variant="warning">{row.status}</Badge> },
    {
      key: 'action' as const,
      header: '',
      width: '100px',
      render: (row: PendingTask) => (
        <Button variant="primary" onClick={() => navigate(row.link)}>
          Open
        </Button>
      ),
    },
  ];

  const historyColumns = [
    { key: 'entityLabel', header: 'Document', width: '140px' },
    { key: 'title', header: 'Title' },
    { key: 'taskType', header: 'Action', width: '140px', render: (row: HistoryItem) => String(row.taskType).replace(/_/g, ' ') },
    {
      key: 'completedAt',
      header: 'Completed',
      width: '160px',
      render: (row: HistoryItem) => (row.completedAt ? new Date(row.completedAt).toLocaleString() : '—'),
    },
    {
      key: 'link',
      header: '',
      width: '80px',
      render: (row: HistoryItem) => (
        <Button variant="secondary" onClick={() => navigate(row.link)}>
          View
        </Button>
      ),
    },
  ];

  return (
    <PageShell
      title="Approvals"
      subtitle="Review and approve documents. Open a task to complete your approval."
    >
      {error && <p className="mb-3 text-sm text-compliance-red">{error}</p>}

      <Card padding="md" className="mb-6">
        <h2 className="mb-3 text-lg font-semibold text-white">Pending approvals</h2>
        <p className="mb-4 text-sm text-gray-400">
          Documents and items waiting for your review or approval. Open the item to complete the task.
        </p>
        <Table
          columns={pendingColumns}
          data={pending}
          keyExtractor={(row) => `${row.type}-${row.id}`}
          emptyMessage={loading ? 'Loading…' : 'No pending approvals.'}
        />
      </Card>

      <Card padding="md">
        <h2 className="mb-3 text-lg font-semibold text-white">Approval history</h2>
        <p className="mb-4 text-sm text-gray-400">
          Your completed document reviews and approvals.
        </p>
        <Table
          columns={historyColumns}
          data={history}
          keyExtractor={(row) => row.id}
          emptyMessage={loading ? 'Loading…' : 'No approval history yet.'}
        />
      </Card>
    </PageShell>
  );
}
