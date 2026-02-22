import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Table, Badge, Button, Input } from '@/components/ui';
import { PageShell } from '../PageShell';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';
import { Search, Filter, FileText } from 'lucide-react';
import type { Column } from '@/components/ui';

interface CmmcDocument {
  code: string;
  title: string;
  kind: string;
  path: string;
  qmsDocType: string;
  reviewCadence?: string | null;
  status: string;
  latestRevision?: {
    revisionLabel: string;
    date: string;
  } | null;
  _count?: {
    signatures: number;
  };
}

interface CategoryGroup {
  [category: string]: Array<{
    code: string;
    title: string;
    kind: string;
    path: string;
    qms_doc_type: string;
    review_cadence?: string | null;
    status: string;
    latestRevision?: any;
  }>;
}

export function CmmcDocumentRegistry() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [documents, setDocuments] = useState<CmmcDocument[]>([]);
  const [categories, setCategories] = useState<CategoryGroup>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'category'>('category');

  const fetchDocuments = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (kindFilter) params.append('kind', kindFilter);
      if (statusFilter) params.append('status', statusFilter);

      const data = await apiRequest<{ documents: CmmcDocument[] }>(
        `/api/cmmc/documents?${params.toString()}`,
        { token }
      );
      setDocuments(data.documents);
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchByCategory = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const data = await apiRequest<{ categories: CategoryGroup }>(
        '/api/cmmc/documents/by-category',
        { token }
      );
      setCategories(data.categories);
    } catch (err) {
      console.error('Failed to load documents by category:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'list') {
      fetchDocuments();
    } else {
      fetchByCategory();
    }
  }, [token, viewMode, search, kindFilter, statusFilter]);

  const statusVariant: Record<string, 'default' | 'info' | 'success' | 'warning' | 'neutral' | 'danger'> = {
    DRAFT: 'neutral',
    IN_REVIEW: 'warning',
    EFFECTIVE: 'success',
    RETIRED: 'default',
  };

  const getCategoryName = (cat: string) => {
    const names: Record<string, string> = {
      '01-system-scope': 'System Scope',
      '02-policies-and-procedures': 'Policies & Procedures',
      '04-self-assessment': 'Self Assessment',
      '05-evidence': 'Evidence',
      '06-supporting-documents': 'Supporting Documents',
      tables: 'Tables',
    };
    return names[cat] || cat;
  };

  const columns: Column<CmmcDocument>[] = [
    { key: 'code', header: 'Code', width: '140px' },
    { key: 'title', header: 'Title' },
    { key: 'kind', header: 'Kind', width: '120px' },
    {
      key: 'status',
      header: 'Status',
      width: '120px',
      render: (row) => <Badge variant={statusVariant[row.status] || 'default'}>{row.status}</Badge>,
    },
    {
      key: 'revision',
      header: 'Revision',
      width: '100px',
      render: (row) => row.latestRevision?.revisionLabel || '—',
    },
    {
      key: 'actions',
      header: '',
      width: '100px',
      render: (row) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/cmmc/docs/${row.code}`)}
        >
          View
        </Button>
      ),
    },
  ];

  const filteredDocuments = documents.filter((doc) => {
    if (search) {
      const searchLower = search.toLowerCase();
      if (
        !doc.code.toLowerCase().includes(searchLower) &&
        !doc.title.toLowerCase().includes(searchLower)
      ) {
        return false;
      }
    }
    return true;
  });

  return (
    <PageShell
      title="CMMC Governing Records"
      subtitle="Controlled documents for CMMC 2.0 Level 2 compliance"
    >
      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-64 flex-shrink-0">
          <Card variant="bordered" padding="md">
            <div className="space-y-4">
              <div>
                <label className="label-caps block mb-2">View Mode</label>
                <div className="flex gap-2">
                  <Button
                    variant={viewMode === 'category' ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('category')}
                  >
                    Category
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('list')}
                  >
                    List
                  </Button>
                </div>
              </div>

              <div>
                <label className="label-caps block mb-2">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Code or title..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <label className="label-caps block mb-2">Kind</label>
                <select
                  className="w-full rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-gray-100"
                  value={kindFilter}
                  onChange={(e) => setKindFilter(e.target.value)}
                >
                  <option value="">All</option>
                  <option value="policy">Policy</option>
                  <option value="procedure">Procedure</option>
                  <option value="plan">Plan</option>
                  <option value="form">Form</option>
                  <option value="scope">Scope</option>
                </select>
              </div>

              <div>
                <label className="label-caps block mb-2">Status</label>
                <select
                  className="w-full rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-gray-100"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">All</option>
                  <option value="DRAFT">Draft</option>
                  <option value="IN_REVIEW">In Review</option>
                  <option value="EFFECTIVE">Effective</option>
                  <option value="RETIRED">Retired</option>
                </select>
              </div>
            </div>
          </Card>
        </div>

        {/* Main Content */}
        <div className="flex-1">
          {viewMode === 'list' ? (
            <Card>
              {loading ? (
                <div className="text-center py-12 text-gray-400">Loading...</div>
              ) : (
                <Table
                  data={filteredDocuments}
                  columns={columns}
                  keyExtractor={(doc) => doc.code}
                  emptyMessage="No documents found"
                />
              )}
            </Card>
          ) : (
            <div className="space-y-6">
              {Object.entries(categories).map(([category, docs]) => (
                <Card key={category}>
                  <h3 className="text-lg font-medium text-white mb-4">
                    {getCategoryName(category)}
                  </h3>
                  <div className="space-y-2">
                    {docs.map((doc) => (
                      <div
                        key={doc.code}
                        className="flex items-center justify-between p-3 rounded-lg border border-surface-border hover:bg-surface-elevated cursor-pointer"
                        onClick={() => navigate(`/cmmc/docs/${doc.code}`)}
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-gray-400" />
                          <div>
                            <div className="font-medium text-white">{doc.code}</div>
                            <div className="text-sm text-gray-400">{doc.title}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant={statusVariant[doc.status] || 'default'}>
                            {doc.status}
                          </Badge>
                          {doc.latestRevision && (
                            <span className="text-sm text-gray-500">
                              v{doc.latestRevision.revisionLabel}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}