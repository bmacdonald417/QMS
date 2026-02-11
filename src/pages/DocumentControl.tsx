import { useState } from 'react';
import { Card, Table, Badge, Button, Modal } from '@/components/ui';
import { PageShell } from './PageShell';
import { AuditTrailPanel } from '@/components/modules/compliance';
import { SignatureModal } from '@/components/modules/compliance';
import { useQmsStore } from '@/store/useQmsStore';
import type { DocumentRecord } from '@/lib/schemas';
import type { AuditTrailEntry } from '@/types/audit';
import type { Column } from '@/components/ui';

const statusVariant: Record<string, 'default' | 'info' | 'success' | 'warning' | 'neutral'> = {
  draft: 'neutral',
  review: 'warning',
  approved: 'success',
  retired: 'default',
};

const sampleDocs: DocumentRecord[] = [
  {
    id: 'doc-1',
    title: 'SOP-QA-001 Quality System',
    docNumber: 'SOP-QA-001',
    version: '2.0',
    status: 'approved',
    owner: 'J. Smith',
    effectiveDate: '2024-01-15T00:00:00Z',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-10T00:00:00Z',
  },
  {
    id: 'doc-2',
    title: 'SOP-DEV-002 Change Control',
    docNumber: 'SOP-DEV-002',
    version: '1.0',
    status: 'review',
    owner: 'A. Jones',
    createdAt: '2024-02-01T00:00:00Z',
    updatedAt: '2024-02-05T00:00:00Z',
  },
];

export function DocumentControl() {
  const [showSignature, setShowSignature] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const { documents, setDocuments, auditTrail } = useQmsStore();
  const data = documents.length ? documents : sampleDocs;

  const columns: Column<DocumentRecord>[] = [
    { key: 'docNumber', header: 'Doc #', width: '120px' },
    { key: 'title', header: 'Title' },
    { key: 'version', header: 'Ver.', width: '80px' },
    {
      key: 'status',
      header: 'Status',
      width: '100px',
      render: (row) => <Badge variant={statusVariant[row.status]}>{row.status}</Badge>,
    },
    { key: 'owner', header: 'Owner', width: '100px' },
    {
      key: 'actions',
      header: '',
      width: '140px',
      render: (row) => (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShowPdfModal(true)}>
            View PDF
          </Button>
          {row.status === 'review' && (
            <Button size="sm" variant="success" onClick={() => setShowSignature(true)}>
              Sign
            </Button>
          )}
        </div>
      ),
    },
  ];

  const historyEntries = auditTrail.filter((entry: AuditTrailEntry) => entry.entityType === 'document').slice(-5);

  return (
    <PageShell
      title="Document Control"
      subtitle="Lifecycle: Draft → Review → Approved → Retired"
      primaryAction={{ label: 'New Document', onClick: () => {} }}
      sidePanel={<AuditTrailPanel entries={historyEntries} title="History" />}
    >
      <Card padding="none">
        <Table
          columns={columns}
          data={data}
          keyExtractor={(row) => row.id}
          emptyMessage="No documents. Create one to get started."
        />
      </Card>

      <Modal
        isOpen={showPdfModal}
        onClose={() => setShowPdfModal(false)}
        title="Document Preview"
        size="xl"
      >
        <div className="min-h-[400px] rounded-lg border border-surface-border bg-surface flex items-center justify-center text-gray-500">
          Placeholder: PDF viewer integration (e.g. react-pdf or iframe)
        </div>
      </Modal>

      <SignatureModal
        isOpen={showSignature}
        onClose={() => setShowSignature(false)}
        onSign={(result) => {
          console.log('Signed', result);
          setShowSignature(false);
        }}
        title="Electronic Signature — 21 CFR Part 11"
        intent="approve this document"
      />
    </PageShell>
  );
}
