import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button, Input } from '@/components/ui';
import { GovernanceApprovalPanel } from '@/components/modules/compliance/GovernanceApprovalPanel';
import { PageShell } from './PageShell';
import { useAuth } from '@/context/AuthContext';
import { apiRequest, apiUrl } from '@/lib/api';

interface FormRecordDetail {
  id: string;
  recordNumber: string;
  templateCode: string;
  title: string;
  status: string;
  payload: Record<string, unknown>;
  relatedEntityType: string;
  relatedEntityId: string;
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
  templateDocument: { id: string; documentId: string; title: string; versionMajor: number; versionMinor: number };
  createdBy: { id: string; firstName: string; lastName: string } | null;
  updatedBy: { id: string; firstName: string; lastName: string } | null;
  finalizedBy: { id: string; firstName: string; lastName: string } | null;
}

function payloadToEntries(payload: Record<string, unknown> | null): [string, string][] {
  if (!payload || typeof payload !== 'object') return [];
  return Object.entries(payload).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v ?? '')]);
}

function entriesToPayload(entries: [string, string][]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of entries) {
    if (k.trim() === '') continue;
    out[k.trim()] = v;
  }
  return out;
}

export function CompletedFormDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [record, setRecord] = useState<FormRecordDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fieldEntries, setFieldEntries] = useState<[string, string][]>([]);
  const [title, setTitle] = useState('');
  const [saveSubmitting, setSaveSubmitting] = useState(false);
  const [finalizeSubmitting, setFinalizeSubmitting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const fetchRecord = async () => {
    if (!token || !id) return;
    try {
      setLoading(true);
      const data = await apiRequest<{ record: FormRecordDetail }>(`/api/form-records/${id}`, { token });
      setRecord(data.record);
      setTitle(data.record.title);
      setFieldEntries(payloadToEntries(data.record.payload as Record<string, unknown>));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load form record');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecord();
  }, [token, id]);

  const isDraft = record?.status === 'DRAFT';

  const handleSaveDraft = async () => {
    if (!token || !id || !record) return;
    setSaveSubmitting(true);
    setError('');
    try {
      await apiRequest(`/api/form-records/${id}`, {
        token,
        method: 'PUT',
        body: { title: title.trim(), payload: entriesToPayload(fieldEntries) },
      });
      await fetchRecord();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaveSubmitting(false);
    }
  };

  const handleFinalize = async () => {
    if (!token || !id) return;
    setFinalizeSubmitting(true);
    setError('');
    try {
      await apiRequest(`/api/form-records/${id}/finalize`, {
        token,
        method: 'POST',
        body: { approvalTrail: [], payload: entriesToPayload(fieldEntries) },
      });
      await fetchRecord();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to finalize');
    } finally {
      setFinalizeSubmitting(false);
    }
  };

  const handleExportPdf = async () => {
    if (!token || !id) return;
    setExportingPdf(true);
    try {
      const url = apiUrl(`/api/form-records/${id}/pdf`);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(res.status === 401 ? 'Unauthorized' : 'Failed to export PDF');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `form-record-${record?.recordNumber ?? id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export PDF');
    } finally {
      setExportingPdf(false);
    }
  };

  const addField = () => setFieldEntries((e) => [...e, ['', '']]);
  const updateField = (index: number, keyOrValue: 0 | 1, value: string) => {
    setFieldEntries((entries) => {
      const next = [...entries];
      if (!next[index]) next[index] = ['', ''];
      next[index] = keyOrValue === 0 ? [value, next[index][1]] : [next[index][0], value];
      return next;
    });
  };
  const removeField = (index: number) => setFieldEntries((e) => e.filter((_, i) => i !== index));

  if (loading) return <PageShell title="Completed Form"><p className="text-gray-400">Loading…</p></PageShell>;
  if (error && !record) return <PageShell title="Completed Form"><p className="text-compliance-red">{error}</p></PageShell>;
  if (!record) return <PageShell title="Completed Form"><p className="text-gray-400">Not found</p></PageShell>;

  return (
    <PageShell
      title={record.title}
      subtitle={`${record.templateCode} – ${record.recordNumber} | ${record.status}`}
      backLink={{ label: 'Completed Forms', href: '/completed-forms' }}
    >
      {error && <p className="mb-3 text-sm text-compliance-red">{error}</p>}

      <Card padding="md" className="mb-4">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-gray-400">Template:</span>
          <button
            type="button"
            onClick={() => navigate(`/documents/${record.templateDocument.id}`)}
            className="text-mactech-blue hover:underline"
          >
            {record.templateDocument.documentId} – {record.templateDocument.title} (v{record.templateDocument.versionMajor}.{record.templateDocument.versionMinor})
          </button>
          <span className="text-gray-400">|</span>
          <span className="text-gray-400">Created: {new Date(record.createdAt).toLocaleString()}</span>
          {record.finalizedAt && (
            <span className="text-gray-400">Finalized: {new Date(record.finalizedAt).toLocaleString()}</span>
          )}
        </div>
      </Card>

      <GovernanceApprovalPanel
        approvalUrl={`/api/form-records/${id}/governance-approval`}
        token={token}
        title="Governance Approval"
      />

      <Card padding="md" className="mb-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg text-white">Field values</h2>
          {isDraft && <Button size="sm" variant="secondary" onClick={addField}>Add field</Button>}
        </div>

        {isDraft && (
          <div className="mb-4">
            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        )}

        {!isDraft && <p className="mb-3 text-sm text-gray-400">Read-only (finalized)</p>}

        <div className="space-y-2">
          {fieldEntries.length === 0 && (
            <p className="text-sm text-gray-500">No fields. {isDraft ? 'Add a field above.' : ''}</p>
          )}
          {fieldEntries.map(([key, val], index) => (
            <div key={index} className="flex gap-2 items-center">
              <Input
                placeholder="Key"
                value={key}
                onChange={(e) => updateField(index, 0, e.target.value)}
                disabled={!isDraft}
                className="flex-1"
              />
              <Input
                placeholder="Value"
                value={val}
                onChange={(e) => updateField(index, 1, e.target.value)}
                disabled={!isDraft}
                className="flex-1"
              />
              {isDraft && (
                <Button variant="secondary" size="sm" onClick={() => removeField(index)}>Remove</Button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {isDraft && (
            <>
              <Button onClick={handleSaveDraft} disabled={saveSubmitting}>
                {saveSubmitting ? 'Saving…' : 'Save draft'}
              </Button>
              <Button variant="success" onClick={handleFinalize} disabled={finalizeSubmitting}>
                {finalizeSubmitting ? 'Finalizing…' : 'Finalize'}
              </Button>
            </>
          )}
          <Button variant="secondary" onClick={handleExportPdf} disabled={exportingPdf}>
            {exportingPdf ? 'Exporting…' : 'Export PDF'}
          </Button>
        </div>
      </Card>
    </PageShell>
  );
}
