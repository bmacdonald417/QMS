import { useCallback, useEffect, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';

/**
 * CMMC L2 compliance gate panel.
 *
 * Drives the document-control approval workflow per
 * docs/specs/document-approval-cmmc-alignment.md. Surfaces:
 *   - the next-required-action descriptor from the lifecycle gate
 *   - whether SIA (Security Impact Analysis) is recorded
 *   - an SIA recording form when the doc needs one and the caller has
 *     the role/permission to record it (and is not the author/reviewer)
 *   - whether the doc is release-ready for the current caller, with
 *     the exact gate reason for the disabled-button tooltip
 *
 * The actual Quality Release button still lives in DocumentDetail.tsx;
 * this panel exposes `onWorkflowState` so the parent can disable that
 * button + display the gate reason as a tooltip.
 */

export interface CmmcWorkflowState {
  status: string;
  hasSIA: boolean;
  releasedAt: string | null;
  releasedByUserId: string | null;
  reviewerSignerCount: number;
  approverSignerCount: number;
  nextRequiredAction:
    | {
        step: string;
        message: string;
        requiredPermission?: string;
        requiredRoles?: string[];
      }
    | null;
  releaseReadyForCaller: boolean;
  releaseGateReason: string | null;
}

export interface CmmcGatePanelProps {
  documentId: string;
  // Re-fetch whenever the parent persists something that may change
  // workflow state (signature added, status flip, etc.).
  refreshKey?: unknown;
  // Notify the parent so it can disable its own release button + show
  // the gate reason on hover.
  onWorkflowState?: (state: CmmcWorkflowState | null) => void;
}

const STEP_LABELS: Record<string, string> = {
  submit_for_review: 'Submit for Review',
  reviewer_signature: 'Awaiting Reviewer Signature',
  security_impact_analysis: 'Security Impact Analysis (CM.L2-3.4.4)',
  submit_for_approval: 'Submit for Approval',
  approver_signature: 'Awaiting Approver Signature',
  release: 'Awaiting Quality Manager Release',
};

export function CmmcGatePanel({ documentId, refreshKey, onWorkflowState }: CmmcGatePanelProps) {
  const { token, user } = useAuth();
  const [state, setState] = useState<CmmcWorkflowState | null>(null);
  const [loading, setLoading] = useState(true);
  const [siaText, setSiaText] = useState('');
  const [siaSubmitting, setSiaSubmitting] = useState(false);
  const [siaError, setSiaError] = useState<string | null>(null);
  const [siaSuccess, setSiaSuccess] = useState(false);

  const refresh = useCallback(async () => {
    if (!token || !documentId) return;
    setLoading(true);
    try {
      const data = await apiRequest<CmmcWorkflowState>(
        `/api/documents/${documentId}/workflow-state`,
        { token },
      );
      setState(data);
      onWorkflowState?.(data);
    } catch {
      setState(null);
      onWorkflowState?.(null);
    } finally {
      setLoading(false);
    }
  }, [token, documentId, onWorkflowState]);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  const submitSIA = async () => {
    if (!token || !documentId) return;
    if (!siaText.trim()) {
      setSiaError('Security Impact Analysis text is required.');
      return;
    }
    setSiaSubmitting(true);
    setSiaError(null);
    setSiaSuccess(false);
    try {
      await apiRequest(
        `/api/documents/${documentId}/security-impact-analysis`,
        {
          token,
          method: 'POST',
          body: { securityImpactAnalysis: siaText },
        },
      );
      setSiaText('');
      setSiaSuccess(true);
      await refresh();
    } catch (err) {
      const e = err as { status?: number; data?: { error?: string }; message?: string };
      if (e?.status === 403) {
        setSiaError(
          'You do not have the document:review permission. Quality Manager / Manager / System Admin only.',
        );
      } else if (e?.data?.error) {
        setSiaError(e.data.error);
      } else if (e?.message) {
        setSiaError(e.message);
      } else {
        setSiaError('Failed to record Security Impact Analysis.');
      }
    } finally {
      setSiaSubmitting(false);
    }
  };

  if (loading && !state) {
    return (
      <Card padding="md">
        <h2 className="mb-2 text-lg text-white">CMMC Compliance Gate</h2>
        <p className="text-sm text-gray-500">Loading workflow state…</p>
      </Card>
    );
  }

  if (!state) return null;

  const userRole = user?.roleName ?? '';
  const userPerms = user?.permissions ?? [];
  // Mirror server gate: caller needs document:review AND must be a Quality
  // Manager / Manager / System Admin AND must not be the author.
  const canRecordSIAByRole =
    ['Quality Manager', 'Manager', 'System Admin'].includes(userRole) &&
    userPerms.includes('document:review');
  // The "in a review phase + needs SIA" predicate.
  const docNeedsSIA =
    !state.hasSIA &&
    ['DRAFT', 'IN_REVIEW', 'PENDING_APPROVAL', 'AWAITING_APPROVAL'].includes(state.status);

  const nextStep = state.nextRequiredAction;
  const stepLabel = nextStep ? STEP_LABELS[nextStep.step] ?? nextStep.step : null;

  const isEffective = state.status === 'EFFECTIVE';

  return (
    <Card padding="md" className="border-primary/40">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg text-white">CMMC Compliance Gate</h2>
        <span className="text-xs uppercase tracking-wider text-gray-500">
          NIST 800-171 Rev 2 · CMMC L2
        </span>
      </div>

      <dl className="grid grid-cols-1 gap-y-2 sm:grid-cols-2 sm:gap-x-6 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wider text-gray-500">Reviewer signatures</dt>
          <dd className="text-gray-200">
            {state.reviewerSignerCount}{' '}
            <span className="text-gray-500">
              {state.reviewerSignerCount >= 1 ? '· requirement met (CM.L2-3.4.3 [b])' : '· ≥1 required'}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-gray-500">Approver signatures</dt>
          <dd className="text-gray-200">
            {state.approverSignerCount}{' '}
            <span className="text-gray-500">
              {state.approverSignerCount >= 1
                ? '· authorized (CM.L2-3.4.3 [c])'
                : '· not yet approved'}
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-gray-500">
            Security Impact Analysis (CM.L2-3.4.4)
          </dt>
          <dd className={state.hasSIA ? 'text-emerald-400' : 'text-amber-400'}>
            {state.hasSIA ? '✓ recorded' : '✗ missing'}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-gray-500">
            Quality Release (CM.L2-3.4.5)
          </dt>
          <dd
            className={
              isEffective ? 'text-emerald-400' : state.releaseReadyForCaller ? 'text-primary' : 'text-gray-400'
            }
          >
            {isEffective
              ? state.releasedAt
                ? `✓ released ${new Date(state.releasedAt).toLocaleString()}`
                : '✓ released'
              : state.releaseReadyForCaller
                ? 'ready for your release'
                : 'gates not yet satisfied'}
          </dd>
        </div>
      </dl>

      {nextStep && (
        <div className="mt-4 rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
          <p className="text-xs uppercase tracking-wider text-primary">Next required action</p>
          <p className="mt-0.5 text-sm text-gray-100">
            <span className="font-semibold">{stepLabel}</span> — {nextStep.message}
          </p>
          {nextStep.requiredRoles?.length ? (
            <p className="mt-1 text-xs text-gray-500">
              Allowed roles: {nextStep.requiredRoles.join(', ')}
            </p>
          ) : null}
        </div>
      )}

      {!state.releaseReadyForCaller && !isEffective && state.releaseGateReason ? (
        <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2">
          <p className="text-xs uppercase tracking-wider text-amber-400">Release blocked</p>
          <p className="mt-0.5 text-sm text-gray-100">{state.releaseGateReason}</p>
        </div>
      ) : null}

      {docNeedsSIA && (
        <div className="mt-4 border-t border-border pt-4">
          <h3 className="mb-1 text-sm font-semibold text-white">
            Record Security Impact Analysis
          </h3>
          <p className="mb-3 text-xs text-gray-500">
            CMMC CM.L2-3.4.4. Capture which controls this change touches, what the
            security risks are, and how they are mitigated. Per AC.L2-3.1.4 / AU.L2-3.3.9
            the recorder must not be the document's author or any reviewer who has already
            signed.
          </p>
          {canRecordSIAByRole ? (
            <>
              <textarea
                value={siaText}
                onChange={(e) => {
                  setSiaText(e.target.value);
                  setSiaError(null);
                  setSiaSuccess(false);
                }}
                rows={5}
                placeholder="Controls touched: …
Risks identified: …
Mitigations: …"
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-primary focus:outline-none"
              />
              {siaError && (
                <p className="mt-2 text-sm text-destructive">{siaError}</p>
              )}
              {siaSuccess && (
                <p className="mt-2 text-sm text-emerald-400">SIA recorded.</p>
              )}
              <div className="mt-3 flex justify-end">
                <Button onClick={submitSIA} disabled={siaSubmitting}>
                  {siaSubmitting ? 'Recording…' : 'Record SIA'}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400">
              Your role does not include <code>document:review</code>. SIA must be
              recorded by a Manager, Quality Manager, or System Admin (and not by the
              document author or reviewers).
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
