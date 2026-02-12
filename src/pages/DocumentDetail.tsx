import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card, Input, Modal } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';

interface UserRef {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  roleName?: string;
}

interface DocumentAssignment {
  id: string;
  assigneeId: string;
  taskType: 'REVIEW' | 'APPROVAL' | 'QUALITY_RELEASE';
  status: 'PENDING' | 'COMPLETED' | 'REJECTED';
  comments?: string | null;
  completedAt?: string | null;
  assignee: UserRef;
}

interface DocumentHistoryItem {
  id: string;
  action: string;
  timestamp: string;
  details?: Record<string, unknown> | null;
  digitalSignature?: Record<string, unknown> | null;
  user: UserRef;
}

interface DocumentDetailModel {
  id: string;
  docId: string;
  title: string;
  docType: string;
  majorVersion: number;
  minorVersion: number;
  status: 'DRAFT' | 'IN_REVIEW' | 'PENDING_APPROVAL' | 'PENDING_QUALITY_RELEASE' | 'EFFECTIVE' | 'ARCHIVED';
  content?: string | null;
  authorId: string;
  author: UserRef;
  assignments: DocumentAssignment[];
  history: DocumentHistoryItem[];
}

export function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [document, setDocument] = useState<DocumentDetailModel | null>(null);
  const [users, setUsers] = useState<UserRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [docType, setDocType] = useState('SOP');
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
      const data = await apiRequest<{ document: DocumentDetailModel }>(`/api/documents/${id}`, { token });
      setDocument(data.document);
      setTitle(data.document.title);
      setDocType(data.document.docType);
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
      document?.assignments.find(
        (a) => a.assigneeId === user?.id && a.taskType === 'REVIEW' && a.status === 'PENDING'
      ),
    [document, user?.id]
  );
  const pendingMyApproval = useMemo(
    () =>
      document?.assignments.find(
        (a) => a.assigneeId === user?.id && a.taskType === 'APPROVAL' && a.status === 'PENDING'
      ),
    [document, user?.id]
  );
  const pendingMyRelease = useMemo(
    () =>
      document?.assignments.find(
        (a) => a.assigneeId === user?.id && a.taskType === 'QUALITY_RELEASE' && a.status === 'PENDING'
      ),
    [document, user?.id]
  );

  if (loading) return <p className="text-gray-400">Loading document…</p>;
  if (error) return <p className="text-compliance-red">{error}</p>;
  if (!document) return <p className="text-gray-400">Document not found.</p>;

  const isAuthor = user?.id === document.authorId;
  const canEditDraft = isAuthor && document.status === 'DRAFT';

  const reviewers = users.filter((u) => u.id !== user?.id);
  const approvers = users.filter((u) => ['Manager', 'Quality'].includes(u.roleName || '') && u.id !== user?.id);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1>{document.docId} — {document.title}</h1>
          <p className="text-gray-500 mt-1">
            {document.docType} • Version {document.majorVersion}.{document.minorVersion} • Author: {document.author.firstName} {document.author.lastName}
          </p>
        </div>
        <Badge variant="info">{document.status.replace(/_/g, ' ')}</Badge>
      </div>

      <Card padding="md">
        <h2 className="text-lg text-white mb-4">Document</h2>

        {canEditDraft ? (
          <div className="space-y-4">
            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <div>
              <label className="label-caps block mb-1.5">Document Type</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
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
              <label className="label-caps block mb-1.5">Content</label>
              <textarea
                rows={12}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-mactech-blue"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={async () => {
                  if (!token) return;
                  await apiRequest(`/api/documents/${document.id}`, {
                    token,
                    method: 'PATCH',
                    body: { title, docType, content },
                  });
                  fetchDocument();
                }}
              >
                Save Draft
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-surface-border bg-surface-overlay p-4 whitespace-pre-wrap text-gray-200 min-h-[240px]">
            {document.content || 'No content provided.'}
          </div>
        )}
      </Card>

      {canEditDraft && (
        <Card padding="md">
          <h2 className="text-lg text-white mb-4">Submit for Review</h2>
          <p className="text-sm text-gray-500 mb-3">Select reviewers and one final approver.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label-caps block mb-1.5">Reviewers</label>
              <div className="space-y-2 max-h-48 overflow-y-auto rounded-lg border border-surface-border p-3">
                {reviewers.map((reviewer) => (
                  <label key={reviewer.id} className="flex items-center gap-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={reviewerIds.includes(reviewer.id)}
                      onChange={(e) =>
                        setReviewerIds((prev) =>
                          e.target.checked ? [...prev, reviewer.id] : prev.filter((id) => id !== reviewer.id)
                        )
                      }
                    />
                    {reviewer.firstName} {reviewer.lastName} ({reviewer.roleName})
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="label-caps block mb-1.5">Approver</label>
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
                <label className="label-caps block mb-1.5">Submission Comments</label>
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
                await apiRequest(`/api/documents/${document.id}/submit`, {
                  token,
                  method: 'POST',
                  body: { reviewerIds, approverId, comments: submitComment },
                });
                fetchDocument();
              }}
            >
              Submit for Review
            </Button>
          </div>
        </Card>
      )}

      {pendingMyReview && document.status === 'IN_REVIEW' && (
        <Card padding="md">
          <h2 className="text-lg text-white mb-2">Review Decision</h2>
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
                await apiRequest(`/api/documents/${document.id}/review`, {
                  token,
                  method: 'POST',
                  body: { decision: 'APPROVED_WITH_COMMENTS', comments: reviewComment },
                });
                setReviewComment('');
                fetchDocument();
              }}
            >
              Approve with Comments
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!token) return;
                await apiRequest(`/api/documents/${document.id}/review`, {
                  token,
                  method: 'POST',
                  body: { decision: 'REQUIRES_REVISION', comments: reviewComment },
                });
                setReviewComment('');
                fetchDocument();
              }}
            >
              Requires Revision
            </Button>
          </div>
        </Card>
      )}

      {pendingMyApproval && document.status === 'PENDING_APPROVAL' && (
        <Card padding="md">
          <h2 className="text-lg text-white mb-2">Approval</h2>
          <p className="text-sm text-gray-400 mb-3">
            Approval requires your password and records a SHA-256 signature for 21 CFR Part 11 evidence.
          </p>
          <Button onClick={() => setPasswordModal('approve')}>Approve Document</Button>
        </Card>
      )}

      {(pendingMyRelease || user?.roleName === 'Quality') && document.status === 'PENDING_QUALITY_RELEASE' && (
        <Card padding="md">
          <h2 className="text-lg text-white mb-2">Quality Release</h2>
          <p className="text-sm text-gray-400 mb-3">
            Final quality release requires your password and records digital signature evidence.
          </p>
          <Button variant="success" onClick={() => setPasswordModal('release')}>
            Release Document
          </Button>
        </Card>
      )}

      {document.status === 'EFFECTIVE' && (
        <Card padding="md">
          <h2 className="text-lg text-white mb-2">Revise Document</h2>
          <p className="text-sm text-gray-400 mb-3">
            Create a new draft revision from this effective version.
          </p>
          <Button onClick={() => setShowReviseModal(true)}>Revise</Button>
        </Card>
      )}

      <Card padding="md">
        <h2 className="text-lg text-white mb-4">History</h2>
        {document.history.length === 0 ? (
          <p className="text-sm text-gray-500">No history entries yet.</p>
        ) : (
          <ul className="space-y-3">
            {document.history.map((item) => (
              <li key={item.id} className="rounded-lg border border-surface-border bg-surface-overlay p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-200">
                    {item.action} — {item.user.firstName} {item.user.lastName}
                  </p>
                  <p className="text-xs text-gray-500">{new Date(item.timestamp).toLocaleString()}</p>
                </div>
                {item.details && (
                  <pre className="mt-2 text-xs text-gray-400 whitespace-pre-wrap">
                    {JSON.stringify(item.details, null, 2)}
                  </pre>
                )}
                {item.digitalSignature && (
                  <div className="mt-2 rounded-md border border-mactech-blue/40 bg-mactech-blue-muted p-2 text-xs text-gray-200">
                    <p className="font-medium mb-1">Digital Signature Evidence</p>
                    <pre className="whitespace-pre-wrap">
                      {JSON.stringify(item.digitalSignature, null, 2)}
                    </pre>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        isOpen={showReviseModal}
        onClose={() => setShowReviseModal(false)}
        title="Choose Revision Type"
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-400">
            Major revision: increments major version and resets minor to 0. Minor revision:
            increments only the minor version.
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={async () => {
                if (!token) return;
                const data = await apiRequest<{ document: DocumentDetailModel }>(
                  `/api/documents/${document.id}/revise`,
                  {
                    token,
                    method: 'POST',
                    body: { revisionType: 'minor' },
                  }
                );
                setShowReviseModal(false);
                navigate(`/documents/${data.document.id}`);
              }}
            >
              Minor Revision
            </Button>
            <Button
              onClick={async () => {
                if (!token) return;
                const data = await apiRequest<{ document: DocumentDetailModel }>(
                  `/api/documents/${document.id}/revise`,
                  {
                    token,
                    method: 'POST',
                    body: { revisionType: 'major' },
                  }
                );
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
        title={passwordModal === 'approve' ? 'Approve Document (Digital Signature)' : 'Quality Release (Digital Signature)'}
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
                    ? `/api/documents/${document.id}/approve`
                    : `/api/documents/${document.id}/release`,
                  {
                    token,
                    method: 'POST',
                    body: { password: signaturePassword, comments: signatureComment },
                  }
                );
                setPasswordModal(null);
                setSignaturePassword('');
                setSignatureComment('');
                fetchDocument();
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
            <label className="label-caps block mb-1.5">Comment</label>
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
