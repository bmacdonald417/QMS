import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';

// Determinate MacTech Vault Governance Package — read-only view.
// The manifest envelope is the SAME shape we ship to codex (v1.2). This
// page renders it verbatim from the active GovernancePackageVersion row.

interface ManifestSignature {
  signer_name: string | null;
  signer_email: string | null;
  signature_meaning: string | null;
  signed_at: string | null;
  document_hash: string | null;
  signature_hash: string | null;
}

interface ManifestDocument {
  document_number: string;
  document_name: string;
  document_type: string | null;
  version: string | null;
  status: string | null;
  effective_date: string | null;
  next_review_date: string | null;
  sha256: string;
  controls_mapped: string[];
  released?: boolean;
  released_at?: string | null;
  signatures?: ManifestSignature[];
}

interface ManifestEnvelope {
  schema: string;
  generated_at: string;
  run_id: string;
  source: string;
  documents: ManifestDocument[];
  controls_touched: string[];
  doc_count: number;
  content_hash: string;
  signing_hash: string;
  release_summary?: { released_docs: number; unreleased_docs: number };
}

interface PackageVersion {
  id: string;
  versionLabel: string;
  publishedAt: string;
  publishedBy: string | null;
  contentHash: string;
  manifestEnvelope: ManifestEnvelope;
  docCount: number;
  controlsTouched: string[];
  isActive: boolean;
  notes: string | null;
}

interface VersionListItem {
  id: string;
  versionLabel: string;
  publishedAt: string;
  publishedBy: string | null;
  contentHash: string;
  docCount: number;
  controlsTouched: string[];
  isActive: boolean;
  notes: string | null;
}

export function SystemGovernancePackage() {
  const { token } = useAuth();
  const [current, setCurrent] = useState<PackageVersion | null>(null);
  const [history, setHistory] = useState<VersionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const [c, v] = await Promise.all([
          apiRequest<{ version: PackageVersion | null }>(
            '/api/governance-package/current',
            { token },
          ),
          apiRequest<{ versions: VersionListItem[] }>(
            '/api/governance-package/versions',
            { token },
          ),
        ]);
        if (!mounted) return;
        setCurrent(c.version);
        setHistory(v.versions);
      } catch (e) {
        if (!mounted) return;
        const status = (e as { status?: number } | null)?.status;
        if (status === 403) setErr("You don't have permission to view this page.");
        else setErr('Failed to load governance package.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [token]);

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading…</div>;
  if (err)
    return (
      <div className="mx-auto max-w-2xl p-8">
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {err}
        </div>
      </div>
    );

  if (!current) {
    return (
      <div className="mx-auto max-w-2xl p-8 space-y-3">
        <h1 className="text-xl font-semibold">Determinate MacTech Vault Governance Package</h1>
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No published package version yet. An admin must run{' '}
          <code className="rounded bg-white px-1.5 py-0.5">npm run db:seed-governance-package -- --label v1.0.0</code>{' '}
          on the QMS server to publish the canonical roster.
        </div>
      </div>
    );
  }

  const env = current.manifestEnvelope;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Determinate MacTech Vault Governance Package</h1>
        <p className="mt-1 text-sm text-gray-600">
          The canonical, immutable roster of documents every CMMC L2 vault carries. Future client
          onboarding will prefill content via questionnaire while keeping this document SET
          identical across every tenant.
        </p>
      </header>

      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">
              <span className="font-mono text-blue-700">{current.versionLabel}</span>
              <span className="ml-2 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                Active
              </span>
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Published {new Date(current.publishedAt).toLocaleString()}
              {current.publishedBy ? ` by ${current.publishedBy}` : ''}
            </p>
          </div>
          <div className="text-right text-xs text-gray-500">
            <div>doc_count: <span className="font-mono text-gray-800">{current.docCount}</span></div>
            <div>controls touched: <span className="font-mono text-gray-800">{current.controlsTouched.length}</span></div>
          </div>
        </div>
        {current.notes && <p className="mt-3 text-sm text-gray-700">{current.notes}</p>}
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="font-semibold uppercase tracking-wide text-gray-500">Package contentHash</dt>
            <dd className="font-mono text-gray-800 break-all">{current.contentHash}</dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wide text-gray-500">Envelope content_hash</dt>
            <dd className="font-mono text-gray-800 break-all">{env.content_hash}</dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wide text-gray-500">Envelope schema</dt>
            <dd className="font-mono text-gray-800">{env.schema}</dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wide text-gray-500">Envelope run_id</dt>
            <dd className="font-mono text-gray-800 break-all">{env.run_id}</dd>
          </div>
          {env.release_summary && (
            <div className="sm:col-span-2">
              <dt className="font-semibold uppercase tracking-wide text-gray-500">Release summary</dt>
              <dd className="text-gray-800">
                {env.release_summary.released_docs} released · {env.release_summary.unreleased_docs} unreleased
              </dd>
            </div>
          )}
        </dl>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-semibold">Canonical document roster</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            {env.documents.length} documents — frozen at publish time. The same set every tenant carries.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Document #</th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Title</th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Type</th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Version</th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Released</th>
                <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Controls mapped</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {env.documents.map((d) => (
                <tr key={d.document_number}>
                  <td className="px-4 py-2 font-mono text-xs text-gray-900">{d.document_number}</td>
                  <td className="px-4 py-2 text-sm text-gray-900">{d.document_name}</td>
                  <td className="px-4 py-2 text-xs uppercase text-gray-700">{d.document_type ?? '—'}</td>
                  <td className="px-4 py-2 text-xs text-gray-700">{d.version ?? '—'}</td>
                  <td className="px-4 py-2 text-xs">
                    {d.released ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                        Released
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">
                        Unreleased
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {d.controls_mapped.length === 0 ? (
                        <span className="italic text-xs text-gray-400">—</span>
                      ) : (
                        d.controls_mapped.map((c) => (
                          <span
                            key={c}
                            className="inline-flex items-center rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-800"
                          >
                            {c}
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
      </div>

      {history.length > 1 && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-3">
            <h2 className="text-sm font-semibold">Version history</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Once published, a version is immutable. New versions are PUBLISHED — never mutated.
            </p>
          </div>
          <ul className="divide-y divide-gray-50">
            {history.map((v) => (
              <li key={v.id} className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-3">
                <div>
                  <span className="font-mono text-sm font-medium text-gray-900">{v.versionLabel}</span>
                  {v.isActive && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                      Active
                    </span>
                  )}
                  <span className="ml-3 text-xs text-gray-500">
                    {new Date(v.publishedAt).toLocaleString()}
                    {v.publishedBy ? ` · ${v.publishedBy}` : ''}
                  </span>
                </div>
                <div className="text-xs text-gray-600">
                  {v.docCount} docs · {v.controlsTouched.length} controls
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
