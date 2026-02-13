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
    setSaving(true);
    try {
      const updated = await apiRequest<{ policy: RetentionPolicy }>('/api/system/retention', {
        token,
        method: 'PUT',
        body: { ...form, reason: reason.trim() },
      });
      setPolicy(updated.policy);
      setForm(updated.policy);
      setReason('');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageShell title="Retention & Backups"><p className="text-gray-400">Loading...</p></PageShell>;

  return (
    <PageShell title="Retention & Backups" subtitle="Retention policies. Changes are audited.">
      <Card padding="md">
        <div className="space-y-4">
          <Input
            label="Audit log retention (years)"
            type="number"
            value={form.auditLogRetentionYears ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, auditLogRetentionYears: parseInt(e.target.value, 10) }))}
          />
          <Input
            label="Document retention (years, optional)"
            type="number"
            value={form.documentRetentionYears ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, documentRetentionYears: e.target.value ? parseInt(e.target.value, 10) : null }))}
          />
          <Input
            label="Reason for change"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
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
