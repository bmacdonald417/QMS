import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';

type Preview = {
  documents_in_manifest: number;
  governance_documents: number;
  supporting_documents: number;
  unique_controls_in_manifest: number;
  overdue_for_review: string[];
};

type SspStatus = {
  verified: boolean;
  document_number?: string;
  version?: string | null;
  sha256?: string | null;
  file_path?: string | null;
  banner?: { title: string; body: string };
  message?: string;
};

export function SystemGovernanceManifest() {
  const { token } = useAuth();
  const [jsonText, setJsonText] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [ingestResult, setIngestResult] = useState<Record<string, unknown> | null>(null);
  const [ingestErr, setIngestErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ssp, setSsp] = useState<SspStatus | null>(null);

  const loadSsp = useCallback(async () => {
    try {
      const data = await apiRequest<SspStatus>('/api/governance/ssp-manifest-status', { token });
      setSsp(data);
    } catch {
      setSsp({ verified: false, message: 'Could not load SSP status' });
    }
  }, [token]);

  useEffect(() => {
    loadSsp();
  }, [loadSsp]);

  const runPreview = async () => {
    setPreviewErr(null);
    setPreview(null);
    let body: unknown;
    try {
      body = JSON.parse(jsonText);
    } catch {
      setPreviewErr('Invalid JSON');
      return;
    }
    setLoading(true);
    try {
      const data = await apiRequest<Preview>('/api/governance/manifest-preview', {
        token,
        method: 'POST',
        body,
      });
      setPreview(data);
    } catch (e) {
      setPreviewErr(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setLoading(false);
    }
  };

  const runIngest = async () => {
    setIngestErr(null);
    setIngestResult(null);
    let body: unknown;
    try {
      body = JSON.parse(jsonText);
    } catch {
      setIngestErr('Invalid JSON');
      return;
    }
    setLoading(true);
    try {
      const data = await apiRequest<unknown>('/api/governance/ingest-manifest', {
        token,
        method: 'POST',
        body,
      });
      setIngestResult(data as Record<string, unknown>);
      loadSsp();
    } catch (e) {
      setIngestErr(e instanceof Error ? e.message : 'Ingest failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-100">Governance manifest (Trust Codex)</h1>
        <p className="mt-1 text-sm text-gray-400">
          Paste <code className="text-gray-300">governance-manifest.json</code> (hashes only — no document upload). Preview
          counts governance vs supporting documents and overdue reviews; ingest records hashes and control links.
        </p>
      </div>

      {ssp?.verified && ssp.banner && (
        <div className="rounded-lg border border-sky-800 bg-sky-950/40 p-4 text-sm text-sky-100">
          <p className="font-medium text-sky-200">{ssp.banner.title}</p>
          <p className="mt-2 whitespace-pre-wrap text-sky-100/90">{ssp.banner.body}</p>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-300">Manifest JSON</label>
        <textarea
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          rows={14}
          className="w-full rounded-md border border-border bg-card px-3 py-2 font-mono text-xs text-gray-200"
          placeholder='{"schema":"mactech-governance-manifest.v1", ...}'
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={runPreview}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          Preview
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={runIngest}
          className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-gray-200 hover:bg-secondary disabled:opacity-50"
        >
          Ingest manifest
        </button>
      </div>

      {previewErr && <p className="text-sm text-red-400">{previewErr}</p>}
      {ingestErr && <p className="text-sm text-red-400">{ingestErr}</p>}

      {preview && (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-gray-200">
          <p className="font-medium text-gray-100">Preview</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-gray-300">
            <li>Documents in manifest: {preview.documents_in_manifest}</li>
            <li>
              Governance documents (policy, procedure, plan, ssp, security_guide): {preview.governance_documents}
            </li>
            <li>Supporting documents (template, reference, assessment, form, record, scope, …): {preview.supporting_documents}</li>
            <li>Controls to be linked (unique, governance docs only): {preview.unique_controls_in_manifest}</li>
            <li>
              Overdue for review: {preview.overdue_for_review.length}
              {preview.overdue_for_review.length > 0 && (
                <span className="text-amber-400"> — {preview.overdue_for_review.join(', ')}</span>
              )}
            </li>
          </ul>
        </div>
      )}

      {ingestResult != null && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium text-gray-100">Ingest result</p>
          <pre className="mt-2 max-h-96 overflow-auto text-xs text-gray-300">{JSON.stringify(ingestResult, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
