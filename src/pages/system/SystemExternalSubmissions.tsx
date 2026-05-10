import { useEffect, useMemo, useState } from 'react';
import { Card, Input } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';
import { DocStatusBadge } from '@/components/cmmc/DocStatusBadge';

// External-submissions admin index. Lists every inbound external submission
// (today: Codex SSP) and lets a System Admin reject one with a reason. The
// status column is derived from the linked QMS Document.status — this page
// is a passive observer of the QMS workflow, with the one exception of the
// reject button which writes a terminal state.

type ExtStatus =
  | 'PENDING_REVIEW'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'QUALITY_RELEASED'
  | 'REJECTED';

interface SubmissionRow {
  id: string;
  externalSystem: string;
  externalSubmissionId: string;
  externalVersionNumber: number;
  documentNumber: string;
  documentType: string;
  payloadSha256: string;
  controlsMappedCount: number;
  submittedAt: string;
  // Top-level author from the inbound payload. Null when the submitting
  // system didn't carry an individual author block — falls back to "Trust Codex".
  submitter: { displayName: string; email: string } | null;
  rejectedAt: string | null;
  rejectedBy: { id: string; firstName: string; lastName: string } | null;
  rejectionReason: string | null;
  supersededBy: { id: string; externalVersionNumber: number } | null;
  qmsDocument: {
    id: string;
    documentId: string;
    status: string;
    versionMajor: number;
    versionMinor: number;
    title: string;
  } | null;
  status: ExtStatus;
}

const STATUS_FILTERS: Array<{ key: ExtStatus | 'ALL'; label: string }> = [
  { key: 'ALL', label: 'All' },
  { key: 'PENDING_REVIEW', label: 'Pending review' },
  { key: 'UNDER_REVIEW', label: 'Under review' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'QUALITY_RELEASED', label: 'Quality released' },
  { key: 'REJECTED', label: 'Rejected' },
];

export function SystemExternalSubmissions() {
  const { token } = useAuth();
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ExtStatus | 'ALL'>('ALL');
  const [rejecting, setRejecting] = useState<SubmissionRow | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ submissions: SubmissionRow[] }>(
        '/api/external-submissions',
        { token },
      );
      setRows(res.submissions);
    } catch (e) {
      const status = (e as { status?: number } | null)?.status;
      if (status === 403) setError("You don't have permission to view this page.");
      else setError('Failed to load submissions.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [token]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.documentNumber.toLowerCase().includes(q) ||
        r.externalSubmissionId.toLowerCase().includes(q) ||
        r.payloadSha256.toLowerCase().includes(q)
      );
    });
  }, [rows, search, statusFilter]);

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-100">External submissions</h1>
        <p className="mt-1 text-sm leading-relaxed text-gray-400">
          Authorized records submitted by external systems (today: Trust Codex SSP Doc Control).
          Each row stages an inbound submission for QMS&apos;s standard Reviewer → Approver → Quality
          Release flow. The submitting system signed its own attestation chain (visible on the
          detail page); QMS adds its own SoD chain on release. Rejections here are terminal — Codex
          notices the absence of a released doc on the next manifest pull.
        </p>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search document_number, submission_id, or sha256…"
          className="max-w-sm"
        />
        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatusFilter(f.key)}
              className={`rounded-md border px-2.5 py-1 text-xs transition ${
                statusFilter === f.key
                  ? 'border-primary/40 bg-primary/15 text-primary'
                  : 'border-border bg-card text-gray-300 hover:border-primary/40 hover:bg-secondary hover:text-gray-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-sm text-gray-400">
          <span className="font-medium text-gray-200">{filtered.length}</span>
          <span className="text-gray-500"> of </span>
          <span className="font-medium text-gray-200">{rows.length}</span>
          <span className="text-gray-500"> shown</span>
        </span>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-secondary">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Document #</th>
                <th scope="col" className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Source</th>
                <th scope="col" className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Version</th>
                <th scope="col" className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Status</th>
                <th scope="col" className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">QMS Doc</th>
                <th scope="col" className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Submitted by</th>
                <th scope="col" className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Controls</th>
                <th scope="col" className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Submitted</th>
                <th scope="col" className="w-32 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">
                    No submissions match.
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((r) => {
                  const canReject = r.status === 'PENDING_REVIEW' || r.status === 'UNDER_REVIEW';
                  return (
                    <tr key={r.id} className="transition-colors hover:bg-secondary">
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-200">
                        {r.documentNumber}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className="inline-flex items-center rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary ring-1 ring-inset ring-primary/20">
                          {r.externalSystem}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-300">
                        v{r.externalVersionNumber}
                        {r.supersededBy && (
                          <div className="mt-0.5 text-[10px] text-gray-500">
                            superseded by v{r.supersededBy.externalVersionNumber}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs">
                        <DocStatusBadge status={r.status} />
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {r.qmsDocument ? (
                          <a
                            href={`/documents/${r.qmsDocument.id}`}
                            className="font-mono text-primary hover:underline"
                          >
                            {r.qmsDocument.documentId} v{r.qmsDocument.versionMajor}.{r.qmsDocument.versionMinor}
                          </a>
                        ) : (
                          <span className="italic text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {r.submitter ? (
                          <div>
                            <div className="text-gray-200">{r.submitter.displayName}</div>
                            <div className="mt-0.5 text-[10px] text-gray-500">{r.submitter.email}</div>
                          </div>
                        ) : (
                          <span className="italic text-gray-500">Trust Codex</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-400">
                        {r.controlsMappedCount}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-400">
                        {new Date(r.submittedAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canReject && (
                          <button
                            type="button"
                            onClick={() => setRejecting(r)}
                            className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs text-destructive transition hover:bg-destructive/20"
                          >
                            Reject
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </Card>

      {rejecting && (
        <RejectModal
          submission={rejecting}
          token={token}
          onClose={() => setRejecting(null)}
          onRejected={() => {
            setRejecting(null);
            load();
          }}
        />
      )}
    </div>
  );
}

interface RejectModalProps {
  submission: SubmissionRow;
  token: string | null;
  onClose: () => void;
  onRejected: () => void;
}

function RejectModal({ submission, token, onClose, onRejected }: RejectModalProps) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (reason.trim().length < 5) {
      setErr('Reason must be at least 5 characters.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await apiRequest(`/api/external-submissions/${submission.id}/reject`, {
        token,
        method: 'POST',
        body: { reason: reason.trim() },
      });
      onRejected();
    } catch (e) {
      setErr((e as Error).message || 'Failed to reject.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-secondary p-6 shadow-depth-lg">
        <h2 className="text-lg font-semibold text-gray-100">Reject submission</h2>
        <p className="mt-2 text-sm text-gray-400">
          Reject submission <span className="font-mono text-gray-300">{submission.documentNumber}</span> v
          {submission.externalVersionNumber}? The linked QMS Document will be archived; the source
          system (Codex) will detect the absence of a released doc on its next manifest pull.
          This is terminal — to re-attempt, the source system must submit a new version.
        </p>
        <label className="mt-4 block text-xs uppercase tracking-wider text-gray-400">
          Reason (≥5 chars, recorded in audit log)
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          placeholder="Why is this being rejected? (e.g. payload_sha256 doesn't match what was reviewed in the SSP draft)"
        />
        {err && (
          <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {err}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-gray-300 transition hover:bg-secondary disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || reason.trim().length < 5}
            className="rounded-md bg-destructive/20 px-3 py-1.5 text-sm text-destructive ring-1 ring-inset ring-destructive/40 transition hover:bg-destructive/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Rejecting…' : 'Reject submission'}
          </button>
        </div>
      </div>
    </div>
  );
}
