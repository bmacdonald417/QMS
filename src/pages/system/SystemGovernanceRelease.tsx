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
        <h1 className="text-2xl font-semibold">Bulk release to Codex</h1>
        <p className="mt-1 text-sm text-gray-600">
          Pick QMS-managed documents and ship them as a signed governance manifest. Each
          document carries its current signature chain and lifecycle state. Codex verifies the
          envelope HMAC, persists immutably, and refreshes the OIS narrative for any
          governance-18 controls touched.
        </p>
      </header>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
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
        <span className="text-sm text-gray-500">
          {selected.size} of {filtered.length} selected ({docs.length} total)
        </span>
        <button
          type="button"
          onClick={selectAll}
          className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
        >
          Select all visible
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
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

      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-10 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500"></th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Code</th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Title</th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Status</th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Tagged controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">
                    No documents match.
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((d) => (
                  <tr key={d.id} className={selected.has(d.id) ? 'bg-blue-50/30' : ''}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(d.id)}
                        onChange={() => toggle(d.id)}
                        aria-label={`Select ${d.code}`}
                      />
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-900">{d.code}</td>
                    <td className="px-4 py-2 text-sm text-gray-900">
                      <div className="font-medium">{d.title}</div>
                      {d.version && <div className="text-[11px] text-gray-500">v{d.version}</div>}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-[11px] text-gray-700">
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {d.tags.length === 0 ? (
                          <span className="text-xs italic text-gray-400">no tags</span>
                        ) : (
                          d.tags.map((t) => (
                            <span
                              key={t.controlId}
                              className="inline-flex items-center rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-800"
                            >
                              {t.controlId}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
