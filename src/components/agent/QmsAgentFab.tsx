import { useCallback, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Bot, Wrench, GitBranch } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';
import { canAccessQmsAgent } from '@/lib/qms-agent/agentAccess';
import { Button, Card, Input } from '@/components/ui';

type AgentMode = 'suggest' | 'workflow';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const OUTPUT_TYPES = ['PLAN', 'SCHEMA', 'UI', 'FULL_SCAFFOLD'] as const;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (typeof r !== 'string') return reject(new Error('Invalid file read'));
      const comma = r.indexOf(',');
      resolve(comma >= 0 ? r.slice(comma + 1) : r);
    };
    reader.onerror = () => reject(reader.error || new Error('Read failed'));
    reader.readAsDataURL(file);
  });
}

export function QmsAgentFab() {
  const { user, token } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AgentMode>('suggest');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const canUseAgent = canAccessQmsAgent(user?.roleName);

  const routePath = useMemo(() => `${location.pathname}${location.search || ''}`, [location.pathname, location.search]);

  const [suggest, setSuggest] = useState({
    moduleName: '',
    componentName: '',
    description: '',
    businessReason: '',
    priority: 'MEDIUM' as (typeof PRIORITIES)[number],
    files: [] as File[],
  });

  const [workflow, setWorkflow] = useState({
    workflowName: '',
    objective: '',
    triggerEvent: '',
    requiredRoles: '',
    approvalSteps: '',
    notificationNeeds: '',
    auditTrailRequirements: '',
    trainingLinkageRequired: false,
    periodicReviewRequired: false,
    outputType: 'PLAN' as (typeof OUTPUT_TYPES)[number],
    businessReason: '',
    priority: 'MEDIUM' as (typeof PRIORITIES)[number],
    files: [] as File[],
  });

  const resetMessages = useCallback(() => {
    setError('');
    setSuccess('');
  }, []);

  const buildAttachments = async (files: File[]) => {
    const out: { fileName: string; mimeType: string; dataBase64: string }[] = [];
    for (const f of files.slice(0, 5)) {
      if (f.size > 2 * 1024 * 1024) {
        throw new Error(`File too large (max 2 MB each): ${f.name}`);
      }
      const dataBase64 = await readFileAsBase64(f);
      out.push({ fileName: f.name, mimeType: f.type || 'application/octet-stream', dataBase64 });
    }
    return out.length ? out : undefined;
  };

  const submitSuggest = async () => {
    if (!token) return;
    resetMessages();
    setSubmitting(true);
    try {
      const attachments = await buildAttachments(suggest.files);
      await apiRequest('/api/agent/requests', {
        token,
        method: 'POST',
        body: {
          type: 'SUGGEST_UPDATE',
          routePath,
          moduleName: suggest.moduleName.trim(),
          componentName: suggest.componentName.trim() || null,
          description: suggest.description.trim(),
          businessReason: suggest.businessReason.trim(),
          priority: suggest.priority,
          attachments,
        },
      });
      setSuccess('Request submitted. Track it under System → QMS Agent (Quality Manager or System Admin).');
      setSuggest((s) => ({
        ...s,
        description: '',
        businessReason: '',
        files: [],
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  const submitWorkflow = async () => {
    if (!token) return;
    resetMessages();
    setSubmitting(true);
    try {
      const attachments = await buildAttachments(workflow.files);
      const requiredRoles = workflow.requiredRoles
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const approvalSteps = workflow.approvalSteps
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      await apiRequest('/api/agent/requests', {
        token,
        method: 'POST',
        body: {
          type: 'BUILD_WORKFLOW',
          workflowName: workflow.workflowName.trim(),
          objective: workflow.objective.trim(),
          triggerEvent: workflow.triggerEvent.trim(),
          requiredRoles,
          approvalSteps,
          notificationNeeds: workflow.notificationNeeds.trim(),
          auditTrailRequirements: workflow.auditTrailRequirements.trim(),
          trainingLinkageRequired: workflow.trainingLinkageRequired,
          periodicReviewRequired: workflow.periodicReviewRequired,
          outputType: workflow.outputType,
          businessReason: workflow.businessReason.trim(),
          priority: workflow.priority,
          attachments,
        },
      });
      setSuccess('Workflow request submitted.');
      setWorkflow((w) => ({
        ...w,
        workflowName: '',
        objective: '',
        triggerEvent: '',
        requiredRoles: '',
        approvalSteps: '',
        notificationNeeds: '',
        auditTrailRequirements: '',
        businessReason: '',
        files: [],
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!canUseAgent) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          resetMessages();
        }}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border border-mactech-blue/40 bg-mactech-blue px-4 py-3 text-sm font-semibold text-white shadow-depth-lg transition hover:bg-mactech-blue-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-mactech-blue focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Bot className="h-5 w-5" aria-hidden />
        QMS Agent
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="QMS Agent">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close QMS Agent"
            onClick={() => setOpen(false)}
          />
          <div className="relative flex h-full w-full max-w-lg flex-col border-l border-surface-border bg-surface-elevated shadow-depth-lg">
            <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
              <div className="flex items-center gap-2 text-white">
                <Bot className="h-5 w-5 text-mactech-blue" />
                <span className="font-semibold">QMS Agent</span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-2 text-gray-400 hover:bg-surface-overlay hover:text-white"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex gap-1 border-b border-surface-border px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  setMode('suggest');
                  resetMessages();
                }}
                className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-2 text-xs font-medium ${
                  mode === 'suggest' ? 'bg-mactech-blue/20 text-mactech-blue' : 'text-gray-400 hover:bg-surface-overlay'
                }`}
              >
                <Wrench className="h-4 w-4" />
                Suggest update
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('workflow');
                  resetMessages();
                }}
                className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-2 text-xs font-medium ${
                  mode === 'workflow' ? 'bg-mactech-blue/20 text-mactech-blue' : 'text-gray-400 hover:bg-surface-overlay'
                }`}
              >
                <GitBranch className="h-4 w-4" />
                Build workflow
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <p className="text-xs text-gray-500">
                Intake only: requests are logged and auditable. No autonomous production changes are performed from this
                panel.
              </p>
              {error && <p className="text-sm text-compliance-red">{error}</p>}
              {success && <p className="text-sm text-compliance-green">{success}</p>}

              {mode === 'suggest' && (
                <Card padding="md" className="space-y-3">
                  <div>
                    <p className="label-caps mb-1 text-gray-500">Current route</p>
                    <p className="rounded border border-surface-border bg-surface-overlay px-2 py-1.5 font-mono text-xs text-gray-300 break-all">
                      {routePath}
                    </p>
                  </div>
                  <Input
                    label="Module name"
                    value={suggest.moduleName}
                    onChange={(e) => setSuggest((s) => ({ ...s, moduleName: e.target.value }))}
                    placeholder="e.g. Document Control"
                  />
                  <Input
                    label="Component name (optional)"
                    value={suggest.componentName}
                    onChange={(e) => setSuggest((s) => ({ ...s, componentName: e.target.value }))}
                    placeholder="e.g. DocumentDetail review card"
                  />
                  <div>
                    <label className="label-caps mb-1.5 block">Description</label>
                    <textarea
                      value={suggest.description}
                      onChange={(e) => setSuggest((s) => ({ ...s, description: e.target.value }))}
                      rows={4}
                      className="w-full rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-gray-100"
                      placeholder="What should change?"
                    />
                  </div>
                  <div>
                    <label className="label-caps mb-1.5 block">Business reason</label>
                    <textarea
                      value={suggest.businessReason}
                      onChange={(e) => setSuggest((s) => ({ ...s, businessReason: e.target.value }))}
                      rows={3}
                      className="w-full rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-gray-100"
                      placeholder="Why this matters for the QMS"
                    />
                  </div>
                  <div>
                    <label className="label-caps mb-1.5 block">Priority</label>
                    <select
                      value={suggest.priority}
                      onChange={(e) =>
                        setSuggest((s) => ({ ...s, priority: e.target.value as (typeof PRIORITIES)[number] }))
                      }
                      className="w-full rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-gray-100"
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label-caps mb-1.5 block">Attachments (optional, max 5, 2 MB each)</label>
                    <input
                      type="file"
                      multiple
                      onChange={(e) => setSuggest((s) => ({ ...s, files: Array.from(e.target.files || []) }))}
                      className="block w-full text-xs text-gray-400 file:mr-2 file:rounded file:border-0 file:bg-mactech-blue file:px-2 file:py-1 file:text-white"
                    />
                  </div>
                  <Button onClick={submitSuggest} disabled={submitting}>
                    {submitting ? 'Submitting…' : 'Submit request'}
                  </Button>
                </Card>
              )}

              {mode === 'workflow' && (
                <Card padding="md" className="space-y-3">
                  <Input
                    label="Workflow name"
                    value={workflow.workflowName}
                    onChange={(e) => setWorkflow((w) => ({ ...w, workflowName: e.target.value }))}
                  />
                  <div>
                    <label className="label-caps mb-1.5 block">Objective</label>
                    <textarea
                      value={workflow.objective}
                      onChange={(e) => setWorkflow((w) => ({ ...w, objective: e.target.value }))}
                      rows={3}
                      className="w-full rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="label-caps mb-1.5 block">Trigger / event</label>
                    <textarea
                      value={workflow.triggerEvent}
                      onChange={(e) => setWorkflow((w) => ({ ...w, triggerEvent: e.target.value }))}
                      rows={2}
                      className="w-full rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="label-caps mb-1.5 block">Required roles (one per line)</label>
                    <textarea
                      value={workflow.requiredRoles}
                      onChange={(e) => setWorkflow((w) => ({ ...w, requiredRoles: e.target.value }))}
                      rows={3}
                      className="w-full rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-gray-100"
                      placeholder={'Quality Manager\nDocument Owner'}
                    />
                  </div>
                  <div>
                    <label className="label-caps mb-1.5 block">Approval steps (one per line)</label>
                    <textarea
                      value={workflow.approvalSteps}
                      onChange={(e) => setWorkflow((w) => ({ ...w, approvalSteps: e.target.value }))}
                      rows={3}
                      className="w-full rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="label-caps mb-1.5 block">Notification needs</label>
                    <textarea
                      value={workflow.notificationNeeds}
                      onChange={(e) => setWorkflow((w) => ({ ...w, notificationNeeds: e.target.value }))}
                      rows={2}
                      className="w-full rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="label-caps mb-1.5 block">Audit trail requirements</label>
                    <textarea
                      value={workflow.auditTrailRequirements}
                      onChange={(e) => setWorkflow((w) => ({ ...w, auditTrailRequirements: e.target.value }))}
                      rows={2}
                      className="w-full rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-gray-100"
                    />
                  </div>
                  <div className="flex flex-col gap-2 text-sm text-gray-300">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={workflow.trainingLinkageRequired}
                        onChange={(e) => setWorkflow((w) => ({ ...w, trainingLinkageRequired: e.target.checked }))}
                      />
                      Training linkage required
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={workflow.periodicReviewRequired}
                        onChange={(e) => setWorkflow((w) => ({ ...w, periodicReviewRequired: e.target.checked }))}
                      />
                      Periodic review requirement
                    </label>
                  </div>
                  <div>
                    <label className="label-caps mb-1.5 block">Desired output</label>
                    <select
                      value={workflow.outputType}
                      onChange={(e) =>
                        setWorkflow((w) => ({ ...w, outputType: e.target.value as (typeof OUTPUT_TYPES)[number] }))
                      }
                      className="w-full rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-gray-100"
                    >
                      {OUTPUT_TYPES.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label-caps mb-1.5 block">Business reason</label>
                    <textarea
                      value={workflow.businessReason}
                      onChange={(e) => setWorkflow((w) => ({ ...w, businessReason: e.target.value }))}
                      rows={2}
                      className="w-full rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="label-caps mb-1.5 block">Priority</label>
                    <select
                      value={workflow.priority}
                      onChange={(e) =>
                        setWorkflow((w) => ({ ...w, priority: e.target.value as (typeof PRIORITIES)[number] }))
                      }
                      className="w-full rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-gray-100"
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label-caps mb-1.5 block">Attachments (optional)</label>
                    <input
                      type="file"
                      multiple
                      onChange={(e) => setWorkflow((w) => ({ ...w, files: Array.from(e.target.files || []) }))}
                      className="block w-full text-xs text-gray-400 file:mr-2 file:rounded file:border-0 file:bg-mactech-blue file:px-2 file:py-1 file:text-white"
                    />
                  </div>
                  <Button onClick={submitWorkflow} disabled={submitting}>
                    {submitting ? 'Submitting…' : 'Submit workflow request'}
                  </Button>
                </Card>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
