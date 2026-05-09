import { useState } from 'react';
import { Button, Modal } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';

interface ReleaseToCodexButtonProps {
  documentIds: string[];
  // Inline = single-doc usage on DocumentDetail. Compact = multi-select page button.
  variant?: 'inline' | 'compact';
  label?: string;
  disabled?: boolean;
  onResult?: (result: ReleaseResult) => void;
}

interface ReleaseResult {
  run_id: string;
  codex_push_status: 'stored' | 'already_present' | 'failed';
  codex_http_status?: number;
  codex_error?: string;
  controls_touched?: string[];
  doc_count?: number;
  warnings?: string[];
  attempts?: number;
}

export function ReleaseToCodexButton({
  documentIds,
  variant = 'inline',
  label,
  disabled,
  onResult,
}: ReleaseToCodexButtonProps) {
  const { token } = useAuth();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReleaseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const count = documentIds.length;
  const buttonLabel = label ?? (count === 1 ? 'Release to Codex' : `Release ${count} to Codex`);

  async function execute() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await apiRequest<ReleaseResult>(
        '/api/governance/push-to-codex',
        {
          token,
          method: 'POST',
          body: { documentIds },
        },
      );
      setResult(response);
      setConfirmOpen(false);
      onResult?.(response);
    } catch (e) {
      const status = (e as { status?: number; data?: { error?: string } } | null);
      if (status?.status === 403) {
        setError("You don't have permission to release documents to Codex.");
      } else if (status?.data?.error) {
        setError(status.data.error);
      } else {
        setError('Failed to release to Codex.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="primary"
        size={variant === 'compact' ? 'sm' : 'md'}
        onClick={() => setConfirmOpen(true)}
        disabled={disabled || busy || count === 0}
      >
        {busy ? 'Releasing…' : buttonLabel}
      </Button>

      <Modal
        isOpen={confirmOpen}
        onClose={() => !busy && setConfirmOpen(false)}
        title={count === 1 ? 'Release this document to Codex?' : `Release ${count} documents to Codex?`}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            This builds a signed governance manifest for{' '}
            {count === 1 ? 'this document' : `these ${count} documents`} and ships it to Trust
            Codex via the{' '}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">
              /api/integrations/qms-manifest/ingest
            </code>{' '}
            endpoint. Codex verifies the HMAC signature, persists the manifest immutably, and
            refreshes the OIS narrative for any governance-18 controls touched.
          </p>
          <p className="text-sm text-gray-600">
            Each document carries its full QMS signature chain (Approver / Reviewer) so codex
            can attest who authorized the release. Documents without an Approver signature
            ship with <span className="font-mono">released = false</span> (they appear in
            the manifest but don't count as authorized changes under CMMC 3.4.5).
          </p>
          <p className="text-xs text-gray-500">
            This action requires the <code className="rounded bg-gray-100 px-1 py-0.5">document:release</code>{' '}
            permission (Quality Manager or System Admin role). Other releasers can still
            create/review/approve documents in QMS without being able to release them to Codex.
          </p>
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={execute} disabled={busy}>
              {busy ? 'Releasing…' : 'Confirm release'}
            </Button>
          </div>
        </div>
      </Modal>

      {result && (
        <Modal
          isOpen={!!result}
          onClose={() => setResult(null)}
          title={result.codex_push_status === 'failed' ? 'Release failed' : 'Released to Codex'}
        >
          <div className="space-y-3">
            <dl className="grid grid-cols-1 gap-y-2 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">run_id</dt>
                <dd className="font-mono text-xs text-gray-900 break-all">{result.run_id}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">codex push status</dt>
                <dd className="font-mono text-sm">
                  <span
                    className={
                      result.codex_push_status === 'stored'
                        ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800'
                        : result.codex_push_status === 'already_present'
                          ? 'rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground'
                          : 'rounded-full bg-red-100 px-2 py-0.5 text-red-800'
                    }
                  >
                    {result.codex_push_status}
                  </span>
                  {result.attempts && result.attempts > 1 && (
                    <span className="ml-2 text-xs text-gray-500">({result.attempts} attempts)</span>
                  )}
                </dd>
              </div>
              {result.controls_touched && result.controls_touched.length > 0 && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">controls_touched</dt>
                  <dd className="text-xs text-gray-700">
                    {result.controls_touched.join(', ')}
                  </dd>
                </div>
              )}
              {result.codex_error && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">error</dt>
                  <dd className="text-sm text-red-800">{result.codex_error}</dd>
                </div>
              )}
              {result.warnings && result.warnings.length > 0 && (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">warnings</dt>
                  <dd className="space-y-0.5 text-xs text-amber-800">
                    {result.warnings.map((w, i) => (
                      <div key={i}>{w}</div>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
            <div className="flex justify-end pt-2">
              <Button variant="primary" onClick={() => setResult(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
