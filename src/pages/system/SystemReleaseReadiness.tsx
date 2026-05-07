import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';

/**
 * Release-Readiness Audit
 *
 * Scans every CMMC-group document (POLICY / SOP / WORK_INSTRUCTION /
 * INCIDENT_RESPONSE_PLAN / CONFIGURATION_MANAGEMENT_PLAN / IT_SYSTEM /
 * SECURITY / AUDIT_ASSESSMENT) and reports release-readiness state +
 * the exact gates needed to push it into EFFECTIVE.
 *
 * Backed by GET /api/governance-package/release-readiness. The
 * "blockers" strings on each row are CMMC-cited and copy-pastable
 * directly into a remediation ticket.
 */

type ReadinessLabel = 'effective' | 'ready' | 'in_progress' | 'draft_blocked' | 'obsolete';

interface NextAction {
  step: string;
  message: string;
  requiredPermission?: string;
  requiredRoles?: string[];
}

interface ReadinessRow {
  id: string;
  documentId: string;
  title: string;
  documentType: string;
  version: string;
  status: string;
  author: string | null;
  authorId: string | null;
  effectiveDate: string | null;
  releasedAt: string | null;
  hasSIA: boolean;
  siaRecordedAt: string | null;
  reviewerSignerCount: number;
  approverSignerCount: number;
  nextRequiredAction: NextAction | null;
  blockers: string[];
  releaseReadyForCaller: boolean;
  releaseGateReason: string | null;
  readinessLabel: ReadinessLabel;
  updatedAt: string;
}

interface ReadinessSummary {
  total: number;
  effective: number;
  ready: number;
  in_progress: number;
  draft_blocked: number;
  obsolete: number;
  missing_sia: number;
  missing_reviewer: number;
  missing_approver: number;
}

type FilterKey = 'all' | 'needs_action' | ReadinessLabel | 'missing_sia' | 'missing_reviewer' | 'missing_approver';

const READINESS_BADGE: Record<ReadinessLabel, { label: string; tone: 'success' | 'warning' | 'info' | 'neutral' | 'danger' }> = {
  effective: { label: 'EFFECTIVE', tone: 'success' },
  ready: { label: 'Ready to Release', tone: 'info' },
  in_progress: { label: 'In Progress', tone: 'warning' },
  draft_blocked: { label: 'Draft — Action Required', tone: 'danger' },
  obsolete: { label: 'Obsolete', tone: 'neutral' },
};

const STEP_LABELS: Record<string, string> = {
  submit_for_review: 'Submit for Review',
  reviewer_signature: 'Awaiting Reviewer Signature',
  security_impact_analysis: 'Record Security Impact Analysis',
  submit_for_approval: 'Submit for Approval',
  approver_signature: 'Awaiting Approver Signature',
  release: 'Quality Manager Release',
};

export function SystemReleaseReadiness() {
  const { token } = useAuth();
  const [summary, setSummary] = useState<ReadinessSummary | null>(null);
  const [rows, setRows] = useState<ReadinessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('needs_action');
  const [search, setSearch] = useState('');

  const fetchReadiness = async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiRequest<{ summary: ReadinessSummary; rows: ReadinessRow[] }>(
        '/api/governance-package/release-readiness',
        { token },
      );
      setSummary(data.summary);
      setRows(data.rows);
    } catch (e) {
      const status = (e as { status?: number } | null)?.status;
      if (status === 403) setErr("You don't have permission to view this page.");
      else setErr('Failed to load release-readiness audit.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReadiness();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const filteredRows = useMemo(() => {
    let r = rows;
    if (filter === 'needs_action') {
      r = r.filter(
        (x) => x.readinessLabel !== 'effective' && x.readinessLabel !== 'obsolete',
      );
    } else if (filter === 'missing_sia') {
      r = r.filter(
        (x) =>
          !x.hasSIA &&
          x.readinessLabel !== 'effective' &&
          x.readinessLabel !== 'obsolete',
      );
    } else if (filter === 'missing_reviewer') {
      r = r.filter(
        (x) =>
          x.reviewerSignerCount === 0 &&
          x.readinessLabel !== 'effective' &&
          x.readinessLabel !== 'obsolete',
      );
    } else if (filter === 'missing_approver') {
      r = r.filter(
        (x) =>
          x.approverSignerCount === 0 &&
          x.readinessLabel !== 'effective' &&
          x.readinessLabel !== 'obsolete',
      );
    } else if (filter !== 'all') {
      r = r.filter((x) => x.readinessLabel === filter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      r = r.filter(
        (x) =>
          x.documentId.toLowerCase().includes(q) ||
          x.title.toLowerCase().includes(q) ||
          x.documentType.toLowerCase().includes(q),
      );
    }
    return r;
  }, [rows, filter, search]);

  const counts = summary
    ? {
        all: summary.total,
        needs_action: summary.total - summary.effective - summary.obsolete,
        effective: summary.effective,
        ready: summary.ready,
        in_progress: summary.in_progress,
        draft_blocked: summary.draft_blocked,
        obsolete: summary.obsolete,
        missing_sia: summary.missing_sia,
        missing_reviewer: summary.missing_reviewer,
        missing_approver: summary.missing_approver,
      }
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1>Release Readiness Audit</h1>
          <p className="mt-1 text-sm text-gray-500">
            CMMC-group documents (the same set that ships in the Vault Governance Package).
            Each row shows the exact gates that must be satisfied before the document can be
            released to Codex per CMMC L2 (NIST 800-171 Rev 2).
          </p>
        </div>
        <Button variant="secondary" onClick={fetchReadiness} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {err && (
        <Card padding="md">
          <p className="text-compliance-red">{err}</p>
        </Card>
      )}

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryTile label="CMMC-group total" value={summary.total} tone="neutral" />
          <SummaryTile label="Effective" value={summary.effective} tone="success" />
          <SummaryTile label="Ready to release" value={summary.ready} tone="info" />
          <SummaryTile label="In progress" value={summary.in_progress} tone="warning" />
          <SummaryTile label="Drafts (no progress)" value={summary.draft_blocked} tone="danger" />
          <SummaryTile label="Obsolete" value={summary.obsolete} tone="neutral" />
        </div>
      )}

      <Card padding="md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip active={filter === 'needs_action'} count={counts?.needs_action} onClick={() => setFilter('needs_action')}>
              Needs action
            </FilterChip>
            <FilterChip active={filter === 'all'} count={counts?.all} onClick={() => setFilter('all')}>
              All
            </FilterChip>
            <FilterChip active={filter === 'ready'} count={counts?.ready} onClick={() => setFilter('ready')}>
              Ready
            </FilterChip>
            <FilterChip active={filter === 'in_progress'} count={counts?.in_progress} onClick={() => setFilter('in_progress')}>
              In progress
            </FilterChip>
            <FilterChip active={filter === 'draft_blocked'} count={counts?.draft_blocked} onClick={() => setFilter('draft_blocked')}>
              Drafts
            </FilterChip>
            <FilterChip active={filter === 'effective'} count={counts?.effective} onClick={() => setFilter('effective')}>
              Effective
            </FilterChip>
            <span className="mx-2 hidden h-5 w-px bg-surface-border md:inline-block" />
            <FilterChip active={filter === 'missing_sia'} count={counts?.missing_sia} onClick={() => setFilter('missing_sia')}>
              Missing SIA
            </FilterChip>
            <FilterChip active={filter === 'missing_reviewer'} count={counts?.missing_reviewer} onClick={() => setFilter('missing_reviewer')}>
              Missing Reviewer sig
            </FilterChip>
            <FilterChip active={filter === 'missing_approver'} count={counts?.missing_approver} onClick={() => setFilter('missing_approver')}>
              Missing Approver sig
            </FilterChip>
          </div>
          <input
            type="search"
            placeholder="Search by ID, title, or type…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-mactech-blue focus:outline-none"
          />
        </div>
      </Card>

      {loading && rows.length === 0 ? (
        <p className="text-gray-400">Loading…</p>
      ) : filteredRows.length === 0 ? (
        <Card padding="md">
          <p className="text-gray-400">
            {filter === 'needs_action'
              ? 'No CMMC-group documents need action — every doc is EFFECTIVE or obsolete.'
              : 'No documents match this filter.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredRows.map((r) => (
            <ReadinessRowCard key={r.id} row={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'success' | 'warning' | 'info' | 'neutral' | 'danger';
}) {
  const toneClass = {
    success: 'text-emerald-400 border-emerald-500/30',
    warning: 'text-amber-400 border-amber-500/30',
    info: 'text-mactech-blue border-mactech-blue/30',
    neutral: 'text-gray-200 border-surface-border',
    danger: 'text-compliance-red border-compliance-red/30',
  }[tone];
  return (
    <div className={`rounded-lg border bg-surface-elevated p-3 ${toneClass}`}>
      <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function FilterChip({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count?: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition ${
        active
          ? 'border-mactech-blue bg-mactech-blue/15 text-mactech-blue'
          : 'border-surface-border bg-surface-elevated text-gray-400 hover:bg-surface-overlay hover:text-gray-200'
      }`}
    >
      {children}
      {typeof count === 'number' && (
        <span className={`ml-1.5 text-[10px] ${active ? 'text-mactech-blue' : 'text-gray-500'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

function ReadinessRowCard({ row }: { row: ReadinessRow }) {
  const badge = READINESS_BADGE[row.readinessLabel];
  const stepLabel = row.nextRequiredAction
    ? STEP_LABELS[row.nextRequiredAction.step] ?? row.nextRequiredAction.step
    : null;

  return (
    <Card padding="md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/documents/${row.id}`}
              className="font-medium text-mactech-blue hover:underline"
            >
              {row.documentId}
            </Link>
            <span className="text-gray-500">v{row.version}</span>
            <Badge variant={badge.tone}>{badge.label}</Badge>
            <span className="text-xs uppercase tracking-wider text-gray-500">
              {row.documentType.replace(/_/g, ' ').toLowerCase()}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-200">{row.title}</p>
          {row.author && (
            <p className="mt-0.5 text-xs text-gray-500">Author: {row.author}</p>
          )}
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-1">
          <Link to={`/documents/${row.id}`}>
            <Button variant="secondary" size="sm">
              Open Document
            </Button>
          </Link>
          {row.releasedAt && (
            <span className="text-xs text-gray-500">
              Released {new Date(row.releasedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      {row.readinessLabel !== 'effective' && row.readinessLabel !== 'obsolete' && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-3 text-xs sm:grid-cols-4">
            <Stat label="Reviewer sigs" value={row.reviewerSignerCount} ok={row.reviewerSignerCount >= 1} />
            <Stat label="Approver sigs" value={row.approverSignerCount} ok={row.approverSignerCount >= 1} />
            <Stat label="SIA recorded" value={row.hasSIA ? 'Yes' : 'No'} ok={row.hasSIA} />
            <Stat label="Status" value={row.status.replace(/_/g, ' ')} ok={row.status === 'APPROVED' || row.status === 'PENDING_QUALITY_RELEASE'} />
          </div>

          {stepLabel && (
            <div className="mt-3 rounded-md border border-mactech-blue/40 bg-mactech-blue/5 px-3 py-2">
              <p className="text-xs uppercase tracking-wider text-mactech-blue">
                Next required action
              </p>
              <p className="mt-0.5 text-sm text-gray-100">
                <span className="font-semibold">{stepLabel}</span>
                {row.nextRequiredAction?.message ? ` — ${row.nextRequiredAction.message}` : ''}
              </p>
              {row.nextRequiredAction?.requiredRoles?.length ? (
                <p className="mt-1 text-xs text-gray-500">
                  Allowed roles: {row.nextRequiredAction.requiredRoles.join(', ')}
                </p>
              ) : null}
            </div>
          )}

          {row.blockers.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-xs uppercase tracking-wider text-amber-400">Gates to satisfy</p>
              <ul className="space-y-1 text-sm text-gray-200">
                {row.blockers.map((b, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-0.5 select-none text-amber-400">•</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!row.releaseReadyForCaller && row.releaseGateReason && row.status === 'APPROVED' && (
            <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-gray-200">
              <span className="font-semibold text-amber-400">Release blocked for you:</span>{' '}
              {row.releaseGateReason}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function Stat({ label, value, ok }: { label: string; value: number | string; ok: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`mt-0.5 text-sm ${ok ? 'text-emerald-400' : 'text-amber-400'}`}>{value}</div>
    </div>
  );
}
