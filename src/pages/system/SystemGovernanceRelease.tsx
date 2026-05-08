import { useEffect, useMemo, useState } from 'react';
import { Card, Input } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';
import { ReleaseToCodexButton } from '@/components/governance/ReleaseToCodexButton';

// Bulk release surface — pick documents from the QMS-managed set and ship
// a signed manifest to Codex in one push. Single-doc release is also
// available from each Document detail page; this page is for "release N
// at a time" flows (initial onboarding, periodic audits, etc.).
//
// Pulls from /api/cmmc-control-tags/documents (already used by the
// Phase 6 control-tags surface). qms_managed source only — bundle docs
// (CmmcDocument) follow a different ingestion path.

interface ControlTag {
  controlId: string;
  coverageNote: string | null;
}

interface DocRow {
  source: 'qms_managed' | 'cmmc_bundle';
  id: string;
  code: string;
  title: string;
  kind: string;
  status: string;
  version: string | null;
  tags: ControlTag[];
}

const RELEASEABLE_STATUSES = new Set([
  'EFFECTIVE',
  'APPROVED',
  'AWAITING_APPROVAL',
  'PENDING_APPROVAL',
  'PENDING_QUALITY_RELEASE',
  'IN_REVIEW',
  'DRAFT',
]);

// Status pill styling — green for live, amber for in-flight, muted for draft.
// Mirrors the compliance palette in tailwind.config.js so the visual language is
// shared with the rest of the QMS surfaces (release readiness, governance manifest).
function statusBadgeClass(status: string): string {
  if (status === 'EFFECTIVE' || status === 'APPROVED') {
    return 'bg-compliance-green-muted text-compliance-green ring-1 ring-inset ring-compliance-green/30';
  }
  if (
    status === 'IN_REVIEW' ||
    status === 'AWAITING_APPROVAL' ||
    status === 'PENDING_APPROVAL' ||
    status === 'PENDING_QUALITY_RELEASE'
  ) {
    return 'bg-compliance-amber/10 text-compliance-amber ring-1 ring-inset ring-compliance-amber/30';
  }
  // DRAFT and anything else
  return 'bg-surface-overlay text-gray-400 ring-1 ring-inset ring-surface-border';
}

export function SystemGovernanceRelease() {
  const { token } = useAuth();
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiRequest<{ documents: DocRow[] }>(
          '/api/cmmc-control-tags/documents',
          { token },
        );
        if (!mounted) return;
        // qms_managed only — bundle docs have a different ingestion path.
        setDocs(res.documents.filter((d) => d.source === 'qms_managed'));
      } catch (e) {
        if (!mounted) return;
        const status = (e as { status?: number } | null)?.status;
        if (status === 403) setError("You don't have permission to view this page.");
        else setError('Failed to load documents.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter((d) => {
      if (!RELEASEABLE_STATUSES.has(d.status)) return false;
      if (!q) return true;
      return (
        d.code.toLowerCase().includes(q) ||
        d.title.toLowerCase().includes(q) ||
        d.tags.some((t) => t.controlId.includes(q))
      );
    });
  }, [docs, search]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAll() {
    setSelected(new Set(filtered.map((d) => d.id)));
  }
  function clearAll() {
    setSelected(new Set());
  }

  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-100">Bulk release to Codex</h1>
        <p className="mt-1 text-sm leading-relaxed text-gray-400">
          Pick QMS-managed documents and ship them as a signed governance manifest. Each
          document carries its current signature chain and lifecycle state. Codex verifies the
          envelope HMAC, persists immutably, and refreshes the OIS narrative for any
          governance-18 controls touched.
        </p>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-compliance-red/30 bg-compliance-red/10 px-4 py-2 text-sm text-compliance-red"
        >
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search code, title, or controlId…"
          className="max-w-sm"
        />
        <span className="text-sm text-gray-400" aria-live="polite">
          <span className="font-medium text-gray-200">{selected.size}</span>
          <span className="text-gray-500"> of </span>
          <span className="font-medium text-gray-200">{filtered.length}</span>
          <span className="text-gray-500"> selected ({docs.length} total)</span>
        </span>
        <button
          type="button"
          onClick={selectAll}
          className="rounded-md border border-surface-border bg-surface-elevated px-2.5 py-1 text-xs text-gray-300 transition hover:border-mactech-blue/40 hover:bg-surface-overlay hover:text-gray-100"
        >
          Select all visible
        </button>
        <button
          type="button"
          onClick={clearAll}
          disabled={selected.size === 0}
          className="rounded-md border border-surface-border bg-surface-elevated px-2.5 py-1 text-xs text-gray-300 transition hover:border-mactech-blue/40 hover:bg-surface-overlay hover:text-gray-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-surface-border disabled:hover:bg-surface-elevated disabled:hover:text-gray-300"
        >
          Clear
        </button>
        <div className="ml-auto">
          <ReleaseToCodexButton
            documentIds={selectedIds}
            variant="compact"
            label={selected.size === 0 ? 'Select docs to release' : `Release ${selected.size} to Codex`}
            disabled={selected.size === 0}
            onResult={() => clearAll()}
          />
        </div>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-surface-border">
            <thead className="bg-surface-overlay">
              <tr>
                <th scope="col" className="w-10 px-3 py-3"></th>
                <th scope="col" className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Code</th>
                <th scope="col" className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Title</th>
                <th scope="col" className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Status</th>
                <th scope="col" className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">Tagged controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                    No documents match.
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((d) => {
                  const isSelected = selected.has(d.id);
                  return (
                    <tr
                      key={d.id}
                      onClick={() => toggle(d.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-mactech-blue-muted hover:bg-mactech-blue-muted/80'
                          : 'hover:bg-surface-overlay'
                      }`}
                    >
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggle(d.id)}
                          aria-label={`Select ${d.code}`}
                          className="h-4 w-4 cursor-pointer rounded border-surface-border bg-surface-overlay text-mactech-blue accent-mactech-blue focus:ring-2 focus:ring-mactech-blue focus:ring-offset-0"
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-200">{d.code}</td>
                      <td className="px-4 py-3 text-sm">
                        <div className="font-medium text-gray-100">{d.title}</div>
                        {d.version && <div className="mt-0.5 text-[11px] text-gray-500">v{d.version}</div>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] tracking-wide ${statusBadgeClass(d.status)}`}
                        >
                          {d.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {d.tags.length === 0 ? (
                            <span className="inline-flex items-center gap-1 text-[11px] italic text-gray-500">
                              <span className="h-1 w-1 rounded-full bg-gray-600"></span>
                              untagged
                            </span>
                          ) : (
                            d.tags.map((t) => (
                              <span
                                key={t.controlId}
                                className="inline-flex items-center rounded-full bg-mactech-blue-muted px-2 py-0.5 font-mono text-[10px] font-medium text-mactech-blue ring-1 ring-inset ring-mactech-blue/20"
                              >
                                {t.controlId}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
