import { useState } from 'react';
import { PageShell } from '../PageShell';
import { Card, Button, Badge, Table } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';
import { RefreshCw, Settings } from 'lucide-react';
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
        {/* Sync Section */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Sync Documents</h3>
            <Button
              variant="primary"
              onClick={handleSync}
              disabled={syncing}
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