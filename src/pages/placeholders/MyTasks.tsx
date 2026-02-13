import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Table, Badge, Button } from '@/components/ui';
import { PageShell } from '../PageShell';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';

type TaskItem =
  | { type: 'DOCUMENT_ASSIGNMENT'; id: string; taskType: string; status: string; documentId: string; docId: string; title: string; documentStatus: string; link: string }
  | { type: 'CAPA_TASK'; id: string; taskType: string; status: string; capaId: string; capaNumber: string; title: string; description?: string | null; dueDate?: string | null; link: string };

export function MyTasks() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const data = await apiRequest<{ tasks: TaskItem[] }>('/api/tasks', { token });
        if (!cancelled) setTasks(data.tasks);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load tasks');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const columns = [
    { key: 'type', header: 'Type', width: '120px', render: (row: TaskItem) => <Badge variant="info">{row.type === 'DOCUMENT_ASSIGNMENT' ? 'Document' : 'CAPA'}</Badge> },
    { key: 'title', header: 'Title' },
    { key: 'taskType', header: 'Task', width: '140px', render: (row: TaskItem) => String(row.taskType).replace(/_/g, ' ') },
    { key: 'status', header: 'Status', width: '100px', render: (row: TaskItem) => <Badge variant={row.status === 'COMPLETED' ? 'success' : 'warning'}>{row.status}</Badge> },
    { key: 'link', header: '', width: '80px', render: (row: TaskItem) => <Button variant="secondary" onClick={() => navigate(row.link)}>Open</Button> },
  ];

  return (
    <PageShell title="My Tasks" subtitle="Document assignments and CAPA tasks assigned to you">
      {error && <p className="mb-3 text-sm text-compliance-red">{error}</p>}
      <Card padding="none">
        <Table
          columns={columns}
          data={tasks}
          keyExtractor={(row) => `${row.type}-${row.id}`}
          emptyMessage={loading ? 'Loading…' : 'No pending tasks.'}
        />
      </Card>
    </PageShell>
  );
}
