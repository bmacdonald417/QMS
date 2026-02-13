import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Input, Modal } from '@/components/ui';
import { PageShell } from '../PageShell';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';

export function CAPANew() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'DRAFT' | 'OPEN'>('DRAFT');
  const [ownerId, setOwnerId] = useState('');
  const [severity, setSeverity] = useState('');
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
        status,
      };
      if (ownerId.trim()) body.ownerId = ownerId.trim();
      if (severity.trim()) body.severity = severity.trim();
      if (dueDate.trim()) body.dueDate = new Date(dueDate).toISOString();
      const data = await apiRequest<{ capa: { id: string } }>('/api/capas', {
        token,
        method: 'POST',
        body,
      });
      navigate(`/capas/${data.capa.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create CAPA');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell
      title="New CAPA"
      subtitle="Create a new Corrective and Preventive Action record"
    >
      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-compliance-red">{error}</p>}
          <div>
            <label className="label-caps block mb-1">Title *</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short title for the CAPA"
              required
            />
          </div>
          <div>
            <label className="label-caps block mb-1">Description *</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the issue and scope"
              required
              rows={4}
              className="w-full rounded border border-[var(--surface-border)] bg-[var(--surface-elevated)] px-3 py-2 text-gray-200 placeholder-gray-500"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label-caps block mb-1">Initial status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'DRAFT' | 'OPEN')}
                className="w-full rounded border border-[var(--surface-border)] bg-[var(--surface-elevated)] px-3 py-2 text-gray-200"
              >
                <option value="DRAFT">Draft</option>
                <option value="OPEN">Open</option>
              </select>
            </div>
            <div>
              <label className="label-caps block mb-1">Severity</label>
              <Input
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                placeholder="e.g. Minor, Major, Critical"
              />
            </div>
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
              {submitting ? 'Creating…' : 'Create CAPA'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate('/capas')}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </PageShell>
  );
}
