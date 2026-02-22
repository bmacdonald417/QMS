import { useState, useMemo } from 'react';
import { Card, Button, Badge } from '@/components/ui';
import { SignatureModal } from './SignatureModal';
import { PenTool, CheckCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';

interface SignPanelProps {
  documentCode: string;
  documentTitle: string;
  status: string;
  latestRevision?: {
    id: string;
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
  onSignSuccess?: () => void;
}

export function SignPanel({
  documentCode,
  documentTitle,
  status,
  latestRevision,
  signatures = [],
  onSignSuccess,
}: SignPanelProps) {
  const { token, user } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [signing, setSigning] = useState(false);

  // Check if current user has already signed
  const userHasSigned = useMemo(() => {
    if (!user) return false;
    return signatures.some((sig) => sig.user.email === user.email);
  }, [signatures, user]);

  const handleSign = async (data: {
    method: 'TYPED' | 'DRAWN' | 'CLICKWRAP';
    role: 'APPROVER' | 'ACKNOWLEDGER';
    signatureData: string;
    password?: string;
  }) => {
    if (!token) return;

    try {
      setSigning(true);
      await apiRequest(`/api/cmmc/documents/${documentCode}/sign`, {
        token,
        method: 'POST',
        body: data,
      });

      if (onSignSuccess) {
        onSignSuccess();
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to sign document');
    } finally {
      setSigning(false);
    }
  };

  // Allow signing if document is not retired, has a revision, and user hasn't signed yet
  const canSign = status !== 'RETIRED' && latestRevision !== null && latestRevision !== undefined && !userHasSigned;

  return (
    <Card variant="bordered" padding="md" className="sticky top-4">
      <h3 className="text-sm font-semibold text-gray-300 mb-4">Signing</h3>

      {canSign ? (
        <div className="space-y-4">
          <Button
            variant="primary"
            className="w-full"
            onClick={() => setIsModalOpen(true)}
            disabled={signing}
          >
            <PenTool className="w-4 h-4 mr-2" />
            Sign Document
          </Button>
        </div>
      ) : (
        <div className="text-sm text-gray-400">
          {status === 'RETIRED' 
            ? 'Document is retired' 
            : userHasSigned 
            ? 'You have already signed this document'
            : 'No revision available for signing'}
        </div>
      )}

      {userHasSigned && (
        <div className="mt-4 p-3 bg-compliance-green/10 border border-compliance-green/30 rounded-lg">
          <div className="flex items-center gap-2 text-compliance-green">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm font-medium">You have signed this document</span>
          </div>
        </div>
      )}

      {signatures.length > 0 && (
        <div className="mt-6">
          <h4 className="text-xs font-semibold text-gray-400 mb-3">Signature History</h4>
          <div className="space-y-3">
            {signatures.map((sig) => (
              <div key={sig.id} className="text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white font-medium">
                    {sig.user.firstName} {sig.user.lastName}
                  </span>
                  <Badge variant="success" className="text-xs">
                    {sig.role}
                  </Badge>
                </div>
                <div className="text-gray-400 text-xs">
                  {new Date(sig.signedAt).toLocaleString()}
                </div>
                <div className="text-gray-500 text-xs mt-1">Method: {sig.method}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <SignatureModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSign={handleSign}
        documentCode={documentCode}
        documentTitle={documentTitle}
      />
    </Card>
  );
}