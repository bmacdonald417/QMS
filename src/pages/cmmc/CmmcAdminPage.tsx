import { useState, useRef, useEffect } from 'react';
import { PageShell } from '../PageShell';
import { Card, Button, Badge, Table } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { apiRequest, apiUrl } from '@/lib/api';
import { RefreshCw, Upload, CheckCircle, AlertCircle } from 'lucide-react';
import type { Column } from '@/components/ui';

interface Document {
  id: string;
  code: string;
  title: string;
  kind: string;
  status: string;
  reviewCadence?: string | null;
}

export function CmmcAdminPage() {
  const { token } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [bundleStatus, setBundleStatus] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSync = async () => {
    if (!token) return;

    try {
      setSyncing(true);
      const result = await apiRequest('/api/cmmc/documents/sync', {
        token,
        method: 'POST',
      });
      setSyncResult(result);
      // Refresh documents list
      fetchDocuments();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to sync documents');
    } finally {
      setSyncing(false);
    }
  };

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

  const updateStatus = async (code: string, status: string) => {
    if (!token) return;

    try {
      await apiRequest(`/api/cmmc/documents/${code}/status`, {
        token,
        method: 'PATCH',
        body: { status },
      });
      fetchDocuments();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to update status');
    }
  };

  const fetchBundleStatus = async () => {
    if (!token) return;

    try {
      const status = await apiRequest<{ hasBundle: boolean; bundlePath: string | null; manifestExists: boolean }>(
        '/api/cmmc/bundle/status',
        { token }
      );
      setBundleStatus(status);
    } catch (error) {
      console.error('Failed to fetch bundle status:', error);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !token) return;

    if (!file.name.endsWith('.zip')) {
      alert('Please select a ZIP file');
      return;
    }

    try {
      setUploading(true);
      setUploadResult(null);

      const formData = new FormData();
      formData.append('bundle', file);

      const response = await fetch(`${apiUrl}/api/cmmc/bundle/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || error.error || 'Failed to upload bundle');
      }

      const result = await response.json();
      setUploadResult(result);
      fetchBundleStatus();
      
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to upload bundle');
    } finally {
      setUploading(false);
    }
  };

  // Fetch bundle status on mount
  useEffect(() => {
    if (token) {
      fetchBundleStatus();
    }
  }, [token]);

  const columns: Column<Document>[] = [
    { key: 'code', header: 'Code' },
    { key: 'title', header: 'Title' },
    { key: 'kind', header: 'Kind' },
    {
      key: 'status',
      header: 'Status',
      render: (doc) => (
        <select
          className="rounded border border-surface-border bg-surface-elevated px-2 py-1 text-sm text-gray-100"
          value={doc.status}
          onChange={(e) => updateStatus(doc.code, e.target.value)}
        >
          <option value="DRAFT">Draft</option>
          <option value="IN_REVIEW">In Review</option>
          <option value="EFFECTIVE">Effective</option>
          <option value="RETIRED">Retired</option>
        </select>
      ),
    },
    { key: 'reviewCadence', header: 'Review Cadence' },
  ];

  return (
    <PageShell
      title="CMMC Admin"
      subtitle="Manage CMMC document registry and sync"
    >
      <div className="space-y-6">
        {/* Bundle Upload Section */}
        <Card>
          <h3 className="text-lg font-semibold text-white mb-4">Upload CMMC Bundle</h3>
          
          {bundleStatus && (
            <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 ${
              bundleStatus.hasBundle && bundleStatus.manifestExists
                ? 'bg-green-500/10 border border-green-500/30'
                : 'bg-yellow-500/10 border border-yellow-500/30'
            }`}>
              {bundleStatus.hasBundle && bundleStatus.manifestExists ? (
                <>
                  <CheckCircle className="w-5 h-5 text-green-400" />
                  <span className="text-sm text-green-300">Bundle loaded and ready</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-5 h-5 text-yellow-400" />
                  <span className="text-sm text-yellow-300">No bundle uploaded yet</span>
                </>
              )}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Select CMMC Bundle ZIP File
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                onChange={handleFileSelect}
                disabled={uploading}
                className="block w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-mactech-blue file:text-white hover:file:bg-mactech-blue-hover file:cursor-pointer disabled:opacity-50"
              />
              <p className="mt-1 text-xs text-gray-400">
                Upload a ZIP file containing the CMMC Governing Records bundle (must include qms-ingest-manifest.json)
              </p>
            </div>

            {uploadResult && (
              <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                  <span className="text-sm font-medium text-green-300">Upload successful</span>
                </div>
                <p className="text-xs text-gray-400">{uploadResult.message}</p>
              </div>
            )}

            {uploading && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Uploading and extracting bundle...</span>
              </div>
            )}
          </div>
        </Card>

        {/* Sync Section */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Sync Documents</h3>
            <Button
              variant="primary"
              onClick={handleSync}
              disabled={syncing || !bundleStatus?.hasBundle}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Manifest & Files'}
            </Button>
          </div>

          {syncResult && (
            <div className="mt-4 p-4 bg-surface-elevated rounded-lg">
              <div className="text-sm text-gray-300">
                <div>Processed: {syncResult.summary?.processed || 0}</div>
                <div>Created: {syncResult.summary?.created || 0}</div>
                <div>Updated: {syncResult.summary?.updated || 0}</div>
                {syncResult.summary?.errors?.length > 0 && (
                  <div className="mt-2 text-red-400">
                    Errors: {syncResult.summary.errors.length}
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* Documents List */}
        <Card>
          <h3 className="text-lg font-semibold text-white mb-4">Documents</h3>
          {loading ? (
            <div className="text-center py-12 text-gray-400">Loading...</div>
          ) : (
            <Table
              data={documents}
              columns={columns}
              keyExtractor={(doc) => doc.id}
              emptyMessage="No documents found"
            />
          )}
        </Card>
      </div>
    </PageShell>
  );
}