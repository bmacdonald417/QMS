import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Badge, Card } from '@/components/ui';
import { GovernanceApprovalPanel } from '@/components/modules/compliance/GovernanceApprovalPanel';
import { PageShell } from './PageShell';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';

interface ChangeControlDetailModel {
  id: string;
  changeId: string;
  title: string;
  description: string;
  riskAssessment: string | null;
  status: string;
  initiator: { id: string; firstName: string; lastName: string; email: string } | null;
  owner: { id: string; firstName: string; lastName: string; email: string } | null;
  dueDate: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tasks: { id: string; taskType: string; status: string; title: string; dueDate: string | null }[];
  history: { id: string; action: string; timestamp: string; user: { firstName: string; lastName: string } }[];
}

const statusVariant: Record<string, 'default' | 'info' | 'success' | 'warning' | 'neutral' | 'danger'> = {
  DRAFT: 'neutral',
  SUBMITTED: 'info',
  REVIEW: 'warning',
  APPROVAL: 'warning',
  IMPLEMENTATION: 'info',
  EFFECTIVENESS: 'warning',
  PENDING_CLOSURE: 'warning',
  CLOSED: 'success',
  CANCELLED: 'danger',
  ARCHIVED: 'default',
};

export function ChangeControlDetail() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [cc, setCc] = useState<ChangeControlDetailModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token || !id) return;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const data = await apiRequest<{ changeControl: ChangeControlDetailModel }>(`/api/change-controls/${id}`, { token });
        setCc(data.changeControl);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load change control');
      } finally {
        setLoading(false);
      }
    })();
  }, [token, id]);

  if (loading || !cc) {
    return (
      <PageShell title="Change Control" subtitle={loading ? 'Loading…' : error || 'Not found'}>
        <p className="text-gray-400">{loading ? 'Loading…' : error || 'Not found'}</p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={cc.changeId}
      subtitle={cc.title}
      backLink={{ label: 'Back to Change Control', href: '/change-control' }}
    >
      {error && <p className="mb-3 text-sm text-compliance-red">{error}</p>}
      <Card>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusVariant[cc.status] || 'default'}>{cc.status.replace(/_/g, ' ')}</Badge>
          </div>
          <p className="text-gray-300">{cc.description}</p>
          {cc.riskAssessment && (
            <div>
              <span className="label-caps text-gray-500">Risk assessment</span>
              <p className="mt-1 text-gray-300">{cc.riskAssessment}</p>
            </div>
          )}
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-gray-500">Owner</dt><dd>{cc.owner ? `${cc.owner.firstName} ${cc.owner.lastName}` : '—'}</dd></div>
            <div><dt className="text-gray-500">Initiator</dt><dd>{cc.initiator ? `${cc.initiator.firstName} ${cc.initiator.lastName}` : '—'}</dd></div>
            <div><dt className="text-gray-500">Due date</dt><dd>{cc.dueDate ? new Date(cc.dueDate).toLocaleDateString() : '—'}</dd></div>
            <div><dt className="text-gray-500">Closed</dt><dd>{cc.closedAt ? new Date(cc.closedAt).toLocaleDateString() : '—'}</dd></div>
          </dl>
          {cc.tasks?.length > 0 && (
            <div>
              <h3 className="font-medium text-gray-200 mt-4">Tasks</h3>
              <ul className="mt-2 space-y-1">
                {cc.tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-sm">
                    <Badge variant={t.status === 'COMPLETED' ? 'success' : 'warning'}>{t.status}</Badge>
                    {t.title} ({t.taskType.replace(/_/g, ' ')})
                  </li>
                ))}
              </ul>
            </div>
          )}
          {cc.history?.length > 0 && (
            <div>
              <h3 className="font-medium text-gray-200 mt-4">History</h3>
              <ul className="mt-2 space-y-1 text-sm text-gray-400">
                {cc.history.slice(0, 10).map((h) => (
                  <li key={h.id}>{h.action} — {h.user.firstName} {h.user.lastName} — {new Date(h.timestamp).toLocaleString()}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Card>

      {id && (
        <GovernanceApprovalPanel
          approvalUrl={`/api/change-controls/${id}/governance-approval`}
          token={token}
          title="Governance Approval"
        />
      )}
    </PageShell>
  );
}
