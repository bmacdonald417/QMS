import { useEffect, useState } from 'react';
import { Card, Button, Input, Table, Modal } from '@/components/ui';
import { PageShell } from '@/pages/PageShell';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';
import type { Column } from '@/components/ui';
import { Plug, Copy, RotateCw } from 'lucide-react';

const VALID_SCOPES = [
  'formrecords:read',
  'formrecords:write',
  'training:read',
  'governance:read',
  'governance:write',
];

interface IntegrationClient {
  clientId: string;
  name: string;
  scopes: string[];
  isActive: boolean;
  createdAt: string;
  lastRotatedAt: string | null;
}

export function SystemIntegrations() {
  const { token } = useAuth();
  const [clients, setClients] = useState<IntegrationClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createScopes, setCreateScopes] = useState<string[]>([]);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState('');
  const [newSecret, setNewSecret] = useState<{ clientId: string; clientSecret: string } | null>(null);
  const [rotateModal, setRotateModal] = useState<IntegrationClient | null>(null);
  const [rotateSubmitting, setRotateSubmitting] = useState(false);
  const [rotateSecret, setRotateSecret] = useState<string | null>(null);

  const fetchClients = () => {
    if (!token) return;
    setLoading(true);
    apiRequest<{ clients: IntegrationClient[] }>('/api/system/integrations/clients', { token })
      .then((r) => setClients(r.clients || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchClients();
  }, [token]);

  const handleCreate = async () => {
    if (!token || !createName.trim()) return;
    setCreateError('');
    setCreateSubmitting(true);
    try {
      const res = await apiRequest<{ clientId: string; clientSecret: string; name: string; scopes: string[] }>(
        '/api/system/integrations/clients',
        {
          token,
          method: 'POST',
          body: { name: createName.trim(), scopes: createScopes },
        }
      );
      setNewSecret({ clientId: res.clientId, clientSecret: res.clientSecret });
      setCreateModal(false);
      setCreateName('');
      setCreateScopes([]);
      fetchClients();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create');
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleRotate = async () => {
    if (!token || !rotateModal) return;
    setRotateSubmitting(true);
    try {
      const res = await apiRequest<{ clientId: string; clientSecret: string }>(
        `/api/system/integrations/clients/${rotateModal.clientId}/rotate-secret`,
        { token, method: 'POST' }
      );
      setRotateSecret(res.clientSecret);
      fetchClients();
    } catch (e) {
      setRotateSecret(null);
    } finally {
      setRotateSubmitting(false);
    }
  };

  const toggleScope = (scope: string) => {
    setCreateScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const columns: Column<IntegrationClient>[] = [
    { key: 'clientId', header: 'Client ID', render: (r) => <code className="text-sm">{r.clientId}</code> },
    { key: 'name', header: 'Name' },
    {
      key: 'scopes',
      header: 'Scopes',
      render: (r) => (
        <span className="text-sm text-gray-400">
          {r.scopes?.length ? r.scopes.join(', ') : '—'}
        </span>
      ),
    },
    { key: 'isActive', header: 'Active', render: (r) => (r.isActive ? 'Yes' : 'No') },
  ];

  return (
    <PageShell
      title="Integrations"
      subtitle="Manage API clients for form records, training, and governance. Create clients and obtain short-lived tokens."
    >
      <div className="space-y-6">
        <div className="flex justify-end">
          <Button onClick={() => setCreateModal(true)}>
            <Plug className="mr-2 h-4 w-4" />
            Create Client
          </Button>
        </div>

        <Card padding="md">
          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : clients.length === 0 ? (
            <p className="text-gray-500">No integration clients yet. Create one to get started.</p>
          ) : (
            <Table data={clients} columns={columns} keyExtractor={(r) => r.clientId} />
          )}
        </Card>

        {clients.length > 0 && (
          <div className="flex gap-2">
            {clients.map((c) => (
              <Button
                key={c.clientId}
                variant="secondary"
                size="sm"
                onClick={() => {
                  setRotateModal(c);
                  setRotateSecret(null);
                }}
              >
                <RotateCw className="mr-1 h-3 w-3" />
                Rotate {c.name}
              </Button>
            ))}
          </div>
        )}

        {/* Create Modal */}
        <Modal isOpen={createModal} onClose={() => setCreateModal(false)} title="Create Integration Client">
          <div className="space-y-4">
            <Input
              label="Name"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. Governance Service"
            />
            <div>
              <label className="label-caps text-gray-500">Scopes</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {VALID_SCOPES.map((s) => (
                  <label key={s} className="flex items-center gap-2 rounded border border-border px-3 py-1.5">
                    <input
                      type="checkbox"
                      checked={createScopes.includes(s)}
                      onChange={() => toggleScope(s)}
                    />
                    <span className="text-sm">{s}</span>
                  </label>
                ))}
              </div>
            </div>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setCreateModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={createSubmitting || !createName.trim()}>
                {createSubmitting ? 'Creating...' : 'Create'}
              </Button>
            </div>
          </div>
        </Modal>

        {/* New Secret Display (one-time) */}
        <Modal
          isOpen={!!newSecret}
          onClose={() => setNewSecret(null)}
          title="Client Created — Store Secret Securely"
        >
          {newSecret && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                The client secret is shown only once. Copy it now and store it securely.
              </p>
              <div>
                <label className="label-caps text-gray-500">Client ID</label>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 rounded bg-secondary px-2 py-1.5 text-sm">
                    {newSecret.clientId}
                  </code>
                  <Button variant="secondary" size="sm" onClick={() => copyToClipboard(newSecret.clientId)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div>
                <label className="label-caps text-gray-500">Client Secret</label>
                <div className="mt-1 flex items-center gap-2">
                  <code className="flex-1 rounded bg-secondary px-2 py-1.5 text-sm">
                    {newSecret.clientSecret}
                  </code>
                  <Button variant="secondary" size="sm" onClick={() => copyToClipboard(newSecret.clientSecret)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => setNewSecret(null)}>Done</Button>
              </div>
            </div>
          )}
        </Modal>

        {/* Rotate Secret Modal */}
        <Modal
          isOpen={!!rotateModal}
          onClose={() => {
            setRotateModal(null);
            setRotateSecret(null);
          }}
          title={rotateModal ? `Rotate Secret: ${rotateModal.name}` : ''}
        >
          {rotateModal && (
            <div className="space-y-4">
              {rotateSecret ? (
                <>
                  <p className="text-sm text-gray-400">
                    The new secret is shown only once. Copy it now and update your integration.
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-secondary px-2 py-1.5 text-sm">
                      {rotateSecret}
                    </code>
                    <Button variant="secondary" size="sm" onClick={() => copyToClipboard(rotateSecret)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      onClick={() => {
                        setRotateModal(null);
                        setRotateSecret(null);
                      }}
                    >
                      Done
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-400">
                    This will invalidate the current secret. A new secret will be generated.
                  </p>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setRotateModal(null);
                        setRotateSecret(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleRotate} disabled={rotateSubmitting}>
                      {rotateSubmitting ? 'Rotating...' : 'Rotate Secret'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </Modal>
      </div>
    </PageShell>
  );
}
