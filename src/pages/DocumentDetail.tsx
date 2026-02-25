import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { Badge, Button, Card, Input, Modal } from '@/components/ui';
import { DocumentContentRender } from '@/components/DocumentContentRender';
import { RichTextEditor } from '@/components/RichTextEditor';
import { GovernanceApprovalPanel } from '@/components/modules/compliance/GovernanceApprovalPanel';
import { useAuth } from '@/context/AuthContext';
import { apiRequest, apiUrl } from '@/lib/api';
import { stripMarkdownFormatting } from '@/lib/format';
import { useDocumentTypes } from '@/hooks/useDocumentTypes';

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
  documentHash?: string;
  signatureHash?: string;
}

interface DocumentLinkRef {
  id: string;
  sourceDocumentId: string;
  targetDocumentId: string;
  linkType: string;
  sourceDocument: { id: string; documentId: string; title: string; versionMajor: number; versionMinor: number };
  targetDocument: { id: string; documentId: string; title: string; versionMajor: number; versionMinor: number };
}

interface DocumentCommentRef {
  id: string;
  commentText: string;
  sectionIdentifier?: string | null;
  status: 'OPEN' | 'RESOLVED' | 'REJECTED';
  createdAt: string;
  user: UserRef;
}

interface TrainingModuleRef {
  id: string;
  title: string;
  dueDate: string;
}

interface DocumentDetailModel {
  id: string;
  documentId: string;
  title: string;
  documentType: string;
  versionMajor: number;
  versionMinor: number;
  status: 'DRAFT' | 'IN_REVIEW' | 'AWAITING_APPROVAL' | 'APPROVED' | 'EFFECTIVE' | 'OBSOLETE';
  content?: string | null;
  authorId: string;
  effectiveDate?: string | null;
  tags?: string[];
  nextReviewDate?: string | null;
  isUnderReview?: boolean;
  author: UserRef;
  assignments: DocumentAssignment[];
  history: DocumentHistoryItem[];
  revisions: DocumentRevisionItem[];
  signatures: DocumentSignatureItem[];
  trainingModules?: TrainingModuleRef[];
  canAddLinks?: boolean;
}

export function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const documentTypes = useDocumentTypes();
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
  const [signatureError, setSignatureError] = useState('');
  const [showReviseModal, setShowReviseModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [links, setLinks] = useState<DocumentLinkRef[]>([]);
  const [comments, setComments] = useState<DocumentCommentRef[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [newCommentText, setNewCommentText] = useState('');
  const [newCommentSection, setNewCommentSection] = useState('');
  const [linkTargetId, setLinkTargetId] = useState('');
  const [linkType, setLinkType] = useState('references');
  const [linkSearchQuery, setLinkSearchQuery] = useState('');
  const [linkSelectedDoc, setLinkSelectedDoc] = useState<{ id: string; documentId: string; title: string } | null>(null);
  const [linkDropdownOpen, setLinkDropdownOpen] = useState(false);
  const [documentsForLink, setDocumentsForLink] = useState<{ id: string; documentId: string; title: string }[]>([]);
  const [linkSearchLoading, setLinkSearchLoading] = useState(false);
  const linkDropdownRef = useRef<HTMLDivElement>(null);

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
    if (!doc) {
      setLinks([]);
      setComments([]);
      setTags([]);
      return;
    }
    setTags(doc.tags || []);
    if (!token || !doc.id) return;
    apiRequest<{ links: DocumentLinkRef[] }>(`/api/documents/${doc.id}/links`, { token })
      .then((d) => setLinks(d.links))
      .catch(() => setLinks([]));
    apiRequest<{ comments: DocumentCommentRef[] }>(`/api/documents/${doc.id}/comments`, { token })
      .then((d) => setComments(d.comments))
      .catch(() => setComments([]));
  }, [token, doc?.id, doc?.tags]);

  // Debounced search for document link picker
  useEffect(() => {
    if (!token || !doc?.id) return;
    const timer = setTimeout(() => {
      if (!linkSearchQuery.trim()) {
        setDocumentsForLink([]);
        setLinkSearchLoading(false);
        return;
      }
      setLinkSearchLoading(true);
      const params = `?search=${encodeURIComponent(linkSearchQuery.trim())}`;
      apiRequest<{ documents: { id: string; documentId: string; title: string }[] }>(
        `/api/documents${params}`,
        { token }
      )
        .then((d) => setDocumentsForLink((d.documents || []).filter((x) => x.id !== doc.id)))
        .catch(() => setDocumentsForLink([]))
        .finally(() => setLinkSearchLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [token, doc?.id, linkSearchQuery]);

  // Close link dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (linkDropdownRef.current && !linkDropdownRef.current.contains(e.target as Node)) {
        setLinkDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
  const canApprove = !!pendingMyApproval && doc.status === 'AWAITING_APPROVAL';
  const canRelease = (!!pendingMyRelease || user?.roleName === 'System Admin') && doc.status === 'APPROVED';
  const canRevise = doc.status === 'EFFECTIVE';
  const canDelete = user?.permissions?.includes('document:delete');

  const reviewers = users.filter((u) => u.id !== user?.id);
  const approvers = users.filter(
    (u) => ['Manager', 'Quality Manager', 'System Admin'].includes(u.roleName || '') && u.id !== user?.id
  );

  const openPdf = async (uncontrolled: boolean) => {
    if (!token) return;
    const previewTab = uncontrolled ? null : window.open('', '_blank');
    if (!uncontrolled && !previewTab) {
      setError('Popup blocked while opening PDF. Please allow popups for this site.');
      return;
    }
    if (previewTab) {
      previewTab.document.title = 'Loading PDF...';
      previewTab.document.body.innerHTML =
        '<p style="font-family: Arial, sans-serif; padding: 16px;">Loading PDF preview...</p>';
    }

    try {
      setError('');
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
        if (!previewTab) {
          throw new Error('Popup window was closed before PDF could load.');
        }
        previewTab.location.href = blobUrl;
        // Keep the object URL alive long enough for embedded viewers to finish loading.
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 300000);
      }
    } catch (err) {
      if (previewTab && !previewTab.closed) {
        previewTab.close();
      }
      setError(err instanceof Error ? err.message : 'Failed to open PDF');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>
            {doc.documentId} - {stripMarkdownFormatting(doc.title)}
          </h1>
          <p className="mt-1 text-gray-500">
            {doc.documentType} • Version {doc.versionMajor}.{doc.versionMinor} • Author:{' '}
            {doc.author.firstName} {doc.author.lastName}
          </p>
          {(doc.tags?.length ?? 0) > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {(doc.tags ?? []).map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-surface-elevated px-2 py-0.5 text-xs text-gray-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {doc.status === 'EFFECTIVE' && doc.trainingModules?.length ? (
            <Button
              variant="secondary"
              onClick={() => navigate(`/training?module=${doc.trainingModules![0].id}`)}
            >
              View Training Module
            </Button>
          ) : null}
          {doc.status === 'EFFECTIVE' && (isAuthor || user?.roleName === 'Quality Manager' || user?.roleName === 'Admin') ? (
            <Button
              variant="secondary"
              onClick={async () => {
                if (!token) return;
                await apiRequest(`/api/documents/${doc.id}/initiate-periodic-review`, { token, method: 'POST' });
                await fetchDocument();
              }}
            >
              Initiate Periodic Review
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => openPdf(false)}>
            View PDF
          </Button>
          <Button variant="secondary" onClick={() => openPdf(true)}>
            Download Uncontrolled Copy
          </Button>
          <Badge variant={doc.status === 'EFFECTIVE' ? 'success' : doc.status === 'AWAITING_APPROVAL' || doc.status === 'IN_REVIEW' ? 'warning' : doc.status === 'APPROVED' ? 'info' : 'neutral'}>
            {doc.status === 'AWAITING_APPROVAL' ? 'Awaiting Approval' : doc.status.replace(/_/g, ' ')}
          </Badge>
          {doc.nextReviewDate && (
            <span className="text-sm text-gray-400">
              Next review: {new Date(doc.nextReviewDate).toLocaleDateString()}
            </span>
          )}
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
                {documentTypes.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label-caps mb-1.5 block">Content</label>
              <RichTextEditor
                value={content}
                onChange={setContent}
                minHeight="280px"
              />
            </div>
            {(canEdit || user?.roleName === 'Quality Manager' || user?.roleName === 'Admin') && (
              <div>
                <label className="label-caps mb-1.5 block">Tags (comma-separated)</label>
                <Input
                  value={tags.join(', ')}
                  onChange={(e) =>
                    setTags(
                      e.target.value
                        .split(',')
                        .map((t) => t.trim())
                        .filter(Boolean)
                    )
                  }
                  placeholder="e.g. CMMC, ISO13485, Safety"
                />
              </div>
            )}
            <Button
              onClick={async () => {
                if (!token) return;
                await apiRequest(`/api/documents/${doc.id}`, {
                  token,
                  method: 'PUT',
                  body: { title, documentType, content, tags },
                });
                await fetchDocument();
              }}
            >
              Save Changes
            </Button>
          </div>
        ) : (
          <div className="min-h-[240px] rounded-lg border border-surface-border bg-surface-overlay p-4">
            <DocumentContentRender content={doc.content} />
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

      {canDelete && (
        <Card padding="md">
          <h2 className="mb-2 text-lg text-white">Delete Document</h2>
          <p className="mb-3 text-sm text-gray-400">
            Permanently remove this document and all its history, signatures, and links. Cannot be undone. Documents used as form templates cannot be deleted.
          </p>
          <Button variant="danger" onClick={() => { setDeleteError(''); setShowDeleteModal(true); }}>
            Delete document
          </Button>
        </Card>
      )}

      <Card padding="md">
        <h2 className="mb-4 text-lg text-white">Where Used</h2>
        {links.length === 0 ? (
          <p className="text-sm text-gray-500">No document links recorded.</p>
        ) : (
          <ul className="space-y-2">
            {links.map((link) => {
              const isSource = link.sourceDocumentId === doc.id;
              const other = isSource ? link.targetDocument : link.sourceDocument;
              return (
                <li key={link.id} className="flex items-center gap-2 text-sm">
                  <span className="text-gray-400">{link.linkType}:</span>
                  <button
                    type="button"
                    className="text-mactech-blue hover:underline"
                    onClick={() => navigate(`/documents/${other.id}`)}
                  >
                    {other.documentId} v{other.versionMajor}.{other.versionMinor} – {stripMarkdownFormatting(other.title)}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {(doc.canAddLinks ?? isAuthor) && doc.status !== 'OBSOLETE' && (
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <select
              value={linkType}
              onChange={(e) => setLinkType(e.target.value)}
              className="rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-gray-100"
            >
              <option value="references">references</option>
              <option value="impacts">impacts</option>
              <option value="supersedes">supersedes</option>
            </select>
            <div ref={linkDropdownRef} className="relative min-w-[280px]">
              <Input
                placeholder="Type to search documents..."
                value={linkSelectedDoc ? `${linkSelectedDoc.documentId} – ${stripMarkdownFormatting(linkSelectedDoc.title)}` : linkSearchQuery}
                onChange={(e) => {
                  setLinkSearchQuery(e.target.value);
                  setLinkTargetId('');
                  setLinkSelectedDoc(null);
                  setLinkDropdownOpen(true);
                }}
                onFocus={() => setLinkDropdownOpen(true)}
                className="pr-8"
              />
              {linkSelectedDoc && (
                <button
                  type="button"
                  onClick={() => { setLinkTargetId(''); setLinkSelectedDoc(null); setLinkSearchQuery(''); setLinkDropdownOpen(true); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  aria-label="Clear selection"
                >
                  ×
                </button>
              )}
              {linkDropdownOpen && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-auto rounded-lg border border-surface-border bg-surface-elevated shadow-lg">
                  {linkSearchLoading ? (
                    <div className="px-3 py-4 text-center text-sm text-gray-500">Searching...</div>
                  ) : !linkSearchQuery.trim() ? (
                    <div className="px-3 py-4 text-center text-sm text-gray-500">Type to search documents by ID or title</div>
                  ) : documentsForLink.length === 0 ? (
                    <div className="px-3 py-4 text-center text-sm text-gray-500">No documents found</div>
                  ) : (
                    documentsForLink.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-surface-overlay focus:bg-surface-overlay focus:outline-none"
                        onClick={() => {
                          setLinkTargetId(d.id);
                          setLinkSearchQuery('');
                          setLinkDropdownOpen(false);
                        }}
                      >
                        {d.documentId} – {stripMarkdownFormatting(d.title)}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled={!linkTargetId}
              onClick={async () => {
                if (!token || !linkTargetId) return;
                await apiRequest(`/api/documents/${doc.id}/link`, {
                  token,
                  method: 'POST',
                  body: { sourceDocumentId: doc.id, targetDocumentId: linkTargetId, linkType },
                });
                setLinkTargetId('');
                setLinkSelectedDoc(null);
                setLinkSearchQuery('');
                const data = await apiRequest<{ links: DocumentLinkRef[] }>(`/api/documents/${doc.id}/links`, { token });
                setLinks(data.links);
              }}
            >
              Add Link
            </Button>
          </div>
        )}
      </Card>

      <Card padding="md">
        <h2 className="mb-4 text-lg text-white">Collaboration / Comments</h2>
        {comments.length === 0 ? (
          <p className="text-sm text-gray-500">No comments yet.</p>
        ) : (
          <ul className="space-y-3">
            {comments.map((c) => (
              <li
                key={c.id}
                className={`rounded-lg border p-3 ${
                  c.status === 'OPEN'
                    ? 'border-surface-border bg-surface-overlay'
                    : 'border-surface-border/50 bg-surface-elevated/50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm text-gray-200">{c.commentText}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {c.user.firstName} {c.user.lastName}
                      {c.sectionIdentifier ? ` • Section ${c.sectionIdentifier}` : ''} •{' '}
                      {new Date(c.createdAt).toLocaleString()} • {c.status}
                    </p>
                  </div>
                  {(user?.roleName === 'Admin' || user?.roleName === 'Quality Manager' || isAuthor) &&
                    c.status === 'OPEN' && (
                      <div className="flex gap-1">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={async () => {
                            if (!token) return;
                            await apiRequest(`/api/documents/comments/${c.id}`, {
                              token,
                              method: 'PUT',
                              body: { status: 'RESOLVED' },
                            });
                            const data = await apiRequest<{ comments: DocumentCommentRef[] }>(
                              `/api/documents/${doc.id}/comments`,
                              { token }
                            );
                            setComments(data.comments);
                          }}
                        >
                          Resolve
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={async () => {
                            if (!token) return;
                            await apiRequest(`/api/documents/comments/${c.id}`, {
                              token,
                              method: 'PUT',
                              body: { status: 'REJECTED' },
                            });
                            const data = await apiRequest<{ comments: DocumentCommentRef[] }>(
                              `/api/documents/${doc.id}/comments`,
                              { token }
                            );
                            setComments(data.comments);
                          }}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {doc.isUnderReview && (
          <div className="mt-4 space-y-2">
            <Input
              placeholder="Section (e.g. 1.0, 2.1)"
              value={newCommentSection}
              onChange={(e) => setNewCommentSection(e.target.value)}
            />
            <textarea
              rows={3}
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-gray-100"
              placeholder="Add a comment..."
            />
            <Button
              size="sm"
              onClick={async () => {
                if (!token || !newCommentText.trim()) return;
                await apiRequest(`/api/documents/${doc.id}/comment`, {
                  token,
                  method: 'POST',
                  body: { commentText: newCommentText.trim(), sectionIdentifier: newCommentSection || undefined },
                });
                setNewCommentText('');
                setNewCommentSection('');
                const data = await apiRequest<{ comments: DocumentCommentRef[] }>(
                  `/api/documents/${doc.id}/comments`,
                  { token }
                );
                setComments(data.comments);
              }}
            >
              Add Comment
            </Button>
          </div>
        )}
      </Card>

      <Card padding="md">
        <h2 className="mb-4 text-lg text-white">Approval & Signature History</h2>
        {doc.signatures.length === 0 ? (
          <p className="text-sm text-gray-500">No signatures captured yet.</p>
        ) : (
          <>
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
            <div className="mt-6">
              <h3 className="mb-3 text-sm font-medium text-white">Signature hash architecture</h3>
              <p className="mb-3 text-xs text-gray-400">
                Hashes are computed at signing time. Document hash = SHA-256 of document content; signature hash = SHA-256 of signature payload (document id, signer, meaning, timestamp). Not displayed on the document itself.
              </p>
              <div className="space-y-4">
                {doc.signatures.map((sig) => (
                  <div
                    key={sig.id}
                    className="rounded-lg border border-surface-border bg-surface-overlay p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-200">
                        {sig.signatureMeaning} — {sig.signer.firstName} {sig.signer.lastName}
                      </span>
                      <span className="text-xs text-gray-500">{new Date(sig.signedAt).toLocaleString()}</span>
                    </div>
                    <dl className="space-y-2 text-xs">
                      <div>
                        <dt className="text-gray-500">Document hash (SHA-256)</dt>
                        <dd className="mt-0.5 font-mono break-all text-gray-300">{sig.documentHash ?? '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Signature hash (SHA-256)</dt>
                        <dd className="mt-0.5 font-mono break-all text-gray-300">{sig.signatureHash ?? '—'}</dd>
                      </div>
                    </dl>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </Card>

      <GovernanceApprovalPanel
        approvalUrl={`/api/documents/${doc.id}/governance-approval`}
        token={token}
        title="Governance Approval"
      />

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
        isOpen={showDeleteModal}
        onClose={() => { if (!deleteSubmitting) { setShowDeleteModal(false); setDeleteError(''); } }}
        title="Delete document"
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-300">
            Permanently delete <strong>{doc.documentId}</strong> v{doc.versionMajor}.{doc.versionMinor} – {stripMarkdownFormatting(doc.title)}? This cannot be undone.
          </p>
          {deleteError && <p className="text-sm text-compliance-red">{deleteError}</p>}
          <div className="flex gap-2 justify-end">
            <Button
              variant="secondary"
              onClick={() => { setShowDeleteModal(false); setDeleteError(''); }}
              disabled={deleteSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={deleteSubmitting}
              onClick={async () => {
                if (!token) return;
                setDeleteSubmitting(true);
                setDeleteError('');
                try {
                  await apiRequest(`/api/documents/${doc.id}`, {
                    token,
                    method: 'DELETE',
                  });
                  setShowDeleteModal(false);
                  navigate('/documents');
                } catch (err) {
                  setDeleteError(err instanceof Error ? err.message : 'Delete failed');
                } finally {
                  setDeleteSubmitting(false);
                }
              }}
            >
              {deleteSubmitting ? 'Deleting…' : 'Delete permanently'}
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
          setSignatureError('');
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
                setSignatureError('');
                try {
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
                } catch (err) {
                  setSignatureError(err instanceof Error ? err.message : 'Request failed');
                }
              }}
            >
              Sign & Submit
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {signatureError && (
            <p className="text-sm text-compliance-red">{signatureError}</p>
          )}
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
