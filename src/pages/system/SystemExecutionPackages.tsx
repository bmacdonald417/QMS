import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';
import { PRIMARY_ORG_SLUG } from '@/lib/qms-agent/contracts';
import { canAccessQmsAgent } from '@/lib/qms-agent/agentAccess';
import { Badge, Button, Card, Input } from '@/components/ui';

type PackageRow = {
  id: string;
  title: string;
  summary: string;
  packageType: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  agentRequest: { id: string; title: string; status: string; type: string };
};

export function SystemExecutionPackages() {
  const { token, user } = useAuth();
  const [items, setItems] = useState<PackageRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const canUseAgent = canAccessQmsAgent(user?.roleName);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (statusFilter) p.set('status', statusFilter);
    if (typeFilter) p.set('packageType', typeFilter);
    p.set('limit', '100');
    return p.toString();
  }, [statusFilter, typeFilter]);

  const load = useCallback(async () => {
    if (!token || !canUseAgent) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiRequest<{ items: PackageRow[]; total: number }>(
        `/api/org/${PRIMARY_ORG_SLUG}/qms-agent/execution-packages?${query}`,
        { token }
      );
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, canUseAgent, query]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canUseAgent) {
    return <p className="text-gray-400">Quality Manager or System Admin access required.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Execution packages</h1>
          <p className="mt-1 text-sm text-gray-500">
            Governed bundles that merge approved agent outputs into implementation-ready tasks and Cursor handoffs.
            Organization scope: <span className="text-gray-300">{PRIMARY_ORG_SLUG}</span>
          </p>
        </div>
        <Link
          to="/system/qms-agent"
          className="inline-flex items-center justify-center rounded-lg border border-surface-border bg-surface-elevated px-4 py-2 text-sm font-medium text-gray-200 hover:bg-surface-overlay"
        >
          Back to QMS Agent
        </Link>
      </div>

      {error && <p className="text-sm text-compliance-red">{error}</p>}

      <Card padding="md" className="space-y-3">
        <h2 className="text-lg font-medium text-white">Filters</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="label-caps mb-1.5 block text-gray-500">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-gray-100"
            >
              <option value="">Any</option>
              <option value="DRAFT">DRAFT</option>
              <option value="READY">READY</option>
              <option value="SENT_TO_DEV">SENT_TO_DEV</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>
          <div>
            <label className="label-caps mb-1.5 block text-gray-500">Package type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-gray-100"
            >
              <option value="">Any</option>
              <option value="UI_CHANGE">UI_CHANGE</option>
              <option value="WORKFLOW_BUILD">WORKFLOW_BUILD</option>
              <option value="SCHEMA_CHANGE">SCHEMA_CHANGE</option>
              <option value="MIXED">MIXED</option>
            </select>
          </div>
          <Input readOnly label="Organization slug" value={PRIMARY_ORG_SLUG} />
        </div>
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </Card>

      <Card padding="md">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium text-white">Packages</h2>
          <span className="text-xs text-gray-500">{total} total</span>
        </div>
        {loading ? (
          <p className="text-gray-400">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-gray-500">No packages match filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border text-left text-gray-500">
                  <th className="py-2 pr-2">Updated</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2 pr-2">Type</th>
                  <th className="py-2 pr-2">Request</th>
                  <th className="py-2 pr-2">Title</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="border-b border-surface-border text-gray-200">
                    <td className="py-2 pr-2 whitespace-nowrap">{new Date(row.updatedAt).toLocaleString()}</td>
                    <td className="py-2 pr-2">
                      <Badge variant="neutral">{row.status}</Badge>
                    </td>
                    <td className="py-2 pr-2">{row.packageType}</td>
                    <td className="py-2 pr-2 max-w-[14rem] truncate text-xs text-gray-400">{row.agentRequest.title}</td>
                    <td className="py-2 pr-2 max-w-xs truncate">{row.title}</td>
                    <td className="py-2 text-right">
                      <Link
                        to={`/system/qms-agent/execution-packages/${row.id}`}
                        className="inline-flex items-center justify-center rounded-md border border-surface-border bg-surface-elevated px-3 py-1.5 text-sm font-medium text-gray-200 hover:bg-surface-overlay"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
