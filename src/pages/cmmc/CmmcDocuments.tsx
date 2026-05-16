import { useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';
import { Badge, Input } from '@/components/ui';
import { FileText, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DocRow {
  documentId: string;
  title: string;
  documentType: string;
  version: string;
  effectiveDate: string | null;
  controls: string[];
}

interface CoverageData {
  totalEffectiveDocs: number;
  domains: Array<{
    id: string;
    prefix: string;
    name: string;
    controlCount: number;
    documentCount: number;
  }>;
  documents: DocRow[];
}

const DOC_TYPE_LABEL: Record<string, string> = {
  POLICY: 'Policy',
  SOP: 'Procedure',
  SECURITY: 'Security Standard',
  INCIDENT_RESPONSE_PLAN: 'IR Plan',
  CONFIGURATION_MANAGEMENT_PLAN: 'CM Plan',
  IT_SYSTEM: 'IT / Architecture',
  SSP: 'System Security Plan',
  AUDIT_ASSESSMENT: 'Audit',
  WORK_INSTRUCTION: 'Work Instruction',
  FORM: 'Form',
  OTHER: 'Other',
};

export function CmmcDocuments() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<CoverageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const selectedDomain = searchParams.get('domain') ?? '';

  useEffect(() => {
    if (!token) return;
    apiRequest<CoverageData>('/api/cmmc/section/coverage', { token })
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.documents.filter((doc) => {
      if (selectedDomain && !doc.controls.some((c) => c.startsWith(selectedDomain + '.'))) {
        return false;
      }
      if (search) {
        const q = search.toLowerCase();
        return (
          doc.documentId.toLowerCase().includes(q) ||
          doc.title.toLowerCase().includes(q) ||
          doc.controls.some((c) => c.includes(q))
        );
      }
      return true;
    });
  }, [data, selectedDomain, search]);

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!data) return null;

  return (
    <div className="flex h-full min-h-0">
      {/* Domain filter sidebar */}
      <div className="w-52 shrink-0 border-r border-border overflow-y-auto py-4 px-3">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-2 mb-2">
          Domain
        </div>
        <button
          onClick={() => setSearchParams({})}
          className={cn(
            'w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors',
            !selectedDomain
              ? 'bg-secondary font-medium'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60',
          )}
        >
          All domains
          <span className="ml-1 text-muted-foreground text-xs">({data.documents.length})</span>
        </button>
        {data.domains.map((d) => (
          <button
            key={d.id}
            onClick={() => setSearchParams(d.documentCount > 0 ? { domain: d.prefix } : {})}
            className={cn(
              'w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors flex items-center justify-between gap-1',
              selectedDomain === d.prefix
                ? 'bg-secondary font-medium'
                : d.documentCount > 0
                  ? 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                  : 'text-muted-foreground/40 cursor-default',
            )}
          >
            <span className="truncate">
              <span className="font-mono text-[10px] mr-1">{d.id}</span>
              {d.name}
            </span>
            <span className="text-xs text-muted-foreground shrink-0">{d.documentCount}</span>
          </button>
        ))}
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {/* Search bar */}
        <div className="sticky top-0 z-10 bg-background border-b border-border px-5 py-3 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by doc ID, title, or control…"
              className="pl-8 h-8 text-sm"
            />
          </div>
          {(selectedDomain || search) && (
            <button
              onClick={() => { setSearch(''); setSearchParams({}); }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length} document{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Document list */}
        <div className="p-5 space-y-2">
          {filtered.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No documents match the current filter.
            </div>
          )}
          {filtered.map((doc) => (
            <Link
              key={doc.documentId}
              to={`/documents/by-code/${doc.documentId}`}
              className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 hover:bg-secondary/40 transition-colors group"
            >
              <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-medium text-muted-foreground">{doc.documentId}</span>
                  <Badge variant="neutral" className="text-[10px] px-1.5 py-0">
                    {DOC_TYPE_LABEL[doc.documentType] ?? doc.documentType}
                  </Badge>
                  <span className="text-xs text-muted-foreground">v{doc.version}</span>
                </div>
                <div className="text-sm font-medium mt-0.5 group-hover:text-foreground truncate">
                  {doc.title}
                </div>
                {doc.controls.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {doc.controls.slice(0, 12).map((c) => (
                      <span
                        key={c}
                        className="inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                      >
                        {c}
                      </span>
                    ))}
                    {doc.controls.length > 12 && (
                      <span className="text-[10px] text-muted-foreground">+{doc.controls.length - 12} more</span>
                    )}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
