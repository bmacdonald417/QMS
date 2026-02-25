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
              min={8}
              max={128}
              value={form.passwordMinLength !== undefined && form.passwordMinLength !== null && !Number.isNaN(form.passwordMinLength) ? form.passwordMinLength : ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '') setForm((f) => ({ ...f, passwordMinLength: undefined }));
                else { const n = parseInt(v, 10); if (!Number.isNaN(n)) setForm((f) => ({ ...f, passwordMinLength: n })); }
              }}
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
              min={0}
              value={form.lockoutThreshold !== undefined && form.lockoutThreshold !== null && !Number.isNaN(form.lockoutThreshold) ? form.lockoutThreshold : ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '') setForm((f) => ({ ...f, lockoutThreshold: undefined }));
                else { const n = parseInt(v, 10); if (!Number.isNaN(n)) setForm((f) => ({ ...f, lockoutThreshold: n })); }
              }}
            />
            <Input
              label="Lockout duration (minutes)"
              type="number"
              min={0}
              value={form.lockoutDurationMinutes !== undefined && form.lockoutDurationMinutes !== null && !Number.isNaN(form.lockoutDurationMinutes) ? form.lockoutDurationMinutes : ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '') setForm((f) => ({ ...f, lockoutDurationMinutes: undefined }));
                else { const n = parseInt(v, 10); if (!Number.isNaN(n)) setForm((f) => ({ ...f, lockoutDurationMinutes: n })); }
              }}
            />
          </div>

          <h2 className="mt-6 text-lg text-white">Session</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Idle timeout (minutes)"
              type="number"
              min={0}
              value={form.sessionIdleTimeoutMinutes !== undefined && form.sessionIdleTimeoutMinutes !== null && !Number.isNaN(form.sessionIdleTimeoutMinutes) ? form.sessionIdleTimeoutMinutes : ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '') setForm((f) => ({ ...f, sessionIdleTimeoutMinutes: undefined }));
                else { const n = parseInt(v, 10); if (!Number.isNaN(n)) setForm((f) => ({ ...f, sessionIdleTimeoutMinutes: n })); }
              }}
            />
            <Input
              label="Max duration (minutes)"
              type="number"
              min={0}
              value={form.sessionMaxDurationMinutes !== undefined && form.sessionMaxDurationMinutes !== null && !Number.isNaN(form.sessionMaxDurationMinutes) ? form.sessionMaxDurationMinutes : ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v === '') setForm((f) => ({ ...f, sessionMaxDurationMinutes: undefined }));
                else { const n = parseInt(v, 10); if (!Number.isNaN(n)) setForm((f) => ({ ...f, sessionMaxDurationMinutes: n })); }
              }}
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
