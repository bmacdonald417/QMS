import { useEffect, useState } from 'react';
import { Card, Button, Input } from '@/components/ui';
import { PageShell } from '@/pages/PageShell';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';

interface RetentionPolicy {
  id: string;
  auditLogRetentionYears: number;
  documentRetentionYears: number | null;
  trainingRetentionYears: number | null;
  capaRetentionYears: number | null;
}

export function SystemRetention() {
  const { token } = useAuth();
  const [policy, setPolicy] = useState<RetentionPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [form, setForm] = useState<Partial<RetentionPolicy>>({});

  useEffect(() => {
    if (!token) return;
    apiRequest<{ policy: RetentionPolicy }>('/api/system/retention', { token })
      .then((data) => {
        setPolicy(data.policy);
        setForm(data.policy);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const save = async () => {
    if (!token || !reason.trim()) return;
    setError('');
    setSaving(true);
    try {
      const body: Record<string, unknown> = { reason: reason.trim() };
      const auditYears = form.auditLogRetentionYears;
      if (typeof auditYears === 'number' && Number.isInteger(auditYears) && auditYears >= 1) {
        body.auditLogRetentionYears = auditYears;
      }
      const docYears = form.documentRetentionYears;
      if (docYears != null && typeof docYears === 'number' && Number.isInteger(docYears) && docYears >= 1) {
        body.documentRetentionYears = docYears;
      } else if (docYears == null) {
        body.documentRetentionYears = null;
      }
      const updated = await apiRequest<{ policy: RetentionPolicy }>('/api/system/retention', {
        token,
        method: 'PUT',
        body,
      });
      setPolicy(updated.policy);
      setForm(updated.policy);
      setReason('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save retention policy');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageShell title="Retention & Backups"><p className="text-gray-400">Loading...</p></PageShell>;

  return (
    <PageShell title="Retention & Backups" subtitle="Retention policies. Changes are audited.">
      <Card padding="md">
        <div className="space-y-4">
          {error && <p className="text-compliance-red text-sm">{error}</p>}
          <Input
            label="Audit log retention (years)"
            type="number"
            min={1}
            max={30}
            value={form.auditLogRetentionYears ?? ''}
            onChange={(e) => {
              const v = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
              setForm((f) => ({ ...f, auditLogRetentionYears: v !== undefined && !Number.isNaN(v) ? v : f.auditLogRetentionYears }));
            }}
          />
          <Input
            label="Document retention (years, optional)"
            type="number"
            min={1}
            max={50}
            value={form.documentRetentionYears ?? ''}
            onChange={(e) => {
              if (e.target.value === '') setForm((f) => ({ ...f, documentRetentionYears: null }));
              else {
                const v = parseInt(e.target.value, 10);
                if (!Number.isNaN(v)) setForm((f) => ({ ...f, documentRetentionYears: v }));
              }
            }}
          />
          <Input
            label="Reason for change"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Required to save"
          />
          <Button onClick={save} disabled={saving || !reason.trim()}>{saving ? 'Saving...' : 'Save'}</Button>
        </div>
      </Card>
      <Card padding="md" className="mt-6">
        <h2 className="text-lg text-white">Last backup</h2>
        <p className="mt-2 text-sm text-gray-500">Backup integration not configured. Configure your backup job and expose an endpoint to report last backup time.</p>
      </Card>
    </PageShell>
  );
}
