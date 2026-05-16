import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Input } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';
import { RefreshCw, Search, Package, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Document {
  id: string;
  code: string;
  title: string;
  kind: string;
  status: string;
  reviewCadence?: string | null;
}

const STATUS_VARIANT: Record<string, 'neutral' | 'warning' | 'info' | 'success' | 'danger' | 'default'> = {
  DRAFT: 'neutral',
  IN_REVIEW: 'warning',
  EFFECTIVE: 'success',
  RETIRED: 'default',
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  IN_REVIEW: 'In Review',
  EFFECTIVE: 'Effective',
  RETIRED: 'Retired',
};

const KIND_LABEL: Record<string, string> = {
  policy: 'Policy',
  procedure: 'Procedure',
  plan: 'Plan',
  ssp: 'SSP',
  security_guide: 'Security Guide',
  assessment: 'Assessment',
  template: 'Template',
  reference: 'Reference',
  record: 'Record',
  form: 'Form',
};

export function CmmcAdminPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ summary?: { processed?: number; created?: number; updated?: number; unchanged?: number; errors?: string[] } } | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const fetchDocuments = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const data = await apiRequest<{ documents: Document[] }>('/api/cmmc/documents', { token });
      setDocuments(data.documents);
    } catch (error) {
      console.error('Failed to load documents:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleSync = async () => {
    if (!token) return;
    try {
      setSyncing(true);
      const result = await apiRequest<{ summary?: { processed?: number; created?: number; updated?: number; unchanged?: number; errors?: string[] } }>('/api/cmmc/documents/sync', {
        token,
        method: 'POST',
      });
      setSyncResult(result);
      fetchDocuments();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to sync documents';
      alert(msg);
    } finally {
      setSyncing(false);
    }
  };

  const filtered = documents.filter((doc) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return doc.code.toLowerCase().includes(q) || doc.title.toLowerCase().includes(q) || doc.kind.toLowerCase().includes(q);
  });

  return (
    <div className="p-6 max-w-5xl space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card">
            <Package className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-base font-semibold">CMMC Bundle</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sync from on-disk bundle → <code className="font-mono">cmmc_documents</code> table · new entries land as Draft
            </p>
          </div>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className={cn(
            'flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium transition-colors',
            syncing
              ? 'cursor-not-allowed text-muted-foreground'
              : 'hover:bg-secondary hover:text-foreground text-foreground',
          )}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
          {syncing ? 'Syncing…' : 'Sync Manifest & Files'}
        </button>
      </div>

      {/* Sync result banner */}
      {syncResult && (
        <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
          <div className="font-medium mb-1">Sync complete</div>
          <div className="flex gap-4 text-muted-foreground text-xs">
            <span>Processed: <span className="text-foreground font-mono">{syncResult.summary?.processed ?? 0}</span></span>
            <span>Created: <span className="text-foreground font-mono">{syncResult.summary?.created ?? 0}</span></span>
            <span>Updated: <span className="text-foreground font-mono">{syncResult.summary?.updated ?? 0}</span></span>
            <span>Unchanged: <span className="text-foreground font-mono">{syncResult.summary?.unchanged ?? 0}</span></span>
          </div>
          {(syncResult.summary?.errors?.length ?? 0) > 0 && (
            <div className="mt-1 text-xs text-red-600 dark:text-red-400">
              {syncResult.summary!.errors!.length} error{syncResult.summary!.errors!.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}

      {/* Search + table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search code, title, kind…"
              className="pl-8 h-8 text-sm"
            />
          </div>
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length} document{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Table */}
        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {documents.length === 0 ? 'No documents synced yet. Click "Sync Manifest & Files" to import.' : 'No documents match the search.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Code</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Title</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kind</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Review cadence</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((doc) => (
                <tr
                  key={doc.id}
                  className="hover:bg-secondary/40 transition-colors cursor-pointer group"
                  onClick={() => navigate(`/documents/by-code/${encodeURIComponent(doc.code)}`)}
                >
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {doc.code}
                  </td>
                  <td className="px-4 py-2.5 font-medium truncate max-w-xs">
                    {doc.title}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {KIND_LABEL[doc.kind] ?? doc.kind}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={STATUS_VARIANT[doc.status] ?? 'neutral'} className="text-[10px]">
                      {STATUS_LABEL[doc.status] ?? doc.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {doc.reviewCadence ?? '—'}
                  </td>
                  <td className="pr-3 text-muted-foreground">
                    <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
