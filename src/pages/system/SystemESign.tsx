import { useEffect, useState } from 'react';
import { Card, Button, Input } from '@/components/ui';
import { PageShell } from '@/pages/PageShell';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';

interface ESignConfig {
  id: string;
  requireForDocumentApproval: boolean;
  requireForCapaClosure: boolean;
  requireForTrainingSignOff: boolean;
}

export function SystemESign() {
  const { token } = useAuth();
  const [config, setConfig] = useState<ESignConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState('');
  const [form, setForm] = useState<Partial<ESignConfig>>({});

  useEffect(() => {
    if (!token) return;
    apiRequest<{ config: ESignConfig }>('/api/system/esign', { token })
      .then((data) => {
        setConfig(data.config);
        setForm(data.config);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const save = async () => {
    if (!token || !reason.trim()) return;
    setSaving(true);
    try {
      const updated = await apiRequest<{ config: ESignConfig }>('/api/system/esign', {
        token,
        method: 'PUT',
        body: { ...form, reason: reason.trim() },
      });
      setConfig(updated.config);
      setForm(updated.config);
      setReason('');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageShell title="E-Signature Settings"><p className="text-gray-400">Loading...</p></PageShell>;

  return (
    <PageShell title="E-Signature Settings" subtitle="Configure where e-signature is required (GxP / Part 11).">
      <Card padding="md">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.requireForDocumentApproval ?? true}
              onChange={(e) => setForm((f) => ({ ...f, requireForDocumentApproval: e.target.checked }))}
            />
            <span className="text-sm text-gray-300">Require e-signature for document approval</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.requireForCapaClosure ?? true}
              onChange={(e) => setForm((f) => ({ ...f, requireForCapaClosure: e.target.checked }))}
            />
            <span className="text-sm text-gray-300">Require e-signature for CAPA closure</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.requireForTrainingSignOff ?? true}
              onChange={(e) => setForm((f) => ({ ...f, requireForTrainingSignOff: e.target.checked }))}
            />
            <span className="text-sm text-gray-300">Require e-signature for training completion sign-off</span>
          </div>
          <Input label="Reason for change" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button onClick={save} disabled={saving || !reason.trim()}>{saving ? 'Saving...' : 'Save'}</Button>
        </div>
      </Card>
    </PageShell>
  );
}
