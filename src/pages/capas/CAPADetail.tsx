import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Button, Card, Input, Modal } from '@/components/ui';
import { GovernanceApprovalPanel } from '@/components/modules/compliance/GovernanceApprovalPanel';
import { PageShell } from '../PageShell';
import { useAuth } from '@/context/AuthContext';
import { apiRequest, apiUrl } from '@/lib/api';

type TabId = 'overview' | 'investigation' | 'tasks' | 'files' | 'history' | 'links' | 'approvals';

const FISHBONE_DEFAULT_CATS = ['Machine', 'Method', 'Material', 'Man', 'Measurement', 'Environment'];

const SOURCE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '—' },
  { value: 'INTERNAL', label: 'Internal' },
  { value: 'AUDIT_FINDING', label: 'Audit finding' },
  { value: 'NONCONFORMANCE', label: 'Non-conformance' },
  { value: 'COMPLAINT', label: 'Complaint' },
  { value: 'DEVIATION', label: 'Deviation' },
  { value: 'OTHER', label: 'Other' },
];

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
  signatureReason?: string | null;
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

interface FiveWhyRow {
  level: number;
  question: string;
  answer: string;
  evidenceRef: string;
  isRootCauseCandidate: boolean;
}

interface FishboneCauseRow {
  category: string;
  cause: string;
  evidenceRef: string;
}

interface RcaDraft {
  version: number;
  fiveWhys: FiveWhyRow[];
  fishbone: { categories: string[]; causes: FishboneCauseRow[] };
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
  rcaJson: unknown;
  sourceType: string | null;
  sourceReference: string | null;
  effectivenessWaived?: boolean;
  effectivenessWaiverJustification?: string | null;
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

function emptyRcaDraft(): RcaDraft {
  return {
    version: 1,
    fiveWhys: [],
    fishbone: { categories: [...FISHBONE_DEFAULT_CATS], causes: [] },
  };
}

function rcaFromApi(raw: unknown): RcaDraft {
  if (!raw || typeof raw !== 'object') return emptyRcaDraft();
  const o = raw as Record<string, unknown>;
  const wh = Array.isArray(o.fiveWhys)
    ? (o.fiveWhys as Record<string, unknown>[]).map((row, i) => ({
        level: typeof row.level === 'number' ? row.level : i + 1,
        question: typeof row.question === 'string' ? row.question : '',
        answer: typeof row.answer === 'string' ? row.answer : '',
        evidenceRef: typeof row.evidenceRef === 'string' ? row.evidenceRef : '',
        isRootCauseCandidate: Boolean(row.isRootCauseCandidate),
      }))
    : [];
  const fb = o.fishbone && typeof o.fishbone === 'object' ? (o.fishbone as Record<string, unknown>) : {};
  const categories = Array.isArray(fb.categories)
    ? (fb.categories as unknown[]).map((c) => String(c))
    : [...FISHBONE_DEFAULT_CATS];
  const causes = Array.isArray(fb.causes)
    ? (fb.causes as Record<string, unknown>[]).map((c) => ({
        category: typeof c.category === 'string' ? c.category : '',
        cause: typeof c.cause === 'string' ? c.cause : '',
        evidenceRef: typeof c.evidenceRef === 'string' ? c.evidenceRef : '',
      }))
    : [];
  return {
    version: typeof o.version === 'number' ? o.version : 1,
    fiveWhys: wh,
    fishbone: { categories: categories.length ? categories : [...FISHBONE_DEFAULT_CATS], causes },
  };
}

const statusVariant: Record<string, 'default' | 'info' | 'success' | 'warning' | 'neutral' | 'danger'> = {
  DRAFT: 'neutral', OPEN: 'info', CONTAINMENT: 'warning', INVESTIGATION: 'warning',
  RCA_COMPLETE: 'info', PLAN_APPROVAL: 'warning', IMPLEMENTATION: 'info',
  EFFECTIVENESS_CHECK: 'warning', PENDING_CLOSURE: 'warning', CLOSED: 'success', CANCELLED: 'danger', ARCHIVED: 'default',
};

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'investigation', label: 'Investigation (RCA)' },
  { id: 'tasks', label: 'Tasks / Actions' },
  { id: 'files', label: 'Evidence / Files' },
  { id: 'history', label: 'History' },
  { id: 'links', label: 'Links' },
  { id: 'approvals', label: 'Approvals / Closure' },
];

interface DocListItem {
  id: string;
  documentId: string;
  title: string;
}

export function CAPADetail() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const [capa, setCapa] = useState<CapaDetailModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const [reasonModal, setReasonModal] = useState<null | 'transition' | 'rca' | 'source'>(null);
  const [reason, setReason] = useState('');
  const [transitionTo, setTransitionTo] = useState('');
  const [rcaWaiverReason, setRcaWaiverReason] = useState('');
  const [esignModal, setEsignModal] = useState<null | 'approve-plan' | 'close'>(null);
  const [esignPassword, setEsignPassword] = useState('');
  const [approveSignReason, setApproveSignReason] = useState('');
  const [closeSignReason, setCloseSignReason] = useState('');
  const [closeEffectivenessWaived, setCloseEffectivenessWaived] = useState(false);
  const [closeEffectivenessJustification, setCloseEffectivenessJustification] = useState('');
  const [submitError, setSubmitError] = useState('');

  const [rcaDraft, setRcaDraft] = useState<RcaDraft>(emptyRcaDraft());
  const [sourceDraft, setSourceDraft] = useState({ sourceType: '', sourceReference: '' });

  const [docSearch, setDocSearch] = useState('');
  const [docResults, setDocResults] = useState<DocListItem[]>([]);
  const [docTitles, setDocTitles] = useState<Record<string, string>>({});
  const [newLinkType, setNewLinkType] = useState('REFERENCE');
  const [linkBusy, setLinkBusy] = useState(false);

  const canUpdate = user?.permissions?.includes('capa:update');
  const canViewDocs = user?.permissions?.includes('document:view');

  const canApprovePlan = user?.permissions?.includes('capa:approve_plan');
  const canClose = user?.permissions?.includes('capa:close');
  const canUpload = user?.permissions?.includes('file:upload');

  const fetchCapa = useCallback(async () => {
    if (!token || !id) return;
    try {
      setLoading(true);
      setError('');
      const data = await apiRequest<{ capa: CapaDetailModel }>(`/api/capas/${id}`, { token });
      setCapa(data.capa);
      setRcaDraft(rcaFromApi(data.capa.rcaJson));
      setSourceDraft({
        sourceType: data.capa.sourceType ?? '',
        sourceReference: data.capa.sourceReference ?? '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load CAPA');
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => {
    fetchCapa();
  }, [fetchCapa]);

  const documentLinkTargets = useMemo(() => {
    if (!capa?.links?.length) return [];
    return capa.links.filter((l) => {
      if (l.targetType === 'DOCUMENT' && l.sourceType === 'CAPA' && l.sourceId === capa.id) return true;
      if (l.sourceType === 'DOCUMENT' && l.targetType === 'CAPA' && l.targetId === capa.id) return true;
      return false;
    });
  }, [capa]);

  const documentIdsToLabel = useMemo(() => {
    const ids = new Set<string>();
    documentLinkTargets.forEach((l) => {
      if (l.targetType === 'DOCUMENT' && l.sourceType === 'CAPA') ids.add(l.targetId);
      if (l.sourceType === 'DOCUMENT' && l.targetType === 'CAPA') ids.add(l.sourceId);
    });
    return [...ids];
  }, [documentLinkTargets]);

  useEffect(() => {
    if (!token || !canViewDocs || documentIdsToLabel.length === 0) return;
    let cancelled = false;
    const ids = [...documentIdsToLabel];
    (async () => {
      const updates: Record<string, string> = {};
      for (const docId of ids) {
        if (cancelled) return;
        try {
          const d = await apiRequest<{ document: { documentId: string; title: string } }>(`/api/documents/${docId}`, { token });
          updates[docId] = `${d.document.documentId}: ${d.document.title}`;
        } catch {
          updates[docId] = docId;
        }
      }
      if (!cancelled) {
        setDocTitles((prev) => {
          const n = { ...prev };
          let changed = false;
          for (const [k, v] of Object.entries(updates)) {
            if (n[k] !== v) {
              n[k] = v;
              changed = true;
            }
          }
          return changed ? n : prev;
        });
      }
    })();
    return () => { cancelled = true; };
  }, [token, canViewDocs, documentIdsToLabel.join(',')]);

  useEffect(() => {
    if (!token || !canViewDocs || docSearch.trim().length < 2) {
      setDocResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const data = await apiRequest<{ documents: DocListItem[] }>(
          `/api/documents?search=${encodeURIComponent(docSearch.trim())}`,
          { token },
        );
        setDocResults((data.documents || []).slice(0, 20));
      } catch {
        setDocResults([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [docSearch, token, canViewDocs]);

  const handleTransition = async () => {
    if (!token || !id || !transitionTo || !reason.trim()) return;
    setSubmitError('');
    try {
      const body: Record<string, unknown> = { toStatus: transitionTo, reason: reason.trim() };
      if (capa?.status === 'INVESTIGATION' && transitionTo === 'RCA_COMPLETE' && rcaWaiverReason.trim()) {
        body.rcaWaiverReason = rcaWaiverReason.trim();
      }
      await apiRequest(`/api/capas/${id}/transition`, {
        token,
        method: 'POST',
        body,
      });
      setReasonModal(null);
      setReason('');
      setTransitionTo('');
      setRcaWaiverReason('');
      fetchCapa();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Transition failed');
    }
  };

  const saveRca = async () => {
    if (!token || !id || !reason.trim()) return;
    setSubmitError('');
    try {
      await apiRequest(`/api/capas/${id}`, {
        token,
        method: 'PUT',
        body: {
          reason: reason.trim(),
          rcaJson: {
            version: rcaDraft.version,
            fiveWhys: rcaDraft.fiveWhys.map((w) => ({
              level: w.level,
              question: w.question || null,
              answer: w.answer,
              evidenceRef: w.evidenceRef || null,
              isRootCauseCandidate: w.isRootCauseCandidate,
            })),
            fishbone: {
              categories: rcaDraft.fishbone.categories,
              causes: rcaDraft.fishbone.causes.map((c) => ({
                category: c.category,
                cause: c.cause,
                evidenceRef: c.evidenceRef || null,
              })),
            },
          },
        },
      });
      setReasonModal(null);
      setReason('');
      fetchCapa();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const saveSource = async () => {
    if (!token || !id || !reason.trim()) return;
    setSubmitError('');
    try {
      await apiRequest(`/api/capas/${id}`, {
        token,
        method: 'PUT',
        body: {
          reason: reason.trim(),
          sourceType: sourceDraft.sourceType || null,
          sourceReference: sourceDraft.sourceReference.trim() || null,
        },
      });
      setReasonModal(null);
      setReason('');
      fetchCapa();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const addDocumentLink = async (targetId: string) => {
    if (!token || !id || !canUpdate) return;
    setLinkBusy(true);
    try {
      await apiRequest(`/api/capas/${id}/link`, {
        token,
        method: 'POST',
        body: { targetType: 'DOCUMENT', targetId, linkType: newLinkType.trim() || 'REFERENCE' },
      });
      fetchCapa();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Link failed');
    } finally {
      setLinkBusy(false);
    }
  };

  const handleApprovePlan = async () => {
    if (!token || !id || !approveSignReason.trim()) return;
    setSubmitError('');
    try {
      await apiRequest(`/api/capas/${id}/approve-plan`, {
        token,
        method: 'POST',
        body: {
          reason: approveSignReason.trim(),
          password: esignPassword || undefined,
        },
      });
      setEsignModal(null);
      setEsignPassword('');
      setApproveSignReason('');
      fetchCapa();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Approval failed');
    }
  };

  const handleClose = async () => {
    if (!token || !id || !closeSignReason.trim()) return;
    if (closeEffectivenessWaived && !closeEffectivenessJustification.trim()) {
      setSubmitError('Effectiveness waiver requires justification');
      return;
    }
    setSubmitError('');
    try {
      await apiRequest(`/api/capas/${id}/close`, {
        token,
        method: 'POST',
        body: {
          reason: closeSignReason.trim(),
          password: esignPassword || undefined,
          effectivenessWaived: closeEffectivenessWaived,
          effectivenessJustification: closeEffectivenessWaived ? closeEffectivenessJustification.trim() : undefined,
        },
      });
      setEsignModal(null);
      setEsignPassword('');
      setCloseSignReason('');
      setCloseEffectivenessWaived(false);
      setCloseEffectivenessJustification('');
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

  const addFiveWhy = () => {
    setRcaDraft((d) => ({
      ...d,
      fiveWhys: [...d.fiveWhys, { level: d.fiveWhys.length + 1, question: '', answer: '', evidenceRef: '', isRootCauseCandidate: false }],
    }));
  };

  const addFishboneCause = () => {
    setRcaDraft((d) => ({
      ...d,
      fishbone: {
        ...d.fishbone,
        causes: [...d.fishbone.causes, { category: d.fishbone.categories[0] || 'Method', cause: '', evidenceRef: '' }],
      },
    }));
  };

  if (loading || !capa) {
    return (
      <PageShell title="CAPA" subtitle="Loading…">
        <p className="text-gray-400">{loading ? 'Loading…' : error || 'Not found'}</p>
      </PageShell>
    );
  }

  const showRcaWaiver = capa.status === 'INVESTIGATION' && transitionTo === 'RCA_COMPLETE';

  return (
    <PageShell
      title={capa.capaId}
      subtitle={capa.title}
      backLink={{ label: 'Back to CAPA list', href: '/capas' }}
    >
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-border pb-3">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded px-3 py-1.5 text-sm font-medium transition ${activeTab === tab.id ? 'bg-primary text-white' : 'text-gray-400 hover:bg-card hover:text-gray-200'}`}
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
              <div>
                <dt className="text-gray-500">Source type</dt>
                <dd>{capa.sourceType?.replace(/_/g, ' ') ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Source reference</dt>
                <dd className="break-all">{capa.sourceReference ?? '—'}</dd>
              </div>
            </dl>
            {capa.rootCause && <div><dt className="label-caps text-gray-500">Root cause</dt><dd className="mt-1 text-gray-300">{capa.rootCause}</dd></div>}
            {capa.correctiveSummary && <div><dt className="label-caps text-gray-500">Corrective summary</dt><dd className="mt-1 text-gray-300">{capa.correctiveSummary}</dd></div>}
            {capa.preventiveSummary && <div><dt className="label-caps text-gray-500">Preventive summary</dt><dd className="mt-1 text-gray-300">{capa.preventiveSummary}</dd></div>}
            {capa.effectivenessWaived && (
              <p className="text-sm text-amber-200">
                Effectiveness check waived
                {capa.effectivenessWaiverJustification ? `: ${capa.effectivenessWaiverJustification}` : ''}
              </p>
            )}
            {canUpdate && !['CLOSED', 'CANCELLED', 'ARCHIVED'].includes(capa.status) && (
              <div className="flex flex-wrap gap-2 pt-2">
                <Button variant="secondary" onClick={() => { setReasonModal('transition'); setSubmitError(''); }}>
                  Change status
                </Button>
                <Button variant="secondary" onClick={() => { setReasonModal('source'); setSubmitError(''); setReason(''); }}>
                  Edit source / reference
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

      {activeTab === 'investigation' && (
        <div className="space-y-4">
          <Card>
            <h3 className="font-medium text-gray-200 mb-3">5 Whys</h3>
            <ul className="space-y-3">
              {rcaDraft.fiveWhys.length === 0 && <li className="text-gray-500 text-sm">No steps yet. Add a row for each &quot;why&quot;.</li>}
              {rcaDraft.fiveWhys.map((row, idx) => (
                <li key={idx} className="rounded border border-border p-3 space-y-2">
                  <div className="text-xs text-gray-500">Level {row.level}</div>
                  <Input
                    label="Question (optional)"
                    value={row.question}
                    onChange={(e) => {
                      const next = [...rcaDraft.fiveWhys];
                      next[idx] = { ...row, question: e.target.value };
                      setRcaDraft({ ...rcaDraft, fiveWhys: next });
                    }}
                  />
                  <div>
                    <label className="label-caps block mb-1">Answer *</label>
                    <textarea
                      value={row.answer}
                      onChange={(e) => {
                        const next = [...rcaDraft.fiveWhys];
                        next[idx] = { ...row, answer: e.target.value };
                        setRcaDraft({ ...rcaDraft, fiveWhys: next });
                      }}
                      rows={2}
                      className="w-full rounded border border-border bg-card px-3 py-2 text-gray-200"
                    />
                  </div>
                  <Input
                    label="Evidence reference (optional)"
                    value={row.evidenceRef}
                    onChange={(e) => {
                      const next = [...rcaDraft.fiveWhys];
                      next[idx] = { ...row, evidenceRef: e.target.value };
                      setRcaDraft({ ...rcaDraft, fiveWhys: next });
                    }}
                  />
                  <label className="flex items-center gap-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={row.isRootCauseCandidate}
                      onChange={(e) => {
                        const next = [...rcaDraft.fiveWhys];
                        next[idx] = { ...row, isRootCauseCandidate: e.target.checked };
                        setRcaDraft({ ...rcaDraft, fiveWhys: next });
                      }}
                    />
                    Mark as root cause candidate
                  </label>
                </li>
              ))}
            </ul>
            {canUpdate && !['CLOSED', 'CANCELLED', 'ARCHIVED'].includes(capa.status) && (
              <div className="flex gap-2 mt-3">
                <Button type="button" variant="secondary" onClick={addFiveWhy}>Add why</Button>
              </div>
            )}
          </Card>

          <Card>
            <h3 className="font-medium text-gray-200 mb-3">Fishbone (Ishikawa)</h3>
            <p className="text-sm text-gray-500 mb-3">Categories: {rcaDraft.fishbone.categories.join(', ')}</p>
            <ul className="space-y-3">
              {rcaDraft.fishbone.causes.length === 0 && <li className="text-gray-500 text-sm">No causes yet.</li>}
              {rcaDraft.fishbone.causes.map((row, idx) => (
                <li key={idx} className="rounded border border-border p-3 space-y-2">
                  <div>
                    <label className="label-caps block mb-1">Category</label>
                    <select
                      value={row.category}
                      onChange={(e) => {
                        const next = [...rcaDraft.fishbone.causes];
                        next[idx] = { ...row, category: e.target.value };
                        setRcaDraft({ ...rcaDraft, fishbone: { ...rcaDraft.fishbone, causes: next } });
                      }}
                      className="w-full rounded border border-border bg-card px-3 py-2 text-gray-200"
                    >
                      {rcaDraft.fishbone.categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label-caps block mb-1">Cause *</label>
                    <textarea
                      value={row.cause}
                      onChange={(e) => {
                        const next = [...rcaDraft.fishbone.causes];
                        next[idx] = { ...row, cause: e.target.value };
                        setRcaDraft({ ...rcaDraft, fishbone: { ...rcaDraft.fishbone, causes: next } });
                      }}
                      rows={2}
                      className="w-full rounded border border-border bg-card px-3 py-2 text-gray-200"
                    />
                  </div>
                  <Input
                    label="Evidence ref (optional)"
                    value={row.evidenceRef}
                    onChange={(e) => {
                      const next = [...rcaDraft.fishbone.causes];
                      next[idx] = { ...row, evidenceRef: e.target.value };
                      setRcaDraft({ ...rcaDraft, fishbone: { ...rcaDraft.fishbone, causes: next } });
                    }}
                  />
                </li>
              ))}
            </ul>
            {canUpdate && !['CLOSED', 'CANCELLED', 'ARCHIVED'].includes(capa.status) && (
              <Button type="button" variant="secondary" className="mt-3" onClick={addFishboneCause}>Add cause</Button>
            )}
          </Card>

          {canUpdate && !['CLOSED', 'CANCELLED', 'ARCHIVED'].includes(capa.status) && (
            <Button onClick={() => { setReasonModal('rca'); setReason(''); setSubmitError(''); }}>
              Save investigation (RCA)
            </Button>
          )}

          <Card>
            <h3 className="font-medium text-gray-200 mb-2">Linked documents</h3>
            <p className="text-sm text-gray-500 mb-3">Add controlled document links for this CAPA. Use the Links tab for full list.</p>
            {canViewDocs && canUpdate && (
              <div className="space-y-2 mb-4">
                <Input
                  label="Search documents"
                  value={docSearch}
                  onChange={(e) => setDocSearch(e.target.value)}
                  placeholder="Type at least 2 characters"
                />
                <div>
                  <label className="label-caps block mb-1">Link type</label>
                  <Input value={newLinkType} onChange={(e) => setNewLinkType(e.target.value)} placeholder="e.g. AFFECTED_SOP, REVISED_SOP, REFERENCE" />
                </div>
                <ul className="max-h-40 overflow-auto border border-border rounded text-sm">
                  {docResults.map((d) => (
                    <li key={d.id} className="flex justify-between items-center px-2 py-1 border-b border-border">
                      <span className="truncate">{d.documentId}: {d.title}</span>
                      <Button type="button" variant="secondary" disabled={linkBusy} onClick={() => addDocumentLink(d.id)}>Link</Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>
      )}

      {activeTab === 'tasks' && (
        <Card>
          <ul className="space-y-3">
            {capa.tasks.length === 0 && <li className="text-gray-500">No tasks yet.</li>}
            {capa.tasks.map((t) => (
              <li key={t.id} className="rounded border border-border p-3">
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
              <li key={a.id} className="flex items-center justify-between rounded border border-border p-2">
                <span>{a.fileAsset.filename}</span>
                {!a.fileAsset.isDeleted && (
                  <button
                    type="button"
                    onClick={() => downloadFile(a.fileAsset.id, a.fileAsset.filename)}
                    className="text-primary hover:underline"
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
              <li key={h.id} className="border-l-2 border-border pl-3 py-1">
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
            {capa.links?.map((l) => {
              const isOutgoingDoc = l.sourceType === 'CAPA' && l.sourceId === capa.id && l.targetType === 'DOCUMENT';
              const isIncomingDoc = l.targetType === 'CAPA' && l.targetId === capa.id && l.sourceType === 'DOCUMENT';
              const docId = isOutgoingDoc ? l.targetId : isIncomingDoc ? l.sourceId : null;
              const label = docId && docTitles[docId] ? docTitles[docId] : `${l.targetType} ${l.targetId}`;
              return (
                <li key={l.id} className="flex flex-wrap items-center gap-2 text-sm rounded border border-border p-2">
                  <span className="text-gray-500">{l.linkType}</span>
                  {docId && canViewDocs ? (
                    <Link to={`/documents/${docId}`} className="text-primary hover:underline">{label}</Link>
                  ) : (
                    <span>{l.sourceType} → {l.targetType} ({l.linkType})</span>
                  )}
                  {l.targetType === 'CAPA' && l.targetId !== capa.id && (
                    <Link to={`/capas/${l.targetId}`} className="text-primary hover:underline">CAPA record</Link>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {activeTab === 'approvals' && (
        <Card>
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-gray-200">Signatures</h3>
              <ul className="mt-2 space-y-2">
                {capa.signatures.length === 0 && <li className="text-gray-500">None yet.</li>}
                {capa.signatures.map((s) => (
                  <li key={s.id} className="text-sm border-l-2 border-border pl-2">
                    <div className="font-medium">{s.signatureMeaning.replace(/_/g, ' ')}: {s.signer.firstName} {s.signer.lastName}</div>
                    <div className="text-gray-500">{new Date(s.signedAt).toLocaleString()}</div>
                    {s.signatureReason && <p className="text-gray-400 mt-1">{s.signatureReason}</p>}
                  </li>
                ))}
              </ul>
            </div>
            {capa.status === 'PLAN_APPROVAL' && canApprovePlan && (
              <Button onClick={() => { setEsignModal('approve-plan'); setSubmitError(''); setApproveSignReason(''); setEsignPassword(''); }}>
                Approve plan
              </Button>
            )}
            {capa.status === 'PENDING_CLOSURE' && canClose && (
              <Button onClick={() => {
                setEsignModal('close');
                setSubmitError('');
                setCloseSignReason('');
                setEsignPassword('');
                setCloseEffectivenessWaived(false);
                setCloseEffectivenessJustification('');
              }}
              >
                Close CAPA
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Transition modal */}
      <Modal
        isOpen={reasonModal === 'transition'}
        onClose={() => { setReasonModal(null); setReason(''); setTransitionTo(''); setRcaWaiverReason(''); setSubmitError(''); }}
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
        {submitError && <p className="mb-2 text-sm text-destructive">{submitError}</p>}
        <div className="space-y-3">
          <div>
            <label className="label-caps block mb-1">New status</label>
            <select
              value={transitionTo}
              onChange={(e) => setTransitionTo(e.target.value)}
              className="w-full rounded border border-border bg-card px-3 py-2 text-gray-200"
            >
              <option value="">Select…</option>
              {['OPEN', 'CONTAINMENT', 'INVESTIGATION', 'RCA_COMPLETE', 'PLAN_APPROVAL', 'IMPLEMENTATION', 'EFFECTIVENESS_CHECK', 'PENDING_CLOSURE', 'CLOSED', 'CANCELLED'].map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-caps block mb-1">Reason for change *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Required for audit trail"
              rows={3}
              className="w-full rounded border border-border bg-card px-3 py-2 text-gray-200"
            />
          </div>
          {showRcaWaiver && (
            <div>
              <label className="label-caps block mb-1">RCA waiver (only if procedure allows narrative-only RCA)</label>
              <textarea
                value={rcaWaiverReason}
                onChange={(e) => setRcaWaiverReason(e.target.value)}
                placeholder="If you cannot complete structured RCA plus ROOT_CAUSE_ANALYSIS task, document waiver here."
                rows={3}
                className="w-full rounded border border-border bg-card px-3 py-2 text-gray-200"
              />
            </div>
          )}
        </div>
      </Modal>

      {/* Save RCA modal */}
      <Modal
        isOpen={reasonModal === 'rca'}
        onClose={() => { setReasonModal(null); setReason(''); setSubmitError(''); }}
        title="Save investigation"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReasonModal(null)}>Cancel</Button>
            <Button onClick={saveRca} disabled={!reason.trim()}>Save</Button>
          </>
        }
      >
        {submitError && <p className="mb-2 text-sm text-destructive">{submitError}</p>}
        <label className="label-caps block mb-1">Reason for update *</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="w-full rounded border border-border bg-card px-3 py-2 text-gray-200"
          placeholder="Required for audit trail"
        />
      </Modal>

      {/* Source edit modal */}
      <Modal
        isOpen={reasonModal === 'source'}
        onClose={() => { setReasonModal(null); setReason(''); setSubmitError(''); }}
        title="Source and reference"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReasonModal(null)}>Cancel</Button>
            <Button onClick={saveSource} disabled={!reason.trim()}>Save</Button>
          </>
        }
      >
        {submitError && <p className="mb-2 text-sm text-destructive">{submitError}</p>}
        <div className="space-y-3">
          <div>
            <label className="label-caps block mb-1">Source type</label>
            <select
              value={sourceDraft.sourceType}
              onChange={(e) => setSourceDraft({ ...sourceDraft, sourceType: e.target.value })}
              className="w-full rounded border border-border bg-card px-3 py-2 text-gray-200"
            >
              {SOURCE_TYPE_OPTIONS.map((o) => (
                <option key={o.value || 'empty'} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <Input
            label="Source reference (NC #, deviation ID, complaint ref, etc.)"
            value={sourceDraft.sourceReference}
            onChange={(e) => setSourceDraft({ ...sourceDraft, sourceReference: e.target.value })}
          />
          <div>
            <label className="label-caps block mb-1">Reason for update *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full rounded border border-border bg-card px-3 py-2 text-gray-200"
            />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={esignModal === 'approve-plan'}
        onClose={() => { setEsignModal(null); setEsignPassword(''); setSubmitError(''); setApproveSignReason(''); }}
        title="Approve plan (e-signature)"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEsignModal(null)}>Cancel</Button>
            <Button onClick={handleApprovePlan} disabled={!approveSignReason.trim()}>
              Approve
            </Button>
          </>
        }
      >
        {submitError && <p className="mb-2 text-sm text-destructive">{submitError}</p>}
        <p className="text-sm text-gray-500 mb-3">Enter the reason for your signature and your password if e-sign is required for plan approval.</p>
        <div className="space-y-3">
          <div>
            <label className="label-caps block mb-1">Reason for signature *</label>
            <textarea
              value={approveSignReason}
              onChange={(e) => setApproveSignReason(e.target.value)}
              rows={3}
              className="w-full rounded border border-border bg-card px-3 py-2 text-gray-200"
            />
          </div>
          <div>
            <label className="label-caps block mb-1">Password (if required)</label>
            <Input
              type="password"
              value={esignPassword}
              onChange={(e) => setEsignPassword(e.target.value)}
              placeholder="Your password to sign"
            />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={esignModal === 'close'}
        onClose={() => { setEsignModal(null); setEsignPassword(''); setSubmitError(''); setCloseSignReason(''); }}
        title="Close CAPA (e-signature)"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEsignModal(null)}>Cancel</Button>
            <Button onClick={handleClose} disabled={!closeSignReason.trim()}>
              Close CAPA
            </Button>
          </>
        }
      >
        {submitError && <p className="mb-2 text-sm text-destructive">{submitError}</p>}
        <div className="space-y-3">
          <div>
            <label className="label-caps block mb-1">Reason for signature / closure *</label>
            <textarea
              value={closeSignReason}
              onChange={(e) => setCloseSignReason(e.target.value)}
              rows={3}
              className="w-full rounded border border-border bg-card px-3 py-2 text-gray-200"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={closeEffectivenessWaived}
              onChange={(e) => setCloseEffectivenessWaived(e.target.checked)}
            />
            Waive effectiveness check (requires justification)
          </label>
          {closeEffectivenessWaived && (
            <div>
              <label className="label-caps block mb-1">Effectiveness waiver justification *</label>
              <textarea
                value={closeEffectivenessJustification}
                onChange={(e) => setCloseEffectivenessJustification(e.target.value)}
                rows={3}
                className="w-full rounded border border-border bg-card px-3 py-2 text-gray-200"
              />
            </div>
          )}
          <div>
            <label className="label-caps block mb-1">Password (if required)</label>
            <Input
              type="password"
              value={esignPassword}
              onChange={(e) => setEsignPassword(e.target.value)}
              placeholder="Your password to sign"
            />
          </div>
        </div>
      </Modal>
    </PageShell>
  );
}
