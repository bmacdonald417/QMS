import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Input } from '@/components/ui';
import { PageShell } from './PageShell';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';

export function ChangeControlNew() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [riskAssessment, setRiskAssessment] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError('');
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim(),
      };
      if (riskAssessment.trim()) body.riskAssessment = riskAssessment.trim();
      if (ownerId.trim()) body.ownerId = ownerId.trim();
      if (dueDate.trim()) body.dueDate = new Date(dueDate).toISOString();
      const data = await apiRequest<{ changeControl: { id: string } }>('/api/change-controls', {
        token,
        method: 'POST',
        body,
      });
      navigate(`/change-control/${data.changeControl.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create change control');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell
      title="New Change Control"
      subtitle="Create a new change request"
      backLink={{ label: 'Back to Change Control', href: '/change-control' }}
    >
      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-compliance-red">{error}</p>}
          <div>
            <label className="label-caps block mb-1">Title *</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short title for the change"
              required
            />
          </div>
          <div>
            <label className="label-caps block mb-1">Description *</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the change and scope"
              required
              rows={4}
              className="w-full rounded border border-[var(--surface-border)] bg-[var(--surface-elevated)] px-3 py-2 text-gray-200 placeholder-gray-500"
            />
          </div>
          <div>
            <label className="label-caps block mb-1">Risk assessment</label>
            <textarea
              value={riskAssessment}
              onChange={(e) => setRiskAssessment(e.target.value)}
              placeholder="Impact assessment (e.g. Low — documentation only)"
              rows={2}
              className="w-full rounded border border-[var(--surface-border)] bg-[var(--surface-elevated)] px-3 py-2 text-gray-200 placeholder-gray-500"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label-caps block mb-1">Due date</label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div>
              <label className="label-caps block mb-1">Owner (user ID)</label>
              <Input
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                placeholder="Optional: paste user UUID"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create Change Control'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate('/change-control')}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </PageShell>
  );
}
