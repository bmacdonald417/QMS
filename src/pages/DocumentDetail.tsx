import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { Badge, Button, Card, Input, Modal } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { apiRequest, apiUrl } from '@/lib/api';

interface UserRef {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  roleName?: string;
  permissions?: string[];
}

interface DocumentAssignment {
  id: string;
  assignedToId: string;
  assignmentType: 'REVIEW' | 'APPROVAL' | 'QUALITY_RELEASE';
  status: 'PENDING' | 'COMPLETED' | 'REJECTED';
  comments?: string | null;
  completedAt?: string | null;
  assignedTo: UserRef;
}

interface DocumentHistoryItem {
  id: string;
  action: string;
  timestamp: string;
  details?: Record<string, unknown> | null;
  digitalSignature?: Record<string, unknown> | null;
  user: UserRef;
}

interface DocumentRevisionItem {
  id: string;
  versionMajor: number;
  versionMinor: number;
  effectiveDate: string;
  summaryOfChange: string;
  author: UserRef;
}

interface DocumentSignatureItem {
  id: string;
  signatureMeaning: string;
  signedAt: string;
  signer: UserRef;
}

interface DocumentDetailModel {
  id: string;
  documentId: string;
  title: string;
  documentType: string;
  versionMajor: number;
  versionMinor: number;
  status: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'EFFECTIVE' | 'OBSOLETE';
  content?: string | null;
  authorId: string;
  effectiveDate?: string | null;
  author: UserRef;
  assignments: DocumentAssignment[];
  history: DocumentHistoryItem[];
  revisions: DocumentRevisionItem[];
  signatures: DocumentSignatureItem[];
}

export function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<DocumentDetailModel | null>(null);
  const [users, setUsers] = useState<UserRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [documentType, setDocumentType] = useState('SOP');
  const [content, setContent] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [submitComment, setSubmitComment] = useState('');
  const [reviewerIds, setReviewerIds] = useState<string[]>([]);
  const [approverId, setApproverId] = useState('');

  const [passwordModal, setPasswordModal] = useState<null | 'approve' | 'release'>(null);
  const [signaturePassword, setSignaturePassword] = useState('');
  const [signatureComment, setSignatureComment] = useState('');
  const [showReviseModal, setShowReviseModal] = useState(false);

  const fetchDocument = async () => {
    if (!token || !id) return;
    try {
      setLoading(true);
      setError('');
      const data = await apiRequest<{ document: DocumentDetailModel }>(`/api/documents/${id}`, { token });
      setDoc(data.document);
      setTitle(data.document.title);
      setDocumentType(data.document.documentType);
      setContent(data.document.content || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load document');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocument();
  }, [token, id]);

  useEffect(() => {
    if (!token) return;
    apiRequest<{ users: UserRef[] }>('/api/users', { token })
      .then((data) => setUsers(data.users))
      .catch(() => setUsers([]));
  }, [token]);

  const pendingMyReview = useMemo(
    () =>
      doc?.assignments.find(
        (a) => a.assignedToId === user?.id && a.assignmentType === 'REVIEW' && a.status === 'PENDING'
      ),
    [doc, user?.id]
  );
  const pendingMyApproval = useMemo(
    () =>
      doc?.assignments.find(
        (a) => a.assignedToId === user?.id && a.assignmentType === 'APPROVAL' && a.status === 'PENDING'
      ),
    [doc, user?.id]
  );
  const pendingMyRelease = useMemo(
    () =>
      doc?.assignments.find(
        (a) => a.assignedToId === user?.id && a.assignmentType === 'QUALITY_RELEASE' && a.status === 'PENDING'
      ),
    [doc, user?.id]
  );

  if (loading) return <p className="text-gray-400">Loading document...</p>;
  if (error) return <p className="text-compliance-red">{error}</p>;
  if (!doc) return <p className="text-gray-400">Document not found.</p>;

  const isAuthor = user?.id === doc.authorId;
  const canEdit = isAuthor && (doc.status === 'DRAFT' || doc.status === 'IN_REVIEW');
  const canSubmitReview = isAuthor && doc.status === 'DRAFT';
  const canApprove = !!pendingMyApproval && doc.status === 'IN_REVIEW';
  const canRelease = (!!pendingMyRelease || user?.roleName === 'Admin') && doc.status === 'APPROVED';
  const canRevise = doc.status === 'EFFECTIVE';

  const reviewers = users.filter((u) => u.id !== user?.id);
  const approvers = users.filter(
    (u) => ['Manager', 'Quality Manager', 'Admin'].includes(u.roleName || '') && u.id !== user?.id
  );

  const openPdf = async (uncontrolled: boolean) => {
    if (!token) return;
    try {
      const response = await fetch(
        apiUrl(`/api/documents/${doc.id}/pdf?uncontrolled=${uncontrolled ? 'true' : 'false'}`),
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error((payload as { error?: string }).error || 'Failed to generate PDF');
      }
      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (!contentType.includes('application/pdf')) {
        const bodyText = await response.text().catch(() => '');
        let serverError = '';
        if (bodyText) {
          try {
            serverError = (JSON.parse(bodyText) as { error?: string }).error || '';
          } catch {
            // Non-JSON body; keep generic message below.
          }
        }
        throw new Error(
          serverError ||
            'PDF endpoint returned a non-PDF response. Verify API URL and backend PDF runtime.'
        );
      }
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      if (uncontrolled) {
        const anchor = window.document.createElement('a');
        anchor.href = blobUrl;
        anchor.download = `${doc.documentId}-v${doc.versionMajor}.${doc.versionMinor}.pdf`;
        window.document.body.appendChild(anchor);
        anchor.click();
        window.document.body.removeChild(anchor);
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 15000);
      } else {
        const opened = window.open(blobUrl, '_blank', 'noopener,noreferrer');
        if (!opened) {
          throw new Error('Popup blocked while opening PDF. Please allow popups for this site.');
        }
        // Keep the object URL alive long enough for embedded viewers to finish loading.
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 300000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open PDF');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>
            {doc.documentId} - {doc.title}
          </h1>
          <p className="mt-1 text-gray-500">
            {doc.documentType} • Version {doc.versionMajor}.{doc.versionMinor} • Author:{' '}
            {doc.author.firstName} {doc.author.lastName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => openPdf(false)}>
            View PDF
          </Button>
          <Button variant="secondary" onClick={() => openPdf(true)}>
            Download Uncontrolled Copy
          </Button>
          <Badge variant="info">{doc.status.replace(/_/g, ' ')}</Badge>
        </div>
      </div>

      <Card padding="md">
        <h2 className="mb-4 text-lg text-white">Document</h2>
        {canEdit ? (
          <div className="space-y-4">
            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <div>
              <label className="label-caps mb-1.5 block">Document Type</label>
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                className="w-full rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-mactech-blue"
              >
                <option value="SOP">SOP</option>
                <option value="POLICY">Policy</option>
                <option value="WORK_INSTRUCTION">Work Instruction</option>
                <option value="FORM">Form</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="label-caps mb-1.5 block">Content (Markdown)</label>
              <textarea
                rows={12}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-mactech-blue"
              />
            </div>
            <Button
              onClick={async () => {
                if (!token) return;
                await apiRequest(`/api/documents/${doc.id}`, {
                  token,
                  method: 'PUT',
                  body: { title, documentType, content },
                });
                await fetchDocument();
              }}
            >
              Save Changes
            </Button>
          </div>
        ) : (
          <div className="min-h-[240px] rounded-lg border border-surface-border bg-surface-overlay p-4">
            <div className="prose prose-invert max-w-none prose-p:text-gray-200 prose-headings:text-white">
              <ReactMarkdown>{doc.content || 'No content provided.'}</ReactMarkdown>
            </div>
          </div>
        )}
      </Card>

      {canSubmitReview && (
        <Card padding="md">
          <h2 className="mb-4 text-lg text-white">Submit for Review</h2>
          <p className="mb-3 text-sm text-gray-500">Select reviewers and one approver.</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="label-caps mb-1.5 block">Reviewers</label>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-surface-border p-3">
                {reviewers.map((reviewer) => (
                  <label key={reviewer.id} className="flex items-center gap-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={reviewerIds.includes(reviewer.id)}
                      onChange={(e) =>
                        setReviewerIds((prev) =>
                          e.target.checked
                            ? [...new Set([...prev, reviewer.id])]
                            : prev.filter((value) => value !== reviewer.id)
                        )
                      }
                    />
                    {reviewer.firstName} {reviewer.lastName} ({reviewer.roleName})
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="label-caps mb-1.5 block">Approver</label>
              <select
                value={approverId}
                onChange={(e) => setApproverId(e.target.value)}
                className="w-full rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-mactech-blue"
              >
                <option value="">Select approver</option>
                {approvers.map((approver) => (
                  <option key={approver.id} value={approver.id}>
                    {approver.firstName} {approver.lastName} ({approver.roleName})
                  </option>
                ))}
              </select>
              <div className="mt-3">
                <label className="label-caps mb-1.5 block">Comments</label>
                <textarea
                  value={submitComment}
                  onChange={(e) => setSubmitComment(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-mactech-blue"
                />
              </div>
            </div>
          </div>
          <div className="mt-4">
            <Button
              onClick={async () => {
                if (!token) return;
                await apiRequest(`/api/documents/${doc.id}/submit-review`, {
                  token,
                  method: 'POST',
                  body: { reviewerIds, approverId, comments: submitComment },
                });
                setReviewerIds([]);
                setApproverId('');
                setSubmitComment('');
                await fetchDocument();
              }}
            >
              Submit for Review
            </Button>
          </div>
        </Card>
      )}

      {pendingMyReview && doc.status === 'IN_REVIEW' && (
        <Card padding="md">
          <h2 className="mb-2 text-lg text-white">Review Decision</h2>
          <textarea
            rows={4}
            value={reviewComment}
            onChange={(e) => setReviewComment(e.target.value)}
            className="w-full rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-mactech-blue"
            placeholder="Add review comments..."
          />
          <div className="mt-3 flex gap-2">
            <Button
              variant="secondary"
              onClick={async () => {
                if (!token) return;
                await apiRequest(`/api/documents/${doc.id}/review`, {
                  token,
                  method: 'POST',
                  body: { decision: 'APPROVED_WITH_COMMENTS', comments: reviewComment },
                });
                setReviewComment('');
                await fetchDocument();
              }}
            >
              Approve with Comments
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!token) return;
                await apiRequest(`/api/documents/${doc.id}/review`, {
                  token,
                  method: 'POST',
                  body: { decision: 'REQUIRES_REVISION', comments: reviewComment },
                });
                setReviewComment('');
                await fetchDocument();
              }}
            >
              Requires Revision
            </Button>
          </div>
        </Card>
      )}

      {canApprove && (
        <Card padding="md">
          <h2 className="mb-2 text-lg text-white">Approval</h2>
          <p className="mb-3 text-sm text-gray-400">
            Approval requires password re-entry and records a 21 CFR Part 11 digital signature.
          </p>
          <Button onClick={() => setPasswordModal('approve')}>Approve Document</Button>
        </Card>
      )}

      {canRelease && (
        <Card padding="md">
          <h2 className="mb-2 text-lg text-white">Quality Release</h2>
          <p className="mb-3 text-sm text-gray-400">
            Final quality release requires password re-entry and records digital signature evidence.
          </p>
          <Button variant="success" onClick={() => setPasswordModal('release')}>
            Release Document
          </Button>
        </Card>
      )}

      {canRevise && (
        <Card padding="md">
          <h2 className="mb-2 text-lg text-white">Revise Document</h2>
          <p className="mb-3 text-sm text-gray-400">
            Create a new major or minor revision from this effective document.
          </p>
          <Button onClick={() => setShowReviseModal(true)}>Revise</Button>
        </Card>
      )}

      <Card padding="md">
        <h2 className="mb-4 text-lg text-white">Approval & Signature History</h2>
        {doc.signatures.length === 0 ? (
          <p className="text-sm text-gray-500">No signatures captured yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border text-left text-gray-400">
                  <th className="py-2">Meaning</th>
                  <th className="py-2">Signer</th>
                  <th className="py-2">Signed At</th>
                </tr>
              </thead>
              <tbody>
                {doc.signatures.map((signature) => (
                  <tr key={signature.id} className="border-b border-surface-border text-gray-200">
                    <td className="py-2">{signature.signatureMeaning}</td>
                    <td className="py-2">
                      {signature.signer.firstName} {signature.signer.lastName}
                    </td>
                    <td className="py-2">{new Date(signature.signedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card padding="md">
        <h2 className="mb-4 text-lg text-white">Revision History</h2>
        {doc.revisions.length === 0 ? (
          <p className="text-sm text-gray-500">No revision entries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border text-left text-gray-400">
                  <th className="py-2">Version</th>
                  <th className="py-2">Effective Date</th>
                  <th className="py-2">Author</th>
                  <th className="py-2">Summary</th>
                </tr>
              </thead>
              <tbody>
                {doc.revisions.map((revision) => (
                  <tr key={revision.id} className="border-b border-surface-border text-gray-200">
                    <td className="py-2">
                      {revision.versionMajor}.{revision.versionMinor}
                    </td>
                    <td className="py-2">{new Date(revision.effectiveDate).toLocaleDateString()}</td>
                    <td className="py-2">
                      {revision.author.firstName} {revision.author.lastName}
                    </td>
                    <td className="py-2">{revision.summaryOfChange}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card padding="md">
        <h2 className="mb-4 text-lg text-white">Audit Trail</h2>
        {doc.history.length === 0 ? (
          <p className="text-sm text-gray-500">No history entries yet.</p>
        ) : (
          <ul className="space-y-3">
            {doc.history.map((item) => (
              <li key={item.id} className="rounded-lg border border-surface-border bg-surface-overlay p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-200">
                    {item.action} - {item.user.firstName} {item.user.lastName}
                  </p>
                  <p className="text-xs text-gray-500">{new Date(item.timestamp).toLocaleString()}</p>
                </div>
                {item.details && (
                  <pre className="mt-2 whitespace-pre-wrap text-xs text-gray-400">
                    {JSON.stringify(item.details, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal isOpen={showReviseModal} onClose={() => setShowReviseModal(false)} title="Choose Revision Type">
        <div className="space-y-3">
          <p className="text-sm text-gray-400">
            Major revision increments major and resets minor to 0. Minor revision increments only the minor version.
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={async () => {
                if (!token) return;
                const data = await apiRequest<{ document: DocumentDetailModel }>(`/api/documents/${doc.id}/revise`, {
                  token,
                  method: 'POST',
                  body: { revisionType: 'minor' },
                });
                setShowReviseModal(false);
                navigate(`/documents/${data.document.id}`);
              }}
            >
              Minor Revision
            </Button>
            <Button
              onClick={async () => {
                if (!token) return;
                const data = await apiRequest<{ document: DocumentDetailModel }>(`/api/documents/${doc.id}/revise`, {
                  token,
                  method: 'POST',
                  body: { revisionType: 'major' },
                });
                setShowReviseModal(false);
                navigate(`/documents/${data.document.id}`);
              }}
            >
              Major Revision
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={passwordModal !== null}
        onClose={() => {
          setPasswordModal(null);
          setSignaturePassword('');
          setSignatureComment('');
        }}
        title={
          passwordModal === 'approve'
            ? 'Approve Document (Digital Signature)'
            : 'Quality Release (Digital Signature)'
        }
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setPasswordModal(null);
                setSignaturePassword('');
                setSignatureComment('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!token || !passwordModal) return;
                await apiRequest(
                  passwordModal === 'approve'
                    ? `/api/documents/${doc.id}/approve`
                    : `/api/documents/${doc.id}/quality-release`,
                  {
                    token,
                    method: 'POST',
                    body: { password: signaturePassword, comments: signatureComment },
                  }
                );
                setPasswordModal(null);
                setSignaturePassword('');
                setSignatureComment('');
                await fetchDocument();
              }}
            >
              Sign & Submit
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Password"
            type="password"
            value={signaturePassword}
            onChange={(e) => setSignaturePassword(e.target.value)}
          />
          <div>
            <label className="label-caps mb-1.5 block">Comment</label>
            <textarea
              value={signatureComment}
              onChange={(e) => setSignatureComment(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-mactech-blue"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
