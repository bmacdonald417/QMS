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

  // Debug logging
  console.log('SignPanel Debug:', {
    status,
    latestRevision,
    userHasSigned,
    canSign: status !== 'RETIRED' && latestRevision && !userHasSigned,
  });

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
  // Also allow if revision exists but signingHash is null (needs to be computed)
  const hasRevision = latestRevision && latestRevision.id;
  const canSign = status !== 'RETIRED' && hasRevision && !userHasSigned;

  return (
    <Card variant="bordered" padding="lg" className="sticky top-4 bg-surface-elevated">
      <div className="flex items-center gap-2 mb-6">
        <PenTool className="w-5 h-5 text-mactech-blue" />
        <h3 className="text-lg font-semibold text-white">Sign Document</h3>
      </div>

      {canSign ? (
        <div className="space-y-4">
          <div className="p-4 bg-surface-overlay rounded-lg border border-surface-border">
            <p className="text-sm text-gray-300 mb-2">
              Sign this document to acknowledge your review and approval.
            </p>
            <p className="text-xs text-gray-400">
              Your signature will be cryptographically bound to this document version.
            </p>
          </div>
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => setIsModalOpen(true)}
            disabled={signing}
          >
            <PenTool className="w-5 h-5 mr-2" />
            {signing ? 'Signing...' : 'Sign Document'}
          </Button>
        </div>
      ) : (
        <div className="p-4 bg-surface-overlay rounded-lg border border-surface-border">
          <div className="text-sm text-gray-400">
            {status === 'RETIRED' 
              ? '⚠️ Document is retired and cannot be signed' 
              : userHasSigned 
              ? '✅ You have already signed this document'
              : !hasRevision
              ? '⚠️ No revision available for signing. Please sync documents first.'
              : '⚠️ Unable to sign at this time'}
          </div>
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
        <div className="mt-8 pt-6 border-t border-surface-border">
          <h4 className="text-sm font-semibold text-gray-300 mb-4">Signature History</h4>
          <div className="space-y-4">
            {signatures.map((sig) => (
              <div key={sig.id} className="p-3 bg-surface-overlay rounded-lg border border-surface-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white font-medium text-sm">
                    {sig.user.firstName} {sig.user.lastName}
                  </span>
                  <Badge variant="success" className="text-xs">
                    {sig.role}
                  </Badge>
                </div>
                <div className="text-gray-400 text-xs mb-1">
                  {new Date(sig.signedAt).toLocaleString()}
                </div>
                <div className="text-gray-500 text-xs">Method: {sig.method}</div>
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