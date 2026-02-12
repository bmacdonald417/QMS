import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Button, Badge, Input } from '@/components/ui';
import { PageShell } from './PageShell';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';

interface PeriodicReviewItem {
  id: string;
  documentId: string;
  reviewDate: string;
  status: 'PENDING' | 'COMPLETED' | 'OVERDUE';
  completedAt: string | null;
  document: {
    id: string;
    documentId: string;
    title: string;
    versionMajor: number;
    versionMinor: number;
    nextReviewDate: string | null;
  };
}

export function PeriodicReviewsPage() {
  const { token } = useAuth();
  const [reviews, setReviews] = useState<PeriodicReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [nextReviewDateInput, setNextReviewDateInput] = useState('');

  const fetchReviews = () => {
    if (!token) return;
    apiRequest<{ reviews: PeriodicReviewItem[] }>('/api/periodic-reviews/my-reviews', { token })
      .then((data) => setReviews(data.reviews ?? []))
      .catch(() => setReviews([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchReviews();
  }, [token]);

  const completeReview = (reviewId: string, nextDate?: string) => {
    if (!token) return;
    setCompletingId(reviewId);
    const body = nextDate ? { nextReviewDate: nextDate } : {};
    apiRequest(`/api/periodic-reviews/complete/${reviewId}`, { token, method: 'POST', body })
      .then(() => {
        setNextReviewDateInput('');
        fetchReviews();
      })
      .finally(() => setCompletingId(null));
  };

  const pending = reviews.filter((r) => r.status === 'PENDING' || r.status === 'OVERDUE');

  return (
    <PageShell title="Periodic Reviews" subtitle="Documents assigned to you for periodic review">
      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : (
        <Card padding="md">
          {reviews.length === 0 ? (
            <p className="text-gray-500">No periodic reviews assigned to you.</p>
          ) : (
            <ul className="space-y-4">
              {reviews.map((r) => (
                <li
                  key={r.id}
                  className="rounded-lg border border-surface-border bg-surface-overlay p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/documents/${r.document.id}`}
                          className="font-medium text-mactech-blue hover:underline"
                        >
                          {r.document.documentId} v{r.document.versionMajor}.{r.document.versionMinor} – {r.document.title}
                        </Link>
                        <Badge variant={r.status === 'OVERDUE' ? 'danger' : r.status === 'COMPLETED' ? 'success' : 'warning'}>
                          {r.status}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-gray-500">
                        Review due: {new Date(r.reviewDate).toLocaleDateString()}
                        {r.document.nextReviewDate && (
                          <> • Next review was: {new Date(r.document.nextReviewDate).toLocaleDateString()}</>
                        )}
                      </p>
                    </div>
                    {r.status !== 'COMPLETED' && (
                      <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="date"
                            value={nextReviewDateInput}
                            onChange={(e) => setNextReviewDateInput(e.target.value)}
                            className="rounded border border-surface-border bg-surface-elevated px-2 py-1.5 text-sm text-gray-100"
                          />
                          <Button
                            size="sm"
                            disabled={completingId === r.id}
                            onClick={() => {
                              const next = nextReviewDateInput
                                ? new Date(nextReviewDateInput)
                                : new Date();
                              if (nextReviewDateInput) {
                                completeReview(r.id, next.toISOString());
                              } else {
                                next.setFullYear(next.getFullYear() + 1);
                                completeReview(r.id, next.toISOString());
                              }
                            }}
                          >
                            {completingId === r.id ? 'Completing...' : 'Mark complete'}
                          </Button>
                        </div>
                        <p className="text-xs text-gray-500">Leave date empty to set next review to +1 year</p>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </PageShell>
  );
}
