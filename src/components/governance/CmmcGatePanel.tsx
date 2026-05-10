import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Modal } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';
import {
  REVIEW_QUESTIONS,
  type ReviewAnswerValue,
} from '@/lib/reviewQuestions';

/**
 * CMMC L2 compliance gate panel.
 *
 * Single source of truth for the document approval workflow on the
 * Document Detail page. Shows the gate state (signatures collected, SIA
 * recorded, release readiness) AND renders the action button for the
 * current next-required-action — Submit for Review, Sign as Reviewer,
 * Record SIA, Submit for Approval, Sign as Approver, Release Document.
 *
 * Replaced the four scattered Cards (Submit for Review, Review Decision,
 * Approval, Quality Release) that used to live in DocumentDetail.tsx.
 *
 * Each transition POSTs to the existing role-gated endpoint:
 *   /submit-review       → POST {reviewerIds, approverId, comments}
 *   /review              → POST {decision, comments, reviewResponses, password}
 *   /security-impact-analysis → POST {securityImpactAnalysis}
 *   /submit-for-approval → POST {} (manual IN_REVIEW → AWAITING_APPROVAL flip)
 *   /approve             → POST {password, comments}
 *   /quality-release     → POST {password, comments}
 *
 * Server enforces all role + SoD gates; this component only routes the
 * UI based on what the workflow-state response says is next.
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
  callerHasPendingReview: boolean;
  callerHasPendingApproval: boolean;
}

export interface CmmcGatePanelProps {
  documentId: string;
  // Re-fetch whenever the parent persists something that may change
  // workflow state (e.g. parent created a Revise version externally).
  refreshKey?: unknown;
  // Notify the parent so it can update local doc cache after a transition.
  onWorkflowState?: (state: CmmcWorkflowState | null) => void;
  // Called after any successful transition so the parent re-fetches the
  // document (status, signatures, history all change).
  onTransition?: () => void | Promise<void>;
}

interface UserRef {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  roleName?: string;
}

const STEP_LABELS: Record<string, string> = {
  submit_for_review: 'Submit for Review',
  reviewer_signature: 'Awaiting Reviewer Signature',
  security_impact_analysis: 'Security Impact Analysis (CM.L2-3.4.4)',
  submit_for_approval: 'Submit for Approval',
  approver_signature: 'Awaiting Approver Signature',
  release: 'Awaiting Quality Manager Release',
};

const APPROVER_ROLES = new Set(['Quality Manager', 'Manager', 'System Admin']);

export function CmmcGatePanel({
  documentId,
  refreshKey,
  onWorkflowState,
  onTransition,
}: CmmcGatePanelProps) {
  const { token, user } = useAuth();
  const [state, setState] = useState<CmmcWorkflowState | null>(null);
  const [loading, setLoading] = useState(true);

  // SIA inline form state (unchanged — already worked).
  const [siaText, setSiaText] = useState('');
  const [siaSubmitting, setSiaSubmitting] = useState(false);
  const [siaError, setSiaError] = useState<string | null>(null);
  const [siaSuccess, setSiaSuccess] = useState(false);

  // Modal toggles for each action.
  const [activeModal, setActiveModal] = useState<
    null | 'submit_for_review' | 'reviewer_signature' | 'submit_for_approval' | 'approver_signature' | 'release'
  >(null);

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

  const handleAfterTransition = useCallback(async () => {
    setActiveModal(null);
    await refresh();
    if (onTransition) await onTransition();
  }, [refresh, onTransition]);

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
      await apiRequest(`/api/documents/${documentId}/security-impact-analysis`, {
        token,
        method: 'POST',
        body: { securityImpactAnalysis: siaText },
      });
      setSiaText('');
      setSiaSuccess(true);
      await refresh();
      if (onTransition) await onTransition();
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
  const canRecordSIAByRole =
    APPROVER_ROLES.has(userRole) && userPerms.includes('document:review');
  const docNeedsSIA =
    !state.hasSIA &&
    ['DRAFT', 'IN_REVIEW', 'PENDING_APPROVAL', 'AWAITING_APPROVAL'].includes(state.status);

  const nextStep = state.nextRequiredAction;
  const stepLabel = nextStep ? STEP_LABELS[nextStep.step] ?? nextStep.step : null;
  const isEffective = state.status === 'EFFECTIVE';

  // Decide whether the current caller can take the next-required action.
  // Server endpoints still enforce; this is purely whether to render the
  // button (so users without the permission see the gate state but no
  // misleading button).
  const callerCanTakeNextAction = nextStep ? callerEligibleFor(nextStep.step, state, userRole, userPerms) : false;

  return (
    <>
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

        {/* SIA inline form — only when the doc actively needs SIA */}
        {docNeedsSIA && (
          <div className="mt-4 border-t border-border pt-4">
            <h3 className="mb-1 text-sm font-semibold text-white">
              Record Security Impact Analysis
            </h3>
            <p className="mb-3 text-xs text-gray-500">
              CMMC CM.L2-3.4.4. Capture which controls this change touches, what the
              security risks are, and how they are mitigated. Per AC.L2-3.1.4 / AU.L2-3.3.9
              the recorder must not be the document&apos;s author or any reviewer who has already
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
                {siaError && <p className="mt-2 text-sm text-destructive">{siaError}</p>}
                {siaSuccess && <p className="mt-2 text-sm text-emerald-400">SIA recorded.</p>}
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

        {/* Action button slot for everything except SIA (which has its own inline form above) */}
        {nextStep && nextStep.step !== 'security_impact_analysis' && (
          <div className="mt-4 border-t border-border pt-4">
            {callerCanTakeNextAction ? (
              <div className="flex justify-end">
                <Button onClick={() => setActiveModal(nextStep.step as typeof activeModal)}>
                  {actionButtonLabel(nextStep.step)}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                {actionGateExplanation(nextStep.step, state, userRole, userPerms)}
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Modals */}
      {activeModal === 'submit_for_review' && (
        <SubmitForReviewModal
          documentId={documentId}
          token={token}
          currentUserId={user?.id ?? ''}
          onClose={() => setActiveModal(null)}
          onSuccess={handleAfterTransition}
        />
      )}
      {activeModal === 'reviewer_signature' && (
        <ReviewerSignatureModal
          documentId={documentId}
          token={token}
          onClose={() => setActiveModal(null)}
          onSuccess={handleAfterTransition}
        />
      )}
      {activeModal === 'submit_for_approval' && (
        <SubmitForApprovalConfirm
          documentId={documentId}
          token={token}
          onClose={() => setActiveModal(null)}
          onSuccess={handleAfterTransition}
        />
      )}
      {activeModal === 'approver_signature' && (
        <PasswordSignModal
          mode="approve"
          documentId={documentId}
          token={token}
          onClose={() => setActiveModal(null)}
          onSuccess={handleAfterTransition}
        />
      )}
      {activeModal === 'release' && (
        <PasswordSignModal
          mode="release"
          documentId={documentId}
          token={token}
          onClose={() => setActiveModal(null)}
          onSuccess={handleAfterTransition}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function callerEligibleFor(
  step: string,
  state: CmmcWorkflowState,
  userRole: string,
  userPerms: string[],
): boolean {
  switch (step) {
    case 'submit_for_review':
      return userPerms.includes('document:create');
    case 'reviewer_signature':
      return state.callerHasPendingReview && userPerms.includes('document:review');
    case 'submit_for_approval':
      return userPerms.includes('document:review') && APPROVER_ROLES.has(userRole);
    case 'approver_signature':
      return (
        state.callerHasPendingApproval &&
        userPerms.includes('document:approve') &&
        APPROVER_ROLES.has(userRole)
      );
    case 'release':
      return state.releaseReadyForCaller;
    default:
      return false;
  }
}

function actionButtonLabel(step: string): string {
  switch (step) {
    case 'submit_for_review':
      return 'Submit for Review';
    case 'reviewer_signature':
      return 'Sign as Reviewer';
    case 'submit_for_approval':
      return 'Submit for Approval';
    case 'approver_signature':
      return 'Sign as Approver';
    case 'release':
      return 'Release Document';
    default:
      return 'Continue';
  }
}

function actionGateExplanation(
  step: string,
  state: CmmcWorkflowState,
  userRole: string,
  userPerms: string[],
): string {
  switch (step) {
    case 'submit_for_review':
      if (!userPerms.includes('document:create')) {
        return 'You do not have permission to submit documents. Required: document:create.';
      }
      return 'Waiting for an authorized user to submit for review.';
    case 'reviewer_signature':
      if (!state.callerHasPendingReview) {
        return 'You do not have a pending review assignment for this document.';
      }
      if (!userPerms.includes('document:review')) {
        return 'Your role does not include document:review.';
      }
      return 'Waiting for the assigned reviewer to sign.';
    case 'submit_for_approval':
      if (!APPROVER_ROLES.has(userRole)) {
        return 'Submit-for-approval requires Manager, Quality Manager, or System Admin role.';
      }
      return 'Waiting for an authorized user to submit for approval.';
    case 'approver_signature':
      if (!state.callerHasPendingApproval) {
        return 'You are not the assigned approver for this document.';
      }
      return 'Waiting for the assigned approver to sign.';
    case 'release':
      return state.releaseGateReason ?? 'Waiting for Quality Manager to release.';
    default:
      return 'Waiting for the next workflow step.';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SubmitForReviewModal — pick reviewers + approver, optional comments
// ─────────────────────────────────────────────────────────────────────────────

interface ModalChildProps {
  documentId: string;
  token: string | null;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}

function SubmitForReviewModal({
  documentId,
  token,
  currentUserId,
  onClose,
  onSuccess,
}: ModalChildProps & { currentUserId: string }) {
  const [users, setUsers] = useState<UserRef[]>([]);
  const [reviewerIds, setReviewerIds] = useState<string[]>([]);
  const [approverId, setApproverId] = useState('');
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    apiRequest<{ users: UserRef[] }>('/api/users', { token })
      .then((data) => setUsers(data.users))
      .catch(() => setError('Failed to load users'));
  }, [token]);

  const reviewers = useMemo(() => users.filter((u) => u.id !== currentUserId), [users, currentUserId]);
  const approvers = useMemo(
    () =>
      users.filter(
        (u) => u.id !== currentUserId && u.roleName && APPROVER_ROLES.has(u.roleName),
      ),
    [users, currentUserId],
  );

  async function submit() {
    if (!token) return;
    if (reviewerIds.length === 0) {
      setError('Select at least one reviewer.');
      return;
    }
    if (!approverId) {
      setError('Select an approver.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/api/documents/${documentId}/submit-review`, {
        token,
        method: 'POST',
        body: { reviewerIds, approverId, comments },
      });
      await onSuccess();
    } catch (err) {
      setError((err as Error).message || 'Failed to submit');
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Submit for Review"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit'}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-gray-400">
        Pick one or more reviewers and a designated approver. SoD: you cannot review or
        approve a document you submit. Reviewers will receive an assignment notification.
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="label-caps mb-1.5 block">Reviewers</label>
          <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-border bg-card p-3">
            {reviewers.length === 0 ? (
              <p className="text-xs text-gray-500">Loading users…</p>
            ) : (
              reviewers.map((r) => (
                <label key={r.id} className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={reviewerIds.includes(r.id)}
                    onChange={(e) =>
                      setReviewerIds((prev) =>
                        e.target.checked
                          ? [...new Set([...prev, r.id])]
                          : prev.filter((v) => v !== r.id),
                      )
                    }
                  />
                  {r.firstName} {r.lastName} {r.roleName ? `(${r.roleName})` : ''}
                </label>
              ))
            )}
          </div>
        </div>
        <div>
          <label className="label-caps mb-1.5 block">Approver</label>
          <select
            value={approverId}
            onChange={(e) => setApproverId(e.target.value)}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Select approver</option>
            {approvers.map((a) => (
              <option key={a.id} value={a.id}>
                {a.firstName} {a.lastName} {a.roleName ? `(${a.roleName})` : ''}
              </option>
            ))}
          </select>
          <label className="label-caps mb-1.5 mt-3 block">Comments (optional)</label>
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ReviewerSignatureModal — decision + questionnaire + password
// ─────────────────────────────────────────────────────────────────────────────

type ReviewDecision = 'APPROVED' | 'APPROVED_WITH_COMMENTS' | 'REQUIRES_REVISION';

function ReviewerSignatureModal({ documentId, token, onClose, onSuccess }: ModalChildProps) {
  const [decision, setDecision] = useState<ReviewDecision>('APPROVED');
  const [comments, setComments] = useState('');
  const [password, setPassword] = useState('');
  const [answers, setAnswers] = useState<Record<string, { value: ReviewAnswerValue; comments: string }>>(
    Object.fromEntries(REVIEW_QUESTIONS.map((q) => [q.id, { value: 'no' as ReviewAnswerValue, comments: '' }])),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-flip decision to REQUIRES_REVISION if any answer = "yes"
  const requiresRevisionFromAnswers = useMemo(
    () => Object.values(answers).some((a) => a.value === 'yes'),
    [answers],
  );
  useEffect(() => {
    if (requiresRevisionFromAnswers && decision !== 'REQUIRES_REVISION') {
      setDecision('REQUIRES_REVISION');
    }
  }, [requiresRevisionFromAnswers, decision]);

  async function submit() {
    if (!token) return;
    if (!password) {
      setError('Password is required for digital signature.');
      return;
    }
    if ((decision === 'APPROVED_WITH_COMMENTS' || decision === 'REQUIRES_REVISION') && !comments.trim()) {
      setError(`Comments are required for ${decision === 'REQUIRES_REVISION' ? 'Requires Revision' : 'Approve with Comments'}.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const reviewResponses = {
        answers: REVIEW_QUESTIONS.map((q) => ({
          questionId: q.id,
          value: answers[q.id]?.value ?? 'no',
          comments: answers[q.id]?.comments || undefined,
        })),
      };
      await apiRequest(`/api/documents/${documentId}/review`, {
        token,
        method: 'POST',
        body: { password, decision, comments, reviewResponses },
      });
      await onSuccess();
    } catch (err) {
      setError((err as Error).message || 'Failed to sign');
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Sign as Reviewer (Digital Signature)"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || !password}>
            {submitting ? 'Signing…' : 'Sign & Submit'}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-gray-400">
        Records a 21 CFR Part 11 digital signature. Password re-entry required. Any &quot;yes&quot; answer
        below auto-routes to Requires Revision and sends back to the author with comments.
      </p>

      <div className="mb-4 space-y-2">
        {REVIEW_QUESTIONS.map((q) => (
          <div key={q.id} className="rounded-md border border-border bg-card p-2">
            <p className="text-xs text-gray-300">{q.label}</p>
            <div className="mt-1 flex gap-3 text-xs">
              {(['yes', 'no'] as const).map((v) => (
                <label key={v} className="flex items-center gap-1 text-gray-400">
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    checked={answers[q.id]?.value === v}
                    onChange={() =>
                      setAnswers((prev) => ({
                        ...prev,
                        [q.id]: { ...(prev[q.id] ?? { comments: '' }), value: v },
                      }))
                    }
                  />
                  {v}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <label className="label-caps mb-1.5 block">Decision</label>
      <select
        value={decision}
        onChange={(e) => setDecision(e.target.value as ReviewDecision)}
        disabled={requiresRevisionFromAnswers}
        className="mb-3 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-gray-100"
      >
        <option value="APPROVED">Approve</option>
        <option value="APPROVED_WITH_COMMENTS">Approve with Comments</option>
        <option value="REQUIRES_REVISION">Requires Revision (send back)</option>
      </select>
      {requiresRevisionFromAnswers && (
        <p className="-mt-2 mb-3 text-xs text-amber-400">
          Auto-routed: one or more answers above indicate revision is required.
        </p>
      )}

      <label className="label-caps mb-1.5 block">
        Comments {(decision === 'APPROVED_WITH_COMMENTS' || decision === 'REQUIRES_REVISION') && (<span className="text-destructive">*</span>)}
      </label>
      <textarea
        value={comments}
        onChange={(e) => setComments(e.target.value)}
        rows={3}
        className="mb-3 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-gray-100"
      />

      <label className="label-caps mb-1.5 block">Password</label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-gray-100"
      />

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SubmitForApprovalConfirm — simple confirm + manual transition
// ─────────────────────────────────────────────────────────────────────────────

function SubmitForApprovalConfirm({ documentId, token, onClose, onSuccess }: ModalChildProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/api/documents/${documentId}/submit-for-approval`, {
        token,
        method: 'POST',
        body: {},
      });
      await onSuccess();
    } catch (err) {
      setError((err as Error).message || 'Failed to submit for approval');
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Submit for Approval"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit for Approval'}
          </Button>
        </>
      }
    >
      <p className="text-sm text-gray-400">
        All reviewer signatures and the Security Impact Analysis are recorded. Submitting for
        approval moves the document to <span className="font-mono text-gray-300">AWAITING_APPROVAL</span>{' '}
        so the assigned approver can sign.
      </p>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PasswordSignModal — used for /approve and /quality-release (same shape)
// ─────────────────────────────────────────────────────────────────────────────

function PasswordSignModal({
  mode,
  documentId,
  token,
  onClose,
  onSuccess,
}: ModalChildProps & { mode: 'approve' | 'release' }) {
  const [password, setPassword] = useState('');
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = mode === 'approve' ? 'Approve Document (Digital Signature)' : 'Quality Release (Digital Signature)';
  const endpoint = mode === 'approve' ? 'approve' : 'quality-release';

  async function submit() {
    if (!token) return;
    if (!password) {
      setError('Password is required for digital signature.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/api/documents/${documentId}/${endpoint}`, {
        token,
        method: 'POST',
        body: { password, comments },
      });
      await onSuccess();
    } catch (err) {
      setError((err as Error).message || `Failed to ${mode}`);
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || !password}>
            {submitting ? 'Signing…' : 'Sign & Submit'}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-gray-400">
        Records a 21 CFR Part 11 digital signature. Password re-entry required.
      </p>
      <label className="label-caps mb-1.5 block">Comments (optional)</label>
      <textarea
        value={comments}
        onChange={(e) => setComments(e.target.value)}
        rows={3}
        className="mb-3 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-gray-100"
      />
      <label className="label-caps mb-1.5 block">Password</label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-gray-100"
      />
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </Modal>
  );
}
