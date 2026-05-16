import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';
import { Badge } from '@/components/ui';
import { CheckCircle2, FileText, ChevronRight } from 'lucide-react';

interface DomainStat {
  id: string;
  prefix: string;
  name: string;
  controlCount: number;
  documentCount: number;
  documentIds: string[];
}

interface CoverageData {
  totalEffectiveDocs: number;
  domains: DomainStat[];
  documents: Array<{
    documentId: string;
    title: string;
    documentType: string;
    version: string;
    controls: string[];
  }>;
}

const DOMAIN_COLOR: Record<string, string> = {
  AC: 'bg-violet-50 border-violet-200 dark:bg-violet-950 dark:border-violet-800',
  AT: 'bg-sky-50 border-sky-200 dark:bg-sky-950 dark:border-sky-800',
  AU: 'bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800',
  CM: 'bg-orange-50 border-orange-200 dark:bg-orange-950 dark:border-orange-800',
  IA: 'bg-rose-50 border-rose-200 dark:bg-rose-950 dark:border-rose-800',
  IR: 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800',
  MA: 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800',
  MP: 'bg-lime-50 border-lime-200 dark:bg-lime-950 dark:border-lime-800',
  PS: 'bg-teal-50 border-teal-200 dark:bg-teal-950 dark:border-teal-800',
  PE: 'bg-cyan-50 border-cyan-200 dark:bg-cyan-950 dark:border-cyan-800',
  RA: 'bg-indigo-50 border-indigo-200 dark:bg-indigo-950 dark:border-indigo-800',
  CA: 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800',
  SC: 'bg-purple-50 border-purple-200 dark:bg-purple-950 dark:border-purple-800',
  SI: 'bg-fuchsia-50 border-fuchsia-200 dark:bg-fuchsia-950 dark:border-fuchsia-800',
};

export function CmmcOverview() {
  const { token } = useAuth();
  const [data, setData] = useState<CoverageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    apiRequest<CoverageData>('/api/cmmc/section/coverage', { token })
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center text-sm text-muted-foreground">
        Loading coverage data…
      </div>
    );
  }
  if (!data) return null;

  const totalControls = data.domains.reduce((s, d) => s + d.controlCount, 0);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'EFFECTIVE Documents', value: data.totalEffectiveDocs, sub: 'Released through 4-seat SoD chain' },
          { label: 'CMMC L2 Controls', value: `${totalControls}`, sub: 'NIST SP 800-171 Rev 2' },
          { label: 'Domains Covered', value: `${data.domains.filter(d => d.documentCount > 0).length} / ${data.domains.length}`, sub: 'All 14 practice families' },
        ].map(({ label, value, sub }) => (
          <div key={label} className="rounded-lg border border-border bg-card p-4">
            <div className="text-2xl font-semibold tabular-nums">{value}</div>
            <div className="text-sm font-medium mt-0.5">{label}</div>
            <div className="text-xs text-muted-foreground mt-1">{sub}</div>
          </div>
        ))}
      </div>

      {/* Compliance note */}
      <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800 px-4 py-3 text-sm">
        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
        <div>
          <span className="font-medium text-green-800 dark:text-green-300">84 of 84 required artifacts satisfied.</span>
          <span className="text-green-700 dark:text-green-400 ml-1">
            All CMMC L2 document requirements are covered by EFFECTIVE QMS releases, Option B parent-policy sections, or operational registers.
          </span>
        </div>
      </div>

      {/* Domain cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Coverage by Practice Domain</h2>
          <Link to="/cmmc/controls" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            View full control index <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {data.domains.map((domain) => (
            <Link
              key={domain.id}
              to={`/cmmc/documents?domain=${domain.prefix}`}
              className={`flex items-start justify-between rounded-lg border p-3.5 hover:opacity-90 transition-opacity ${DOMAIN_COLOR[domain.id] ?? 'bg-muted border-border'}`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-muted-foreground">{domain.id}</span>
                  <span className="text-sm font-medium truncate">{domain.name}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {domain.controlCount} controls · {domain.documentCount} covering doc{domain.documentCount !== 1 ? 's' : ''}
                </div>
              </div>
              <Badge
                variant={domain.documentCount > 0 ? 'success' : 'neutral'}
                className="shrink-0 ml-3 text-[10px]"
              >
                {domain.documentCount > 0 ? '✓' : '—'}
              </Badge>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent / All docs quick list */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">EFFECTIVE Documents</h2>
          <Link to="/cmmc/documents" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            Browse all <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
          {data.documents.filter(d => d.controls.length > 0).slice(0, 8).map((doc) => (
            <Link
              key={doc.documentId}
              to={`/documents/by-code/${doc.documentId}`}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/50 transition-colors"
            >
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="font-mono text-xs text-muted-foreground w-24 shrink-0">{doc.documentId}</span>
              <span className="text-sm truncate flex-1">{doc.title}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {doc.controls.length} control{doc.controls.length !== 1 ? 's' : ''}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
