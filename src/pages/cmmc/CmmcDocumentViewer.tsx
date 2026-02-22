import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageShell } from '../PageShell';
import { ControlledDocLayout } from '@/components/cmmc/ControlledDocLayout';
import { SignPanel } from '@/components/cmmc/SignPanel';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';
import { Button } from '@/components/ui';
import { ArrowLeft, FileText } from 'lucide-react';

interface DocumentData {
  document: {
    id: string;
    code: string;
    title: string;
    kind: string;
    qmsDocType: string;
    reviewCadence?: string | null;
    status: string;
    latestRevision?: {
      id: string;
      revisionLabel: string;
      date: string;
      classification?: string | null;
      framework?: string | null;
      reference?: string | null;
      signingHash?: string | null;
    } | null;
    signatures?: Array<{
      id: string;
      method: string;
      role: string;
      signedAt: string;
      user: {
        firstName: string;
        lastName: string;
        email: string;
      };
    }>;
    manifest: {
      code: string;
      title: string;
      kind: string;
      path: string;
      qms_doc_type: string;
      review_cadence?: string | null;
    };
    fileMetadata: {
      version: string;
      date: string;
      classification: string;
      framework: string;
      reference: string;
      appliesTo?: string | null;
      title: string;
    };
  };
}

interface ContentData {
  content: string;
  metadata: any;
  body: string;
}

export function CmmcDocumentViewer() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [document, setDocument] = useState<DocumentData['document'] | null>(null);
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!code || !token) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        const [docData, contentData] = await Promise.all([
          apiRequest<DocumentData>(`/api/cmmc/documents/${code}`, { token }),
          apiRequest<ContentData>(`/api/cmmc/documents/${code}/content`, { token }),
        ]);

        console.log('Document data:', docData);
        console.log('Latest revision:', docData.document.latestRevision);

        setDocument(docData.document);
        setContent(contentData.body || contentData.content);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load document');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [code, token]);

  if (loading) {
    return (
      <PageShell title="Loading...">
        <div className="text-center py-12">
          <div className="text-gray-400">Loading document...</div>
        </div>
      </PageShell>
    );
  }

  if (error || !document) {
    return (
      <PageShell title="Error">
        <div className="text-center py-12">
          <div className="text-red-400 mb-4">{error || 'Document not found'}</div>
          <Button onClick={() => navigate('/cmmc')}>Back to Registry</Button>
        </div>
      </PageShell>
    );
  }

  const latestRevision = document.latestRevision;

  const handleSignSuccess = () => {
    // Refresh document data after signing
    window.location.reload();
  };

  return (
    <PageShell
      title={document.title}
      subtitle={document.code}
      backLink={{ label: 'Back to CMMC Documents', href: '/cmmc' }}
      primaryAction={{
        label: 'Evidence',
        onClick: () => navigate(`/cmmc/docs/${code}/evidence`),
      }}
      sidePanel={
        <SignPanel
          documentCode={document.code}
          documentTitle={document.title}
          status={document.status}
          latestRevision={latestRevision}
          signatures={document.signatures || []}
          onSignSuccess={handleSignSuccess}
        />
      }
    >
      <ControlledDocLayout
        code={document.code}
        title={document.title}
        kind={document.kind}
        qmsDocType={document.qmsDocType}
        version={document.fileMetadata?.version || latestRevision?.revisionLabel}
        date={document.fileMetadata?.date || latestRevision?.date}
        status={document.status as any}
        reviewCadence={document.reviewCadence}
        hash={latestRevision?.signingHash || null}
        content={content}
      />
    </PageShell>
  );
}