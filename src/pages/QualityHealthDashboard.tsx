import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Badge, Button } from '@/components/ui';
import { PageShell } from './PageShell';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';

interface DashboardMetrics {
  documentsByStatus: Record<string, number>;
  overdueTraining: number;
  pendingReviews: number;
  averageApprovalTimeDays: number | null;
  documentsNearingReview: {
    id: string;
    documentId: string;
    title: string;
    versionMajor: number;
    versionMinor: number;
    nextReviewDate: string | null;
  }[];
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  IN_REVIEW: 'In Review',
  APPROVED: 'Approved',
  EFFECTIVE: 'Effective',
  OBSOLETE: 'Obsolete',
  PENDING_APPROVAL: 'Pending Approval',
  PENDING_QUALITY_RELEASE: 'Pending Release',
};

export function QualityHealthDashboard() {
  const { token } = useAuth();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    apiRequest<DashboardMetrics>('/api/dashboard/metrics', { token })
      .then(setMetrics)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load metrics'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <PageShell title="Quality Health" subtitle="Loading..."><p className="text-gray-400">Loading metrics...</p></PageShell>;
  if (error) return <PageShell title="Quality Health" subtitle=""><p className="text-compliance-red">{error}</p></PageShell>;
  if (!metrics) return null;

  const statusEntries = Object.entries(metrics.documentsByStatus).filter(
    ([k, v]) => v > 0 && !['ARCHIVED'].includes(k)
  );

  return (
    <PageShell title="Quality Health" subtitle="Document control, training, and review metrics">
      <div className="space-y-6">
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card padding="md">
            <span className="label-caps text-gray-500">Overdue Training</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-white">{metrics.overdueTraining}</span>
              {metrics.overdueTraining > 0 && (
                <Badge variant="danger" size="sm">Requires action</Badge>
              )}
            </div>
            <Link to="/training" className="mt-2 inline-block text-sm text-mactech-blue hover:underline">
              View training
            </Link>
          </Card>
          <Card padding="md">
            <span className="label-caps text-gray-500">Pending / Overdue Reviews</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-white">{metrics.pendingReviews}</span>
              {metrics.pendingReviews > 0 && (
                <Badge variant="warning" size="sm">Due</Badge>
              )}
            </div>
            <Link to="/periodic-reviews" className="mt-2 inline-block text-sm text-mactech-blue hover:underline">
              My reviews
            </Link>
          </Card>
          <Card padding="md">
            <span className="label-caps text-gray-500">Avg. Approval Time</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-white">
                {metrics.averageApprovalTimeDays != null ? `${metrics.averageApprovalTimeDays} days` : '—'}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">Draft to Effective</p>
          </Card>
          <Card padding="md">
            <span className="label-caps text-gray-500">Documents Nearing Review</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-white">{metrics.documentsNearingReview.length}</span>
            </div>
            <Link to="/periodic-reviews" className="mt-2 inline-block text-sm text-mactech-blue hover:underline">
              View list
            </Link>
          </Card>
        </section>

        <Card padding="md">
          <h2 className="mb-4 text-lg text-white">Documents by Status</h2>
          <div className="flex flex-wrap gap-4">
            {statusEntries.map(([status, count]) => (
              <div key={status} className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-elevated px-4 py-2">
                <span className="text-sm text-gray-300">{STATUS_LABELS[status] ?? status}</span>
                <span className="text-lg font-semibold text-white">{count}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card padding="md">
          <h2 className="mb-4 text-lg text-white">Documents Nearing Periodic Review (next 30 days)</h2>
          {metrics.documentsNearingReview.length === 0 ? (
            <p className="text-sm text-gray-500">None due within 30 days.</p>
          ) : (
            <ul className="space-y-2">
              {metrics.documentsNearingReview.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between rounded-lg border border-surface-border bg-surface-overlay px-3 py-2">
                  <span className="text-gray-200">
                    {doc.documentId} v{doc.versionMajor}.{doc.versionMinor} – {doc.title}
                  </span>
                  <div className="flex items-center gap-2">
                    {doc.nextReviewDate && (
                      <span className="text-sm text-gray-500">
                        Due: {new Date(doc.nextReviewDate).toLocaleDateString()}
                      </span>
                    )}
                    <Link
                      to={`/documents/${doc.id}`}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-surface-border bg-surface-elevated px-3 py-1.5 text-sm font-medium text-gray-200 transition-colors hover:bg-surface-overlay focus:outline-none focus-visible:ring-2 focus-visible:ring-mactech-blue"
                    >
                      Open
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
