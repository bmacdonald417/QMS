import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageShell } from '../PageShell';
import { Card, Table, Badge, Button } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';
import { Copy, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import type { Column } from '@/components/ui';

interface EvidenceData {
  document: {
    id: string;
    code: string;
    title: string;
    status: string;
  };
  revision: {
    id: string;
    revisionLabel: string;
    date: string;
    contentHash: string;
    signingHash: string | null;
    snapshotJson: any;
  } | null;
  signatures: Array<{
    id: string;
    method: string;
    role: string;
    signedAt: string;
    signingHash: string;
    user: {
      firstName: string;
      lastName: string;
      email: string;
    };
  }>;
  tamperCheck: {
    currentHash: string;
    signedHash: string;
    matches: boolean;
  } | null;
}

export function CmmcEvidencePage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [evidence, setEvidence] = useState<EvidenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!code || !token) return;

    const fetchEvidence = async () => {
      try {
        setLoading(true);
        const data = await apiRequest<EvidenceData>(`/api/cmmc/documents/${code}/evidence`, {
          token,
        });
        setEvidence(data);
      } catch (error) {
        console.error('Failed to load evidence:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEvidence();
  }, [code, token]);

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <PageShell title="Loading Evidence...">
        <div className="text-center py-12">
          <div className="text-gray-400">Loading evidence data...</div>
        </div>
      </PageShell>
    );
  }

  if (!evidence) {
    return (
      <PageShell title="Error">
        <div className="text-center py-12">
          <div className="text-red-400 mb-4">Failed to load evidence</div>
          <Button onClick={() => navigate(`/cmmc/docs/${code}`)}>Back to Document</Button>
        </div>
      </PageShell>
    );
  }

  const signatureColumns: Column<EvidenceData['signatures'][0]>[] = [
    {
      key: 'user',
      header: 'Signer',
      render: (sig) => `${sig.user.firstName} ${sig.user.lastName}`,
    },
    { key: 'email', header: 'Email', render: (sig) => sig.user.email },
    { key: 'role', header: 'Role', render: (sig) => <Badge variant="success">{sig.role}</Badge> },
    { key: 'method', header: 'Method' },
    {
      key: 'signedAt',
      header: 'Signed At',
      render: (sig) => new Date(sig.signedAt).toLocaleString(),
    },
  ];

  return (
    <PageShell
      title="Evidence"
      subtitle={`${evidence.document.code} - ${evidence.document.title}`}
      backLink={{ label: 'Back to Document', href: `/cmmc/docs/${code}` }}
    >
      <div className="space-y-6">
        {/* Document Control */}
        <Card>
          <h3 className="text-lg font-semibold text-white mb-4">Document Control</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Code:</span>
              <span className="ml-2 text-white font-mono">{evidence.document.code}</span>
            </div>
            <div>
              <span className="text-gray-500">Title:</span>
              <span className="ml-2 text-white">{evidence.document.title}</span>
            </div>
            <div>
              <span className="text-gray-500">Status:</span>
              <span className="ml-2 text-white">{evidence.document.status}</span>
            </div>
            {evidence.revision && (
              <>
                <div>
                  <span className="text-gray-500">Revision:</span>
                  <span className="ml-2 text-white">{evidence.revision.revisionLabel}</span>
                </div>
                <div>
                  <span className="text-gray-500">Date:</span>
                  <span className="ml-2 text-white">{evidence.revision.date}</span>
                </div>
              </>
            )}
          </div>
        </Card>

        {/* Hash Verification */}
        {evidence.revision && (
          <Card>
            <h3 className="text-lg font-semibold text-white mb-4">Hash Verification</h3>
            <div className="space-y-4">
              {evidence.revision.signingHash && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm text-gray-400">Signing Hash</label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyHash(evidence.revision!.signingHash!)}
                    >
                      {copied ? (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 mr-2" />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="font-mono text-xs text-gray-300 bg-surface-elevated p-3 rounded break-all">
                    {evidence.revision.signingHash}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-gray-400">Content Hash</label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyHash(evidence.revision!.contentHash)}
                  >
                    {copied ? (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
                <div className="font-mono text-xs text-gray-300 bg-surface-elevated p-3 rounded break-all">
                  {evidence.revision.contentHash}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Tamper Check */}
        {evidence.tamperCheck && (
          <Card>
            <h3 className="text-lg font-semibold text-white mb-4">Tamper Check</h3>
            <div className="flex items-center gap-3">
              {evidence.tamperCheck.matches ? (
                <>
                  <CheckCircle className="w-6 h-6 text-green-400" />
                  <div>
                    <div className="text-white font-medium">Content Verified</div>
                    <div className="text-sm text-gray-400">
                      Current file hash matches signed revision
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-6 h-6 text-yellow-400" />
                  <div>
                    <div className="text-yellow-400 font-medium">Content Changed</div>
                    <div className="text-sm text-gray-400">
                      Current file hash does not match signed revision. Content may have been
                      modified.
                    </div>
                  </div>
                </>
              )}
            </div>
          </Card>
        )}

        {/* Signature History */}
        <Card>
          <h3 className="text-lg font-semibold text-white mb-4">Signature History</h3>
          {evidence.signatures.length > 0 ? (
            <Table
              data={evidence.signatures}
              columns={signatureColumns}
              keyExtractor={(sig) => sig.id}
            />
          ) : (
            <div className="text-gray-400 text-center py-8">No signatures yet</div>
          )}
        </Card>
      </div>
    </PageShell>
  );
}