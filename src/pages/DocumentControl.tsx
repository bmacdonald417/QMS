import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Table, Badge, Button, Modal, Input } from '@/components/ui';
import { PageShell } from './PageShell';
import type { Column } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';

interface DocumentListItem {
  id: string;
  documentId: string;
  title: string;
  documentType: string;
  versionMajor: number;
  versionMinor: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

const statusVariant: Record<string, 'default' | 'info' | 'success' | 'warning' | 'neutral' | 'danger'> = {
  DRAFT: 'neutral',
  IN_REVIEW: 'warning',
  APPROVED: 'info',
  EFFECTIVE: 'success',
  OBSOLETE: 'default',
};

export function DocumentControl() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [documentType, setDocumentType] = useState('SOP');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');

  const fetchDocuments = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const data = await apiRequest<{ documents: DocumentListItem[] }>('/api/documents', { token });
      setDocuments(data.documents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [token]);

  const columns: Column<DocumentListItem>[] = [
    { key: 'documentId', header: 'Doc ID', width: '140px' },
    { key: 'title', header: 'Title' },
    { key: 'documentType', header: 'Type', width: '140px' },
    {
      key: 'version',
      header: 'Version',
      width: '100px',
      render: (row) => `v${row.versionMajor}.${row.versionMinor}`,
    },
    {
      key: 'status',
      header: 'Status',
      width: '180px',
      render: (row) => (
        <Badge variant={statusVariant[row.status] || 'default'}>{row.status.replace(/_/g, ' ')}</Badge>
      ),
    },
    { key: 'updatedAt', header: 'Updated', render: (row) => new Date(row.updatedAt).toLocaleDateString() },
  ];

  return (
    <PageShell
      title="Document Control"
      subtitle="Create, review, approve, and release controlled documents."
      primaryAction={{ label: 'New Document', onClick: () => setShowCreate(true) }}
    >
      {error && <p className="mb-3 text-sm text-compliance-red">{error}</p>}
      <Card padding="none">
        <Table
          columns={columns}
          data={documents}
          keyExtractor={(row) => row.id}
          onRowClick={(row) => navigate(`/documents/${row.id}`)}
          emptyMessage="No documents. Create one to get started."
        />
      </Card>

      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create Draft Document"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!token) return;
                setError('');
                try {
                  const data = await apiRequest<{ document: DocumentListItem }>('/api/documents', {
                    token,
                    method: 'POST',
                    body: { title, documentType, content },
                  });
                  setShowCreate(false);
                  setTitle('');
                  setContent('');
                  setDocumentType('SOP');
                  navigate(`/documents/${data.document.id}`);
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed to create draft');
                }
              }}
            >
              Create Draft
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div>
            <label className="label-caps block mb-1.5">Document Type</label>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-mactech-blue"
            >
              <option value="SOP">SOP</option>
              <option value="POLICY">Policy</option>
              <option value="WORK_INSTRUCTION">Work Instruction</option>
              <option value="FORM">Form</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div>
            <label className="label-caps block mb-1.5">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              className="w-full rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-mactech-blue"
              placeholder="Enter document content..."
            />
          </div>
        </div>
      </Modal>
    </PageShell>
  );
}
