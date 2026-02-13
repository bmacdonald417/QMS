import { useEffect, useState } from 'react';
import { Card, Button, Input } from '@/components/ui';
import { PageShell } from '@/pages/PageShell';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';

interface Policy {
  id: string;
  passwordMinLength: number;
  passwordRequireUppercase: boolean;
  passwordRequireLowercase: boolean;
  passwordRequireNumber: boolean;
  passwordRequireSpecial: boolean;
  lockoutThreshold: number;
  lockoutDurationMinutes: number;
  sessionIdleTimeoutMinutes: number;
  sessionMaxDurationMinutes: number;
  mfaPolicy: string;
}

export function SystemSecurityPolicies() {
  const { token } = useAuth();
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState('');
  const [form, setForm] = useState<Partial<Policy>>({});

  useEffect(() => {
    if (!token) return;
    apiRequest<{ policy: Policy }>('/api/system/security-policies', { token })
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
      const updated = await apiRequest<{ policy: Policy }>('/api/system/security-policies', {
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

  if (loading) return <PageShell title="Security Policies"><p className="text-gray-400">Loading...</p></PageShell>;

  return (
    <PageShell title="Security Policies" subtitle="Password, session, and MFA settings. Changes are audited.">
      <Card padding="md">
        <div className="space-y-4">
          <h2 className="text-lg text-white">Password policy</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Minimum length"
              type="number"
              value={form.passwordMinLength ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, passwordMinLength: parseInt(e.target.value, 10) }))}
            />
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.passwordRequireUppercase ?? false}
                onChange={(e) => setForm((f) => ({ ...f, passwordRequireUppercase: e.target.checked }))}
              />
              <span className="text-sm text-gray-300">Require uppercase</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.passwordRequireLowercase ?? false}
                onChange={(e) => setForm((f) => ({ ...f, passwordRequireLowercase: e.target.checked }))}
              />
              <span className="text-sm text-gray-300">Require lowercase</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.passwordRequireNumber ?? false}
                onChange={(e) => setForm((f) => ({ ...f, passwordRequireNumber: e.target.checked }))}
              />
              <span className="text-sm text-gray-300">Require number</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.passwordRequireSpecial ?? false}
                onChange={(e) => setForm((f) => ({ ...f, passwordRequireSpecial: e.target.checked }))}
              />
              <span className="text-sm text-gray-300">Require special character</span>
            </div>
          </div>

          <h2 className="mt-6 text-lg text-white">Lockout</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Lockout threshold (attempts)"
              type="number"
              value={form.lockoutThreshold ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, lockoutThreshold: parseInt(e.target.value, 10) }))}
            />
            <Input
              label="Lockout duration (minutes)"
              type="number"
              value={form.lockoutDurationMinutes ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, lockoutDurationMinutes: parseInt(e.target.value, 10) }))}
            />
          </div>

          <h2 className="mt-6 text-lg text-white">Session</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Idle timeout (minutes)"
              type="number"
              value={form.sessionIdleTimeoutMinutes ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, sessionIdleTimeoutMinutes: parseInt(e.target.value, 10) }))}
            />
            <Input
              label="Max duration (minutes)"
              type="number"
              value={form.sessionMaxDurationMinutes ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, sessionMaxDurationMinutes: parseInt(e.target.value, 10) }))}
            />
          </div>

          <h2 className="mt-6 text-lg text-white">MFA</h2>
          <select
            value={form.mfaPolicy ?? 'OPTIONAL'}
            onChange={(e) => setForm((f) => ({ ...f, mfaPolicy: e.target.value }))}
            className="rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-gray-100"
          >
            <option value="OFF">Off</option>
            <option value="OPTIONAL">Optional</option>
            <option value="REQUIRED">Required</option>
          </select>

          <div className="mt-6">
            <Input
              label="Reason for change (required to save)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Document the reason for this change"
            />
            <Button className="mt-4" onClick={save} disabled={saving || !reason.trim()}>
              {saving ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        </div>
      </Card>
    </PageShell>
  );
}
