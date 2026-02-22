import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Table, Badge, Button, Modal, Input } from '@/components/ui';
import { RichTextEditor } from '@/components/RichTextEditor';
import { PageShell } from './PageShell';
import type { Column } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';
import { stripMarkdownFormatting } from '@/lib/format';
import { useDocumentTypes } from '@/hooks/useDocumentTypes';
import { Search, Filter, X } from 'lucide-react';

interface DocumentListItem {
  id: string;
  documentId: string;
  title: string;
  documentType: string;
  versionMajor: number;
  versionMinor: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  author: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

const statusVariant: Record<string, 'default' | 'info' | 'success' | 'warning' | 'neutral' | 'danger'> = {
  DRAFT: 'neutral',
  IN_REVIEW: 'warning',
  APPROVED: 'info',
  EFFECTIVE: 'success',
  OBSOLETE: 'default',
};

export function DocumentControl() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const documentTypes = useDocumentTypes();
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [documentType, setDocumentType] = useState('SOP');
  const [documentId, setDocumentId] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [suggestIdLoading, setSuggestIdLoading] = useState(false);
  const [documentTypeFilter, setDocumentTypeFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [tagsFilter, setTagsFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  const buildQueryParams = () => {
    const params = new URLSearchParams();
    if (documentTypeFilter) params.append('documentType', documentTypeFilter);
    if (statusFilter) params.append('status', statusFilter);
    if (tagsFilter) params.append('tags', tagsFilter);
    if (searchQuery) params.append('search', searchQuery);
    return params.toString() ? `?${params.toString()}` : '';
  };

  const fetchDocuments = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const params = buildQueryParams();
      const data = await apiRequest<{ documents: DocumentListItem[] }>(`/api/documents${params}`, { token });
      setDocuments(data.documents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [token, documentTypeFilter, statusFilter, tagsFilter, searchQuery]);

  const clearFilters = () => {
    setDocumentTypeFilter('');
    setStatusFilter('');
    setTagsFilter('');
    setSearchQuery('');
  };

  const hasActiveFilters = documentTypeFilter || statusFilter || tagsFilter || searchQuery;

  const fetchSuggestedDocumentId = async (type: string) => {
    if (!token) return;
    setSuggestIdLoading(true);
    try {
      const data = await apiRequest<{ documentId: string }>(
        `/api/documents/suggest-id?documentType=${encodeURIComponent(type)}`,
        { token }
      );
      setDocumentId(data.documentId ?? '');
    } catch {
      setDocumentId('');
    } finally {
      setSuggestIdLoading(false);
    }
  };

  useEffect(() => {
    if (showCreate) fetchSuggestedDocumentId(documentType);
  }, [showCreate, documentType]);

  const columns: Column<DocumentListItem>[] = [
    { key: 'documentId', header: 'Doc ID', width: '140px' },
    { key: 'title', header: 'Title', render: (row) => stripMarkdownFormatting(row.title) },
    {
      key: 'documentType',
      header: 'Type',
      width: '140px',
      render: (row) => (
        <div className="flex items-center gap-2">
          <span>{row.documentType.replace(/_/g, ' ')}</span>
        </div>
      ),
    },
    {
      key: 'version',
      header: 'Version',
      width: '100px',
      render: (row) => `v${row.versionMajor}.${row.versionMinor}`,
    },
    {
      key: 'status',
      header: 'Status',
      width: '180px',
      render: (row) => (
        <Badge variant={statusVariant[row.status] || 'default'}>{row.status.replace(/_/g, ' ')}</Badge>
      ),
    },
    {
      key: 'updatedAt',
      header: 'Updated',
      render: (row) => new Date(row.updatedAt).toLocaleDateString(),
    },
    {
      key: 'tags',
      header: 'Tags',
      width: '200px',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.tags && row.tags.length > 0 ? (
            row.tags.slice(0, 2).map((tag, idx) => (
              <Badge key={idx} variant="neutral" className="text-xs">
                {tag}
              </Badge>
            ))
          ) : (
            <span className="text-gray-500 text-xs">—</span>
          )}
          {row.tags && row.tags.length > 2 && (
            <Badge variant="neutral" className="text-xs">
              +{row.tags.length - 2}
            </Badge>
          )}
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="Document Control"
      subtitle="Create, review, approve, and release controlled documents."
      primaryAction={{ label: 'New Document', onClick: () => setShowCreate(true) }}
    >
      {error && <p className="mb-3 text-sm text-compliance-red">{error}</p>}
      
      {/* Filters */}
      <Card padding="md" className="mb-4">
        <div className="space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Search documents by ID, title, or content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Filter Toggle */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2"
            >
              <Filter className="w-4 h-4" />
              Filters
              {hasActiveFilters && (
                <Badge variant="info" className="ml-2">
                  {[documentTypeFilter, statusFilter, tagsFilter].filter(Boolean).length}
                </Badge>
              )}
            </Button>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="flex items-center gap-2 text-gray-400 hover:text-gray-200"
              >
                <X className="w-4 h-4" />
                Clear All
              </Button>
            )}
          </div>

          {/* Filter Options */}
          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-surface-border">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Document Type</label>
                <select
                  value={documentTypeFilter}
                  onChange={(e) => setDocumentTypeFilter(e.target.value)}
                  className="w-full rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-mactech-blue"
                >
                  <option value="">All Types</option>
                  {documentTypes.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-mactech-blue"
                >
                  <option value="">All Statuses</option>
                  <option value="DRAFT">Draft</option>
                  <option value="IN_REVIEW">In Review</option>
                  <option value="APPROVED">Approved</option>
                  <option value="EFFECTIVE">Effective</option>
                  <option value="OBSOLETE">Obsolete</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Tags (comma-separated)</label>
                <Input
                  placeholder="e.g. CMMC, Quality, Safety"
                  value={tagsFilter}
                  onChange={(e) => setTagsFilter(e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>
          )}

          {/* Results Count */}
          {hasActiveFilters && (
            <div className="pt-2 border-t border-surface-border">
              <p className="text-sm text-gray-400">
                Showing {documents.length} document{documents.length !== 1 ? 's' : ''} matching filters
              </p>
            </div>
          )}
        </div>
      </Card>
      
      <Card padding="none">
        <Table
          columns={columns}
          data={documents}
          keyExtractor={(row) => row.id}
          onRowClick={(row) => navigate(`/documents/${row.id}`)}
          emptyMessage="No documents. Create one to get started."
        />
      </Card>

      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create Draft Document"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!token) return;
                setError('');
                try {
                  const data = await apiRequest<{ document: DocumentListItem }>('/api/documents', {
                    token,
                    method: 'POST',
                    body: {
                      title,
                      documentType,
                      content,
                      ...(documentId.trim() ? { documentId: documentId.trim() } : {}),
                      ...(tags.length > 0 ? { tags } : {}),
                    },
                  });
                  setShowCreate(false);
                  setTitle('');
                  setContent('');
                  setDocumentId('');
                  setDocumentType('SOP');
                  setTags([]);
                  navigate(`/documents/${data.document.id}`);
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed to create draft');
                }
              }}
            >
              Create Draft
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div>
            <label className="label-caps block mb-1.5">Document Type</label>
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
            <label className="label-caps block mb-1.5">Tags</label>
            <div className="flex flex-wrap items-center gap-2">
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
                placeholder="e.g. CMMC, Quality, Safety"
                className="flex-1 min-w-[200px]"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (!tags.includes('CMMC')) setTags([...tags, 'CMMC']);
                }}
              >
                Add CMMC Tag
              </Button>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              Enter comma-separated tags or use the button to add the CMMC tag.
            </p>
          </div>
          <div>
            <Input
              label="Document ID"
              value={documentId}
              onChange={(e) => setDocumentId(e.target.value)}
              placeholder={suggestIdLoading ? 'Loading suggestion…' : 'e.g. MAC-SOP-001'}
              disabled={suggestIdLoading}
            />
            <p className="mt-1 text-xs text-gray-400">
              Suggested when type is selected; you can edit to use a different ID.
            </p>
          </div>
          <div>
            <label className="label-caps block mb-1.5">Content</label>
            <RichTextEditor
              value={content}
              onChange={setContent}
              minHeight="240px"
              placeholder="Enter or paste content. Tables and formatting from Word/Excel are preserved."
            />
          </div>
        </div>
      </Modal>
    </PageShell>
  );
}
