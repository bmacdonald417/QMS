import { useEffect, useState } from 'react';
import { Card } from '@/components/ui';
import { apiRequest } from '@/lib/api';

export interface GovernanceApprovalData {
  hasArtifact: boolean;
  artifact: {
    id: string;
    entityType: string;
    entityId: string;
    recordVersion: string;
    qmsHash: string;
    signedAt: string;
    verifiedAt: string | null;
    verificationStatus: 'VERIFIED' | 'INVALID' | 'STALE' | null;
  } | null;
  verification: {
    status: 'VERIFIED' | 'INVALID' | 'STALE';
    verifiedAt?: string;
    reason?: string;
  } | null;
}

interface GovernanceApprovalPanelProps {
  approvalUrl: string;
  token: string | null;
  title?: string;
}

const statusVariant: Record<string, 'success' | 'danger' | 'warning'> = {
  VERIFIED: 'success',
  INVALID: 'danger',
  STALE: 'warning',
};

export function GovernanceApprovalPanel({ approvalUrl, token, title = 'Governance Approval' }: GovernanceApprovalPanelProps) {
  const [data, setData] = useState<GovernanceApprovalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !approvalUrl) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await apiRequest<GovernanceApprovalData>(approvalUrl, { token });
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'Failed to load governance approval');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, approvalUrl]);

  if (loading) {
    return (
      <Card padding="md">
        <h2 className="mb-2 text-lg text-white">{title}</h2>
        <p className="text-sm text-gray-500">Loading…</p>
      </Card>
    );
  }

  if (err) {
    return (
      <Card padding="md">
        <h2 className="mb-2 text-lg text-white">{title}</h2>
        <p className="text-sm text-compliance-red">{err}</p>
      </Card>
    );
  }

  if (!data?.hasArtifact || !data.artifact) {
    return (
      <Card padding="md">
        <h2 className="mb-2 text-lg text-white">{title}</h2>
        <p className="text-sm text-gray-500">No governance signature artifact on file. Governance can submit a signature for this record via the Governance API.</p>
      </Card>
    );
  }

  const status = data.verification?.status ?? data.artifact.verificationStatus ?? 'INVALID';
  const variant = statusVariant[status] ?? 'danger';

  return (
    <Card padding="md">
      <h2 className="mb-3 text-lg text-white">{title}</h2>
      <div className="space-y-3 rounded-lg border border-surface-border bg-surface-overlay p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-200">Status</span>
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${
            variant === 'success' ? 'bg-compliance-green/20 text-compliance-green' :
            variant === 'danger' ? 'bg-compliance-red/20 text-compliance-red' :
            'bg-amber-500/20 text-amber-400'
          }`}>
            {status}
          </span>
        </div>
        <dl className="space-y-2 text-xs">
          <div>
            <dt className="text-gray-500">Signed at</dt>
            <dd className="mt-0.5 text-gray-300">{new Date(data.artifact.signedAt).toLocaleString()}</dd>
          </div>
          {data.artifact.verifiedAt && (
            <div>
              <dt className="text-gray-500">Verified at</dt>
              <dd className="mt-0.5 text-gray-300">{new Date(data.artifact.verifiedAt).toLocaleString()}</dd>
            </div>
          )}
          <div>
            <dt className="text-gray-500">Record version (at sign)</dt>
            <dd className="mt-0.5 font-mono text-gray-300">{data.artifact.recordVersion}</dd>
          </div>
          <div>
            <dt className="text-gray-500">QMS hash (at sign)</dt>
            <dd className="mt-0.5 break-all font-mono text-gray-300">{data.artifact.qmsHash}</dd>
          </div>
          {data.verification?.reason && status !== 'VERIFIED' && (
            <div>
              <dt className="text-gray-500">Reason</dt>
              <dd className="mt-0.5 text-gray-400">{data.verification.reason}</dd>
            </div>
          )}
        </dl>
      </div>
    </Card>
  );
}
