import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Badge, Button, Card, Input, Modal } from '@/components/ui';
import { GovernanceApprovalPanel } from '@/components/modules/compliance/GovernanceApprovalPanel';
import { PageShell } from '../PageShell';
import { useAuth } from '@/context/AuthContext';
import { apiRequest, apiUrl } from '@/lib/api';

type TabId = 'overview' | 'tasks' | 'files' | 'history' | 'links' | 'approvals';

interface UserRef {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface CapaTaskRef {
  id: string;
  taskType: string;
  status: string;
  stepNumber: number;
  title: string;
  description: string | null;
  dueDate: string | null;
  completedAt: string | null;
  completionNotes: string | null;
  requiresEsign: boolean;
  assignedTo: UserRef | null;
  completedBy: UserRef | null;
}

interface CapaHistoryRef {
  id: string;
  action: string;
  timestamp: string;
  details: Record<string, unknown> | null;
  user: UserRef;
}

interface CapaSignatureRef {
  id: string;
  signatureMeaning: string;
  signedAt: string;
  signer: UserRef;
}

interface FileLinkRef {
  id: string;
  purpose: string;
  fileAsset: {
    id: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    isDeleted: boolean;
  };
}

interface EntityLinkRef {
  id: string;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  linkType: string;
}

interface CapaDetailModel {
  id: string;
  capaId: string;
  title: string;
  description: string;
  status: string;
  initiator: UserRef | null;
  owner: UserRef | null;
  assignee: UserRef | null;
  severity: string | null;
  siteId: string | null;
  departmentId: string | null;
  rootCause: string | null;
  containmentSummary: string | null;
  correctiveSummary: string | null;
  preventiveSummary: string | null;
  effectivenessPlan: string | null;
  effectivenessResult: string | null;
  dueDate: string | null;
  closedAt: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  tasks: CapaTaskRef[];
  history: CapaHistoryRef[];
  signatures: CapaSignatureRef[];
  attachments: FileLinkRef[];
  links: EntityLinkRef[];
}

const statusVariant: Record<string, 'default' | 'info' | 'success' | 'warning' | 'neutral' | 'danger'> = {
  DRAFT: 'neutral', OPEN: 'info', CONTAINMENT: 'warning', INVESTIGATION: 'warning',
  RCA_COMPLETE: 'info', PLAN_APPROVAL: 'warning', IMPLEMENTATION: 'info',
  EFFECTIVENESS_CHECK: 'warning', PENDING_CLOSURE: 'warning', CLOSED: 'success', CANCELLED: 'danger', ARCHIVED: 'default',
};

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'tasks', label: 'Tasks / Actions' },
  { id: 'files', label: 'Evidence / Files' },
  { id: 'history', label: 'History' },
  { id: 'links', label: 'Links' },
  { id: 'approvals', label: 'Approvals / Closure' },
];

export function CAPADetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [capa, setCapa] = useState<CapaDetailModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const [reasonModal, setReasonModal] = useState<null | 'update' | 'transition'>(null);
  const [reason, setReason] = useState('');
  const [transitionTo, setTransitionTo] = useState('');
  const [esignModal, setEsignModal] = useState<null | 'approve-plan' | 'close'>(null);
  const [esignPassword, setEsignPassword] = useState('');
  const [submitError, setSubmitError] = useState('');

  const canUpdate = user?.permissions?.includes('capa:update');
  const canAssignTasks = user?.permissions?.includes('capa:assign_tasks');
  const canApprovePlan = user?.permissions?.includes('capa:approve_plan');
  const canClose = user?.permissions?.includes('capa:close');
  const canUpload = user?.permissions?.includes('file:upload');

  const fetchCapa = async () => {
    if (!token || !id) return;
    try {
      setLoading(true);
      setError('');
      const data = await apiRequest<{ capa: CapaDetailModel }>(`/api/capas/${id}`, { token });
      setCapa(data.capa);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load CAPA');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCapa();
  }, [token, id]);

  const handleTransition = async () => {
    if (!token || !id || !transitionTo || !reason.trim()) return;
    setSubmitError('');
    try {
      await apiRequest(`/api/capas/${id}/transition`, {
        token,
        method: 'POST',
        body: { toStatus: transitionTo, reason: reason.trim() },
      });
      setReasonModal(null);
      setReason('');
      setTransitionTo('');
      fetchCapa();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Transition failed');
    }
  };

  const handleApprovePlan = async () => {
    if (!token || !id) return;
    setSubmitError('');
    try {
      await apiRequest(`/api/capas/${id}/approve-plan`, {
        token,
        method: 'POST',
        body: { reason: 'Plan approved from UI', password: esignModal === 'approve-plan' ? esignPassword : undefined },
      });
      setEsignModal(null);
      setEsignPassword('');
      fetchCapa();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Approval failed');
    }
  };

  const handleClose = async () => {
    if (!token || !id) return;
    setSubmitError('');
    try {
      await apiRequest(`/api/capas/${id}/close`, {
        token,
        method: 'POST',
        body: { reason: 'Closed from UI', password: esignModal === 'close' ? esignPassword : undefined },
      });
      setEsignModal(null);
      setEsignPassword('');
      fetchCapa();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Closure failed');
    }
  };

  const downloadFile = async (fileId: string, filename: string) => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl(`/api/files/${fileId}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    }
  };

  if (loading || !capa) {
    return (
      <PageShell title="CAPA" subtitle="Loading…">
        <p className="text-gray-400">{loading ? 'Loading…' : error || 'Not found'}</p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={capa.capaId}
      subtitle={capa.title}
      backLink={{ label: 'Back to CAPA list', href: '/capas' }}
    >
      {error && <p className="mb-3 text-sm text-compliance-red">{error}</p>}

      <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-[var(--surface-border)] pb-3">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded px-3 py-1.5 text-sm font-medium transition ${activeTab === tab.id ? 'bg-[var(--mactech-blue)] text-white' : 'text-gray-400 hover:bg-[var(--surface-elevated)] hover:text-gray-200'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <Card>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusVariant[capa.status] || 'default'}>{capa.status.replace(/_/g, ' ')}</Badge>
              {capa.severity && <span className="text-sm text-gray-500">Severity: {capa.severity}</span>}
            </div>
            <p className="text-gray-300">{capa.description}</p>
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-gray-500">Owner</dt><dd>{capa.owner ? `${capa.owner.firstName} ${capa.owner.lastName}` : '—'}</dd></div>
              <div><dt className="text-gray-500">Initiator</dt><dd>{capa.initiator ? `${capa.initiator.firstName} ${capa.initiator.lastName}` : '—'}</dd></div>
              <div><dt className="text-gray-500">Due date</dt><dd>{capa.dueDate ? new Date(capa.dueDate).toLocaleDateString() : '—'}</dd></div>
              <div><dt className="text-gray-500">Closed</dt><dd>{capa.closedAt ? new Date(capa.closedAt).toLocaleDateString() : '—'}</dd></div>
            </dl>
            {capa.rootCause && <div><dt className="label-caps text-gray-500">Root cause</dt><dd className="mt-1 text-gray-300">{capa.rootCause}</dd></div>}
            {capa.correctiveSummary && <div><dt className="label-caps text-gray-500">Corrective summary</dt><dd className="mt-1 text-gray-300">{capa.correctiveSummary}</dd></div>}
            {capa.preventiveSummary && <div><dt className="label-caps text-gray-500">Preventive summary</dt><dd className="mt-1 text-gray-300">{capa.preventiveSummary}</dd></div>}
            {canUpdate && !['CLOSED', 'CANCELLED', 'ARCHIVED'].includes(capa.status) && (
              <div className="flex gap-2 pt-2">
                <Button variant="secondary" onClick={() => setReasonModal('transition')}>
                  Change status
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      {activeTab === 'overview' && id && (
        <GovernanceApprovalPanel
          approvalUrl={`/api/capas/${id}/governance-approval`}
          token={token}
          title="Governance Approval"
        />
      )}

      {activeTab === 'tasks' && (
        <Card>
          <ul className="space-y-3">
            {capa.tasks.length === 0 && <li className="text-gray-500">No tasks yet.</li>}
            {capa.tasks.map((t) => (
              <li key={t.id} className="rounded border border-[var(--surface-border)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{t.title}</span>
                  <Badge variant={t.status === 'COMPLETED' ? 'success' : 'warning'}>{t.status}</Badge>
                </div>
                <div className="mt-1 text-sm text-gray-500">{t.taskType.replace(/_/g, ' ')}</div>
                {t.assignedTo && <div className="text-sm">Assigned to: {t.assignedTo.firstName} {t.assignedTo.lastName}</div>}
                {t.completionNotes && <p className="mt-2 text-sm text-gray-400">{t.completionNotes}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {activeTab === 'files' && (
        <Card>
          <ul className="space-y-2">
            {capa.attachments?.length === 0 && <li className="text-gray-500">No attachments.</li>}
            {capa.attachments?.map((a) => (
              <li key={a.id} className="flex items-center justify-between rounded border border-[var(--surface-border)] p-2">
                <span>{a.fileAsset.filename}</span>
                {!a.fileAsset.isDeleted && (
                  <button
                    type="button"
                    onClick={() => downloadFile(a.fileAsset.id, a.fileAsset.filename)}
                    className="text-[var(--mactech-blue)] hover:underline"
                  >
                    Download
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {activeTab === 'history' && (
        <Card>
          <ul className="space-y-2">
            {capa.history.map((h) => (
              <li key={h.id} className="border-l-2 border-[var(--surface-border)] pl-3 py-1">
                <span className="font-medium">{h.action}</span>
                <span className="text-gray-500"> — {h.user.firstName} {h.user.lastName}</span>
                <span className="text-gray-500 text-sm"> {new Date(h.timestamp).toLocaleString()}</span>
                {h.details && <pre className="mt-1 text-xs text-gray-500 overflow-auto">{JSON.stringify(h.details)}</pre>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {activeTab === 'links' && (
        <Card>
          <ul className="space-y-2">
            {capa.links?.length === 0 && <li className="text-gray-500">No links.</li>}
            {capa.links?.map((l) => (
              <li key={l.id} className="text-sm">
                {l.sourceType} {l.sourceId} → {l.targetType} {l.targetId} ({l.linkType})
              </li>
            ))}
          </ul>
        </Card>
      )}

      {activeTab === 'approvals' && (
        <Card>
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-gray-200">Signatures</h3>
              <ul className="mt-2 space-y-1">
                {capa.signatures.length === 0 && <li className="text-gray-500">None yet.</li>}
                {capa.signatures.map((s) => (
                  <li key={s.id}>{s.signatureMeaning}: {s.signer.firstName} {s.signer.lastName} — {new Date(s.signedAt).toLocaleString()}</li>
                ))}
              </ul>
            </div>
            {capa.status === 'PLAN_APPROVAL' && canApprovePlan && (
              <Button onClick={() => setEsignModal('approve-plan')}>Approve plan</Button>
            )}
            {capa.status === 'PENDING_CLOSURE' && canClose && (
              <Button onClick={() => setEsignModal('close')}>Close CAPA</Button>
            )}
          </div>
        </Card>
      )}

      {/* Reason modal (transition) */}
      <Modal
        isOpen={reasonModal === 'transition'}
        onClose={() => { setReasonModal(null); setReason(''); setTransitionTo(''); setSubmitError(''); }}
        title="Reason for change"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReasonModal(null)}>Cancel</Button>
            <Button
              onClick={handleTransition}
              disabled={!reason.trim() || !transitionTo}
            >
              Apply
            </Button>
          </>
        }
      >
        {submitError && <p className="mb-2 text-sm text-compliance-red">{submitError}</p>}
        <div className="space-y-3">
          <div>
            <label className="label-caps block mb-1">New status</label>
            <select
              value={transitionTo}
              onChange={(e) => setTransitionTo(e.target.value)}
              className="w-full rounded border border-[var(--surface-border)] bg-[var(--surface-elevated)] px-3 py-2 text-gray-200"
            >
              <option value="">Select…</option>
              {capa && ['OPEN', 'CONTAINMENT', 'INVESTIGATION', 'RCA_COMPLETE', 'PLAN_APPROVAL', 'IMPLEMENTATION', 'EFFECTIVENESS_CHECK', 'PENDING_CLOSURE', 'CLOSED', 'CANCELLED'].map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-caps block mb-1">Reason for change *</label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Required for audit"
            />
          </div>
        </div>
      </Modal>

      {/* E-sign modals */}
      <Modal
        isOpen={esignModal === 'approve-plan'}
        onClose={() => { setEsignModal(null); setEsignPassword(''); setSubmitError(''); }}
        title="Approve plan (e-signature)"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEsignModal(null)}>Cancel</Button>
            <Button onClick={handleApprovePlan} disabled={!esignPassword}>
              Approve
            </Button>
          </>
        }
      >
        {submitError && <p className="mb-2 text-sm text-compliance-red">{submitError}</p>}
        <div>
          <label className="label-caps block mb-1">Password *</label>
          <Input
            type="password"
            value={esignPassword}
            onChange={(e) => setEsignPassword(e.target.value)}
            placeholder="Your password to sign"
          />
        </div>
      </Modal>

      <Modal
        isOpen={esignModal === 'close'}
        onClose={() => { setEsignModal(null); setEsignPassword(''); setSubmitError(''); }}
        title="Close CAPA (e-signature)"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEsignModal(null)}>Cancel</Button>
            <Button onClick={handleClose} disabled={!esignPassword}>
              Close CAPA
            </Button>
          </>
        }
      >
        {submitError && <p className="mb-2 text-sm text-compliance-red">{submitError}</p>}
        <div>
          <label className="label-caps block mb-1">Password *</label>
          <Input
            type="password"
            value={esignPassword}
            onChange={(e) => setEsignPassword(e.target.value)}
            placeholder="Your password to sign"
          />
        </div>
      </Modal>
    </PageShell>
  );
}
