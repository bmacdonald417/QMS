import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';
import { PRIMARY_ORG_SLUG } from '@/lib/qms-agent/contracts';
import { Badge, Button, Card, Input, Modal } from '@/components/ui';

type AgentListItem = {
  id: string;
  type: string;
  status: string;
  priority: string;
  title: string;
  moduleName: string | null;
  routePath: string | null;
  createdAt: string;
  createdBy: { firstName: string; lastName: string; email: string };
  executionPackage?: { id: string; status: string } | null;
};

const STATUSES = [
  'SUBMITTED',
  'APPROVED_FOR_IMPLEMENTATION',
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
  'REJECTED',
] as const;

export function SystemQmsAgent() {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [items, setItems] = useState<AgentListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [detail, setDetail] = useState<unknown>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [patching, setPatching] = useState(false);
  const [newStatus, setNewStatus] = useState<(typeof STATUSES)[number]>('SUBMITTED');
  const [statusReason, setStatusReason] = useState('');
  const [creatingPackage, setCreatingPackage] = useState(false);

  const isAdmin = user?.roleName === 'System Admin';

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (typeFilter) p.set('type', typeFilter);
    if (statusFilter) p.set('status', statusFilter);
    if (priorityFilter) p.set('priority', priorityFilter);
    if (moduleFilter) p.set('moduleName', moduleFilter);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    p.set('limit', '100');
    return p.toString();
  }, [typeFilter, statusFilter, priorityFilter, moduleFilter, from, to]);

  const load = useCallback(async () => {
    if (!token || !isAdmin) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiRequest<{ items: AgentListItem[]; total: number }>(`/api/agent/requests?${query}`, {
        token,
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, isAdmin, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (id: string) => {
    if (!token) return;
    setError('');
    try {
      const data = await apiRequest<{ request: unknown }>(`/api/agent/requests/${id}`, { token });
      setDetail(data.request);
      const r = data.request as { status?: string };
      if (r.status && STATUSES.includes(r.status as (typeof STATUSES)[number])) {
        setNewStatus(r.status as (typeof STATUSES)[number]);
      }
      setStatusReason('');
      setDetailOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load detail');
    }
  };

  const createExecutionPackage = async () => {
    if (!token || !detail || typeof detail !== 'object' || !('id' in detail)) return;
    const id = String((detail as { id: string }).id);
    setCreatingPackage(true);
    setError('');
    try {
      const res = await apiRequest<{ package: { id: string } }>(
        `/api/org/${PRIMARY_ORG_SLUG}/qms-agent/requests/${id}/execution-package`,
        { token, method: 'POST', body: {} }
      );
      await load();
      const refreshed = await apiRequest<{ request: unknown }>(`/api/agent/requests/${id}`, { token });
      setDetail(refreshed.request);
      navigate(`/system/qms-agent/execution-packages/${res.package.id}`);
      setDetailOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create execution package');
    } finally {
      setCreatingPackage(false);
    }
  };

  const applyStatus = async () => {
    if (!token || !detail || typeof detail !== 'object' || !('id' in detail)) return;
    const id = String((detail as { id: string }).id);
    setPatching(true);
    setError('');
    try {
      const data = await apiRequest<{ request: unknown }>(`/api/agent/requests/${id}`, {
        token,
        method: 'PATCH',
        body: { status: newStatus, reason: statusReason.trim() || null },
      });
      setDetail(data.request);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setPatching(false);
    }
  };

  if (!isAdmin) {
    return <p className="text-gray-400">System Admin access required.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">QMS Agent</h1>
          <p className="mt-1 text-sm text-gray-500">
            Review intake requests, workflow specs, and lifecycle status. Implementation stays human-controlled; this
            module does not apply autonomous production edits.
          </p>
        </div>
        <Link
          to="/system/qms-agent/execution-packages"
          className="inline-flex items-center justify-center rounded-lg border border-surface-border bg-surface-elevated px-4 py-2 text-sm font-medium text-gray-200 hover:bg-surface-overlay"
        >
          Execution packages
        </Link>
      </div>

      {error && <p className="text-sm text-compliance-red">{error}</p>}

      <Card padding="md" className="space-y-3">
        <h2 className="text-lg font-medium text-white">Filters</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="label-caps mb-1.5 block text-gray-500">Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-gray-100"
            >
              <option value="">Any</option>
              <option value="SUGGEST_UPDATE">Suggest update</option>
              <option value="BUILD_WORKFLOW">Build workflow</option>
            </select>
          </div>
          <div>
            <label className="label-caps mb-1.5 block text-gray-500">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-gray-100"
            >
              <option value="">Any</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-caps mb-1.5 block text-gray-500">Priority</label>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-gray-100"
            >
              <option value="">Any</option>
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
          </div>
          <Input label="Module contains" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} />
          <Input type="date" label="From" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" label="To" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </Card>

      <Card padding="md">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium text-white">Requests</h2>
          <span className="text-xs text-gray-500">{total} total</span>
        </div>
        {loading ? (
          <p className="text-gray-400">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-gray-500">No requests match filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border text-left text-gray-500">
                  <th className="py-2 pr-2">Created</th>
                  <th className="py-2 pr-2">Type</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2 pr-2">Priority</th>
                  <th className="py-2 pr-2">Module</th>
                  <th className="py-2 pr-2">Title</th>
                  <th className="py-2 pr-2">Submitter</th>
                  <th className="py-2 pr-2">Package</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="border-b border-surface-border text-gray-200">
                    <td className="py-2 pr-2 whitespace-nowrap">{new Date(row.createdAt).toLocaleString()}</td>
                    <td className="py-2 pr-2">{row.type}</td>
                    <td className="py-2 pr-2">
                      <Badge variant="neutral">{row.status}</Badge>
                    </td>
                    <td className="py-2 pr-2">{row.priority}</td>
                    <td className="py-2 pr-2">{row.moduleName ?? '—'}</td>
                    <td className="py-2 pr-2 max-w-xs truncate">{row.title}</td>
                    <td className="py-2 pr-2 text-xs text-gray-400">
                      {row.createdBy.firstName} {row.createdBy.lastName}
                    </td>
                    <td className="py-2 pr-2 text-xs">
                      {row.executionPackage ? (
                        <Link className="text-mactech-blue hover:underline" to={`/system/qms-agent/execution-packages/${row.executionPackage.id}`}>
                          {row.executionPackage.status}
                        </Link>
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <Button size="sm" variant="secondary" onClick={() => void openDetail(row.id)}>
                        Review
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        title="Agent request"
        size="lg"
        footer={
          <div className="flex w-full flex-col gap-3">
            <div className="flex w-full flex-wrap items-center gap-2">
              {detail &&
              typeof detail === 'object' &&
              'status' in detail &&
              (detail as { status?: string }).status === 'APPROVED_FOR_IMPLEMENTATION' &&
              !(detail as { executionPackage?: { id: string } | null }).executionPackage ? (
                <Button onClick={() => void createExecutionPackage()} disabled={creatingPackage}>
                  {creatingPackage ? 'Creating…' : 'Create execution package'}
                </Button>
              ) : null}
              {detail &&
              typeof detail === 'object' &&
              (detail as { executionPackage?: { id: string } | null }).executionPackage?.id ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    navigate(
                      `/system/qms-agent/execution-packages/${(detail as { executionPackage: { id: string } }).executionPackage.id}`
                    )
                  }
                >
                  Open execution package
                </Button>
              ) : null}
            </div>
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as (typeof STATUSES)[number])}
                  className="rounded-lg border border-surface-border bg-surface-overlay px-2 py-1.5 text-sm text-gray-100"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Reason (optional)"
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  className="min-w-[12rem] flex-1 rounded-lg border border-surface-border bg-surface-overlay px-2 py-1.5 text-sm text-gray-100"
                />
                <Button onClick={() => void applyStatus()} disabled={patching}>
                  {patching ? 'Saving…' : 'Update status'}
                </Button>
              </div>
              <Button variant="secondary" onClick={() => setDetailOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        }
      >
        {detail != null ? (
          <div className="space-y-3 text-sm text-gray-300">
            <pre className="max-h-[50vh] overflow-auto rounded border border-surface-border bg-surface-overlay p-3 text-xs">
              {JSON.stringify(detail as Record<string, unknown>, null, 2)}
            </pre>
            <p className="text-xs text-gray-500">
              Attachment payloads may be large; use filters and DB tools for binary extraction if needed.
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
