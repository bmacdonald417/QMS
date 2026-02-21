import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Input, Button } from '@/components/ui';
import { PageShell } from './PageShell';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';
import { stripMarkdownFormatting } from '@/lib/format';

interface SearchDocument {
  id: string;
  documentId: string;
  title: string;
  documentType: string;
  versionMajor: number;
  versionMinor: number;
  status: string;
  tags: string[];
  author?: { id: string; firstName: string; lastName: string; email: string };
}

export function SearchPage() {
  const { token } = useAuth();
  const [query, setQuery] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [documents, setDocuments] = useState<SearchDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = () => {
    if (!token) return;
    setSearched(true);
    setLoading(true);
    const params = new URLSearchParams();
    if (query.trim()) params.set('query', query.trim());
    if (tagsInput.trim()) params.set('tags', tagsInput.trim());
    apiRequest<{ documents: SearchDocument[] }>(`/api/documents/search?${params.toString()}`, { token })
      .then((data) => setDocuments(data.documents ?? []))
      .catch(() => setDocuments([]))
      .finally(() => setLoading(false));
  };

  return (
    <PageShell title="Search Documents" subtitle="Full-text search and filter by tags">
      <Card padding="md">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="label-caps mb-1.5 block text-gray-400">Search text</label>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder="Search in document ID, title, content..."
            />
          </div>
          <div className="flex-1">
            <label className="label-caps mb-1.5 block text-gray-400">Tags (comma-separated)</label>
            <Input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g. CMMC, ISO13485"
            />
          </div>
          <Button onClick={search} disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </Button>
        </div>
      </Card>

      {searched && (
        <Card padding="md" className="mt-6">
          <h2 className="mb-4 text-lg text-white">Results</h2>
          {loading ? (
            <p className="text-gray-400">Loading...</p>
          ) : documents.length === 0 ? (
            <p className="text-gray-500">No documents found.</p>
          ) : (
            <ul className="space-y-3">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className="rounded-lg border border-surface-border bg-surface-overlay p-4 transition hover:border-mactech-blue/50"
                >
                  <Link to={`/documents/${doc.id}`} className="block">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-white">
                          {doc.documentId} v{doc.versionMajor}.{doc.versionMinor} – {stripMarkdownFormatting(doc.title)}
                        </p>
                        <p className="mt-1 text-sm text-gray-500">
                          {doc.documentType} • {doc.status.replace(/_/g, ' ')}
                        </p>
                        {doc.tags?.length ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {doc.tags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded bg-surface-elevated px-2 py-0.5 text-xs text-gray-400"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <span className="text-sm text-mactech-blue">View →</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </PageShell>
  );
}
