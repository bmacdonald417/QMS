import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, Button, Input, Badge, Modal } from '@/components/ui';
import { PageShell } from '@/pages/PageShell';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';

// Phase 6 admin surface — populates the codex-contract junctions
// (document_cmmc_control_tags / cmmc_document_control_tags).
// Backed by /api/cmmc-control-tags. Admin / System Admin gated.

type Source = 'qms_managed' | 'cmmc_bundle';

interface ControlTag {
  controlId: string;
  coverageNote: string | null;
  createdAt: string;
}

interface DocRow {
  source: Source;
  id: string;
  code: string;
  title: string;
  kind: string;
  status: string;
  version: string | null;
  tags: ControlTag[];
}

interface Control {
  controlId: string;
  family: string;
  title: string;
}

const SOURCE_LABELS: Record<Source, string> = {
  qms_managed: 'QMS-managed',
  cmmc_bundle: 'CMMC bundle',
};

export default function CmmcControlTags() {
  const { token } = useAuth();
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [controls, setControls] = useState<Control[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | Source>('all');
  const [tagModal, setTagModal] = useState<DocRow | null>(null);
  const [pickedControl, setPickedControl] = useState<string>('');
  const [coverageNote, setCoverageNote] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [docsRes, ctrlRes] = await Promise.all([
        apiRequest<{ documents: DocRow[] }>('/api/cmmc-control-tags/documents', { token }),
        apiRequest<{ controls: Control[] }>('/api/cmmc-control-tags/controls', { token }),
      ]);
      setDocs(docsRes.documents);
      setControls(ctrlRes.controls);
    } catch (err) {
      const status = (err as { status?: number } | null)?.status;
      if (status === 403) setError("You don't have permission to view this page.");
      else setError('Failed to load tagging data.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    reload();
  }, [reload]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter((d) => {
      if (sourceFilter !== 'all' && d.source !== sourceFilter) return false;
      if (!q) return true;
      return (
        d.code.toLowerCase().includes(q) ||
        d.title.toLowerCase().includes(q) ||
        d.kind.toLowerCase().includes(q) ||
        d.tags.some((t) => t.controlId.includes(q))
      );
    });
  }, [docs, search, sourceFilter]);

  function openAddTag(doc: DocRow) {
    setTagModal(doc);
    setPickedControl('');
    setCoverageNote('');
  }

  async function submitAdd() {
    if (!tagModal || !pickedControl) return;
    setBusy(true);
    try {
      await apiRequest('/api/cmmc-control-tags', {
        token,
        method: 'POST',
        body: {
          source: tagModal.source,
          docId: tagModal.id,
          controlId: pickedControl,
          coverageNote: coverageNote.trim() || undefined,
        },
      });
      setTagModal(null);
      await reload();
    } catch (err) {
      const status = (err as { status?: number } | null)?.status;
      if (status === 403) setError("You don't have permission to add tags.");
      else setError('Failed to add tag.');
    } finally {
      setBusy(false);
    }
  }

  async function removeTag(doc: DocRow, controlId: string) {
    if (!confirm(`Remove control ${controlId} from ${doc.code}?`)) return;
    setBusy(true);
    try {
      await apiRequest('/api/cmmc-control-tags', {
        token,
        method: 'DELETE',
        body: { source: doc.source, docId: doc.id, controlId },
      });
      await reload();
    } catch (err) {
      const status = (err as { status?: number } | null)?.status;
      if (status === 403) setError("You don't have permission to remove tags.");
      else setError('Failed to remove tag.');
    } finally {
      setBusy(false);
    }
  }

  // Pre-compute which control IDs the picked doc already has, so the dropdown
  // can hide them.
  const usedControls = useMemo(
    () => new Set(tagModal ? tagModal.tags.map((t) => t.controlId) : []),
    [tagModal]
  );
  const availableControls = controls.filter((c) => !usedControls.has(c.controlId));

  return (
    <PageShell
      title="CMMC Control Tags"
      subtitle="Map documents to the 17 pure-governance NIST 800-171 R2 controls. Codex's adjudication engine reads these tags via the /api/v1/cmmc contract."
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code, title, kind, or controlId…"
            className="max-w-sm"
          />
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as 'all' | Source)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="all">All sources</option>
            <option value="qms_managed">QMS-managed only</option>
            <option value="cmmc_bundle">CMMC bundle only</option>
          </select>
          <span className="text-sm text-gray-500">
            {filtered.length} of {docs.length} docs
          </span>
        </div>

        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Source
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Code
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Title
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Kind
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Control tags
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {loading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-500">
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-500">
                      No documents match.
                    </td>
                  </tr>
                )}
                {!loading &&
                  filtered.map((d) => (
                    <tr key={`${d.source}:${d.id}`}>
                      <td className="px-4 py-2 text-xs text-gray-500">
                        {SOURCE_LABELS[d.source]}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-900">{d.code}</td>
                      <td className="px-4 py-2 text-sm text-gray-900">
                        <div className="font-medium">{d.title}</div>
                        {d.version && (
                          <div className="text-xs text-gray-500">v{d.version}</div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs uppercase text-gray-600">{d.kind}</td>
                      <td className="px-4 py-2">
                        <Badge variant="default">{d.status}</Badge>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1.5">
                          {d.tags.length === 0 && (
                            <span className="text-xs italic text-gray-400">no tags</span>
                          )}
                          {d.tags.map((t) => (
                            <span
                              key={t.controlId}
                              className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800"
                              title={t.coverageNote ?? undefined}
                            >
                              {t.controlId}
                              <button
                                type="button"
                                onClick={() => removeTag(d, t.controlId)}
                                disabled={busy}
                                className="ml-0.5 text-blue-500 hover:text-blue-700 disabled:opacity-50"
                                aria-label={`Remove ${t.controlId}`}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openAddTag(d)}
                          disabled={busy}
                        >
                          Add tag
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Modal
        isOpen={!!tagModal}
        onClose={() => setTagModal(null)}
        title={tagModal ? `Tag "${tagModal.code}" with a control` : 'Tag document'}
      >
        {tagModal && (
          <div className="space-y-4">
            <div className="text-sm text-gray-600">
              <div className="font-medium text-gray-900">{tagModal.title}</div>
              <div className="text-xs text-gray-500">
                {SOURCE_LABELS[tagModal.source]} · {tagModal.kind}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
                Control
              </label>
              <select
                value={pickedControl}
                onChange={(e) => setPickedControl(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">— Pick a control —</option>
                {availableControls.map((c) => (
                  <option key={c.controlId} value={c.controlId}>
                    {c.controlId} ({c.family}) — {c.title}
                  </option>
                ))}
              </select>
              {availableControls.length === 0 && (
                <p className="mt-1 text-xs text-amber-700">
                  This document is already tagged for every governance control.
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600">
                Coverage note <span className="font-normal normal-case text-gray-400">(optional)</span>
              </label>
              <textarea
                value={coverageNote}
                onChange={(e) => setCoverageNote(e.target.value)}
                placeholder='e.g. "Section 4.2 covers SoD enforcement"'
                rows={3}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Surfaces in the codex contract as <code>control_coverage_note</code>.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setTagModal(null)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={submitAdd}
                disabled={busy || !pickedControl}
              >
                {busy ? 'Saving…' : 'Add tag'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </PageShell>
  );
}
