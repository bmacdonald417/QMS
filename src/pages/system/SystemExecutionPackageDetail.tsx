import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';
import type {
  AcceptanceCriterion,
  CursorHandoffPayload,
  ExecutionIntelligencePayload,
  ExecutionPackagePayload,
  FixtureSuggestion,
  ImplementationReadinessPayload,
  MigrationRiskSummary,
  ReadinessScore,
  RegressionTestSuggestion,
} from '@/lib/qms-agent/contracts';
import { PRIMARY_ORG_SLUG } from '@/lib/qms-agent/contracts';
import { canAccessQmsAgent } from '@/lib/qms-agent/agentAccess';
import { Badge, Button, Card, Input } from '@/components/ui';

function MigrationRiskSummaryView({ summary }: { summary: MigrationRiskSummary }) {
  const list = (label: string, items: string[]) =>
    items?.length ? (
      <div className="mt-3">
        <div className="text-xs text-gray-500">{label}</div>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-gray-300">
          {items.slice(0, 12).map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <div className="mt-2 rounded border border-surface-border bg-surface-overlay p-3 text-xs text-gray-300">
      <p className="text-sm text-gray-100">{summary.summary}</p>
      {summary.impactedTables?.length ? (
        <div className="mt-3">
          <div className="text-xs text-gray-500">Likely impacted tables / entities</div>
          <p className="mt-1 text-gray-300">{summary.impactedTables.join(', ')}</p>
        </div>
      ) : null}
      {list('Backwards compatibility', summary.backwardsCompatibility)}
      {list('Nullability risks', summary.nullabilityRisks)}
      {list('Index / performance', summary.indexPerformance)}
      {list('Seed / backfill', summary.seedBackfill)}
      {list('Audit retention', summary.auditRetention)}
      {list('Training / document linkage', summary.trainingDocumentRisks)}
      {list('Rollout cautions', summary.rolloutCautions)}
      {list('Destructive change warnings', summary.destructiveWarnings)}
      {list('Workflow notes', summary.workflowNotes || [])}
    </div>
  );
}

type UserRow = { id: string; firstName: string; lastName: string; email: string; roleName: string };

type TaskRow = {
  id: string;
  title: string;
  description: string;
  taskType: string;
  status: string;
  orderIndex: number;
};

type PackageDetail = {
  id: string;
  title: string;
  summary: string;
  status: string;
  packageType: string;
  payloadJson: ExecutionPackagePayload;
  checklistJson: ExecutionPackagePayload['checklist'];
  intelligenceJson?: ExecutionIntelligencePayload | null;
  inferredModuleKey?: string | null;
  suggestedTemplateKey?: string | null;
  moduleKeyOverride?: string | null;
  templateKeyOverride?: string | null;
  agentRequestId: string;
  tasks: TaskRow[];
  createdByMembership?: { user: { firstName: string; lastName: string; email: string } };
  assignedToMembership?: { user: { id: string; firstName: string; lastName: string; email: string } } | null;
};

type HandoffRow = {
  id: string;
  status: string;
  createdAt: string;
  exportPayloadJson?: CursorHandoffPayload | null;
  handoffPrompt: string;
};

export function SystemExecutionPackageDetail() {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const [pkg, setPkg] = useState<PackageDetail | null>(null);
  const [handoff, setHandoff] = useState<HandoffRow | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [nextStatus, setNextStatus] = useState<string>('DRAFT');
  const [assigneeUserId, setAssigneeUserId] = useState<string>('');
  const [taskDrafts, setTaskDrafts] = useState<Record<string, { title: string; description: string }>>({});
  const [modules, setModules] = useState<Array<{ moduleKey: string; displayName: string }>>([]);
  const [templates, setTemplates] = useState<Array<{ templateKey: string; templateName: string }>>([]);
  const [moduleOverrideDraft, setModuleOverrideDraft] = useState('');
  const [templateOverrideDraft, setTemplateOverrideDraft] = useState('');
  const [regenerateTasks, setRegenerateTasks] = useState(false);
  const [gapNote, setGapNote] = useState('');

  const canUseAgent = canAccessQmsAgent(user?.roleName);

  const basePath = useMemo(() => `/api/org/${PRIMARY_ORG_SLUG}/qms-agent/execution-packages`, []);
  const orgAgentBase = useMemo(() => `/api/org/${PRIMARY_ORG_SLUG}/qms-agent`, []);

  const loadPackage = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiRequest<{ package: PackageDetail }>(`${basePath}/${id}`, { token });
      setPkg(data.package);
      setNextStatus(data.package.status);
      const drafts: Record<string, { title: string; description: string }> = {};
      for (const t of data.package.tasks || []) {
        drafts[t.id] = { title: t.title, description: t.description };
      }
      setTaskDrafts(drafts);
      const assignee = data.package.assignedToMembership?.user?.id;
      setAssigneeUserId(assignee ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load package');
    } finally {
      setLoading(false);
    }
  }, [token, id, basePath]);

  const loadHandoff = useCallback(async () => {
    if (!token || !id) return;
    try {
      const data = await apiRequest<{ handoff: HandoffRow }>(`${basePath}/${id}/handoff`, { token });
      setHandoff(data.handoff);
    } catch {
      setHandoff(null);
    }
  }, [token, id, basePath]);

  const loadUsers = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiRequest<{ users: UserRow[] }>('/api/users', { token });
      setUsers(data.users);
    } catch {
      setUsers([]);
    }
  }, [token]);

  const loadCatalog = useCallback(async () => {
    if (!token) return;
    try {
      const [mods, tpls] = await Promise.all([
        apiRequest<{ modules: Array<{ moduleKey: string; displayName: string }> }>(`${orgAgentBase}/modules`, { token }),
        apiRequest<{ templates: Array<{ templateKey: string; templateName: string }> }>(`${orgAgentBase}/workflow-templates`, {
          token,
        }),
      ]);
      setModules(mods.modules);
      setTemplates(tpls.templates);
    } catch {
      setModules([]);
      setTemplates([]);
    }
  }, [token, orgAgentBase]);

  useEffect(() => {
    void loadPackage();
    void loadHandoff();
    void loadUsers();
    void loadCatalog();
  }, [loadPackage, loadHandoff, loadUsers, loadCatalog]);

  useEffect(() => {
    if (!pkg) return;
    setModuleOverrideDraft(pkg.moduleKeyOverride ?? '');
    setTemplateOverrideDraft(pkg.templateKeyOverride ?? '');
  }, [pkg?.id, pkg?.moduleKeyOverride, pkg?.templateKeyOverride]);

  const applyStatus = async () => {
    if (!token || !id) return;
    setBusy(true);
    setError('');
    try {
      const data = await apiRequest<{ package: PackageDetail }>(`${basePath}/${id}/status`, {
        token,
        method: 'PATCH',
        body: { status: nextStatus },
      });
      setPkg(data.package);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update status');
    } finally {
      setBusy(false);
    }
  };

  const applyAssignee = async () => {
    if (!token || !id) return;
    setBusy(true);
    setError('');
    try {
      const data = await apiRequest<{ package: PackageDetail }>(`${basePath}/${id}/assignee`, {
        token,
        method: 'PATCH',
        body: { assignedToUserId: assigneeUserId ? assigneeUserId : null },
      });
      setPkg(data.package);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to assign');
    } finally {
      setBusy(false);
    }
  };

  const saveTask = async (taskId: string) => {
    if (!token || !id) return;
    const draft = taskDrafts[taskId];
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      await apiRequest(`${basePath}/${id}/tasks/${taskId}`, {
        token,
        method: 'PATCH',
        body: { title: draft.title, description: draft.description },
      });
      await loadPackage();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save task');
    } finally {
      setBusy(false);
    }
  };

  const generateHandoff = async () => {
    if (!token || !id) return;
    setBusy(true);
    setError('');
    try {
      const data = await apiRequest<{ handoff: HandoffRow; package: PackageDetail }>(`${basePath}/${id}/handoff`, {
        token,
        method: 'POST',
        body: { advanceToSentToDev: true },
      });
      setHandoff(data.handoff);
      setPkg(data.package);
      setNextStatus(data.package.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate handoff');
    } finally {
      setBusy(false);
    }
  };

  const exportHandoffJson = () => {
    if (!handoff?.exportPayloadJson) {
      setError('No export payload available yet. Generate a handoff first.');
      return;
    }
    const blob = new Blob([JSON.stringify(handoff.exportPayloadJson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cursor-handoff-${id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveIntelligenceOverrides = async () => {
    if (!token || !id) return;
    setBusy(true);
    setError('');
    try {
      await apiRequest(`${basePath}/${id}/intelligence-overrides`, {
        token,
        method: 'PATCH',
        body: {
          moduleKeyOverride: moduleOverrideDraft.trim() ? moduleOverrideDraft.trim() : null,
          templateKeyOverride: templateOverrideDraft.trim() ? templateOverrideDraft.trim() : null,
        },
      });
      await loadPackage();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save overrides');
    } finally {
      setBusy(false);
    }
  };

  const postReadinessAction = async (path: string) => {
    if (!token || !id) return;
    setBusy(true);
    setError('');
    try {
      await apiRequest(`${basePath}/${id}${path}`, { token, method: 'POST', body: {} });
      await loadPackage();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update implementation readiness');
    } finally {
      setBusy(false);
    }
  };

  const acknowledgeGaps = async () => {
    if (!token || !id) return;
    setBusy(true);
    setError('');
    try {
      await apiRequest(`${basePath}/${id}/acknowledge-readiness-gaps`, {
        token,
        method: 'POST',
        body: { note: gapNote.trim() ? gapNote.trim() : undefined },
      });
      await loadPackage();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to acknowledge gaps');
    } finally {
      setBusy(false);
    }
  };

  const regenerateIntelligence = async () => {
    if (!token || !id) return;
    setBusy(true);
    setError('');
    try {
      await apiRequest(`${basePath}/${id}/regenerate-intelligence`, {
        token,
        method: 'POST',
        body: { regenerateTasks },
      });
      await loadPackage();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to regenerate intelligence');
    } finally {
      setBusy(false);
    }
  };

  const exportPackageJson = () => {
    if (!pkg?.payloadJson) return;
    const blob = new Blob([JSON.stringify(pkg.payloadJson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `execution-package-payload-${id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!canUseAgent) {
    return <p className="text-gray-400">Quality Manager or System Admin access required.</p>;
  }

  if (loading) {
    return <p className="text-gray-400">Loading…</p>;
  }

  const implementationReadiness = (pkg?.payloadJson as ExecutionPackagePayload | undefined)?.implementationReadiness as
    | ImplementationReadinessPayload
    | undefined;
  const readinessScore = implementationReadiness?.readinessScore as ReadinessScore | undefined;

  if (!pkg) {
    return (
      <div className="space-y-3">
        <p className="text-compliance-red">{error || 'Package not found.'}</p>
        <Link to="/system/qms-agent/execution-packages" className="text-mactech-blue hover:underline text-sm">
          Back to packages
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">{pkg.title}</h1>
          <p className="mt-1 text-sm text-gray-500">{pkg.summary}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="neutral">{pkg.status}</Badge>
            <Badge variant="neutral">{pkg.packageType}</Badge>
            <span className="text-xs text-gray-500">Request: {pkg.agentRequestId}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/system/qms-agent/execution-packages"
            className="inline-flex items-center justify-center rounded-lg border border-surface-border bg-surface-elevated px-4 py-2 text-sm font-medium text-gray-200 hover:bg-surface-overlay"
          >
            All packages
          </Link>
          <Link
            to="/system/qms-agent"
            className="inline-flex items-center justify-center rounded-lg border border-surface-border bg-surface-elevated px-4 py-2 text-sm font-medium text-gray-200 hover:bg-surface-overlay"
          >
            QMS Agent
          </Link>
        </div>
      </div>

      {error && <p className="text-sm text-compliance-red">{error}</p>}

      {readinessScore && (readinessScore.band === 'LOW' || readinessScore.band === 'MEDIUM') ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <div className="font-medium text-amber-50">Readiness warning</div>
          <p className="mt-1 text-amber-100/90">
            Implementation readiness is <strong>{readinessScore.band}</strong> (score {readinessScore.score}). Review
            gaps and recommendations before marking READY or generating a Cursor handoff.
            {implementationReadiness?.gapsAcknowledged ? (
              <span className="block mt-2 text-xs text-amber-100/80">
                An admin acknowledged known gaps at {new Date(implementationReadiness.gapsAcknowledged.at).toLocaleString()}
                .
              </span>
            ) : null}
          </p>
        </div>
      ) : null}

      <Card padding="md" className="space-y-4">
        <div>
          <h2 className="text-lg font-medium text-white">Module intelligence</h2>
          <p className="mt-1 text-xs text-gray-500">
            Inferences are advisory. Overrides change how templates and tasks are suggested; regeneration refreshes
            checklist intelligence rows and optionally rebuilds generated tasks.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label-caps mb-1.5 block text-gray-500">Inferred module</label>
            <div className="rounded border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-gray-200">
              {pkg.inferredModuleKey ?? '—'}
            </div>
          </div>
          <div>
            <label className="label-caps mb-1.5 block text-gray-500">Suggested template</label>
            <div className="rounded border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-gray-200">
              {pkg.suggestedTemplateKey ?? '—'}
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label-caps mb-1.5 block text-gray-500">Override module key</label>
            <select
              value={moduleOverrideDraft}
              onChange={(e) => setModuleOverrideDraft(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-gray-100"
            >
              <option value="">(use inference)</option>
              {modules.map((m) => (
                <option key={m.moduleKey} value={m.moduleKey}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-caps mb-1.5 block text-gray-500">Override template key</label>
            <select
              value={templateOverrideDraft}
              onChange={(e) => setTemplateOverrideDraft(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-gray-100"
            >
              <option value="">(use suggestion)</option>
              {templates.map((t) => (
                <option key={t.templateKey} value={t.templateKey}>
                  {t.templateName}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" checked={regenerateTasks} onChange={(e) => setRegenerateTasks(e.target.checked)} />
          Also regenerate execution tasks (will replace generated tasks; manual edits may be lost)
        </label>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void saveIntelligenceOverrides()} disabled={busy}>
            Save overrides
          </Button>
          <Button onClick={() => void regenerateIntelligence()} disabled={busy}>
            Regenerate intelligence
          </Button>
        </div>

        {pkg.intelligenceJson ? (
          <div className="space-y-2 text-sm text-gray-300">
            <div className="text-xs text-gray-500">Module summary</div>
            <p className="text-gray-200">
              {String(
                ((pkg.intelligenceJson as ExecutionIntelligencePayload).module as { description?: string } | undefined)
                  ?.description ?? ''
              )}
            </p>
            <div className="text-xs text-gray-500">Key entities</div>
            <p className="text-xs text-gray-400">
              {(pkg.intelligenceJson as ExecutionIntelligencePayload).affectedEntities?.slice(0, 12).join(', ') || '—'}
            </p>
            <div className="text-xs text-gray-500">Key risks</div>
            <ul className="list-disc space-y-1 pl-5 text-xs text-gray-400">
              {(pkg.intelligenceJson as ExecutionIntelligencePayload).moduleSpecificRisks?.length ? (
                (pkg.intelligenceJson as ExecutionIntelligencePayload).moduleSpecificRisks!.slice(0, 8).map((r, idx) => (
                  <li key={idx}>{r}</li>
                ))
              ) : (
                <li>—</li>
              )}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No intelligence payload stored on this package.</p>
        )}
      </Card>

      <Card padding="md" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium text-white">Implementation readiness bundle</h2>
            <p className="mt-1 text-xs text-gray-500">
              Generates acceptance criteria, regression/test suggestions, readiness scoring, migration risk notes, and
              fixture ideas. This is advisory metadata only (no code execution, no live data mutation).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => void postReadinessAction('/generate-acceptance')} disabled={busy}>
              Regenerate acceptance
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void postReadinessAction('/generate-test-plan')} disabled={busy}>
              Regenerate test plan
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void postReadinessAction('/generate-readiness')} disabled={busy}>
              Regenerate readiness
            </Button>
            <Button size="sm" onClick={() => void postReadinessAction('/generate-implementation-readiness')} disabled={busy}>
              Regenerate full bundle
            </Button>
          </div>
        </div>

        {!implementationReadiness ? (
          <p className="text-sm text-gray-500">
            No implementation readiness payload yet. Use &quot;Regenerate full bundle&quot; (or recreate the package) to
            populate acceptance, tests, scoring, and migration notes.
          </p>
        ) : (
          <div className="space-y-6">
            <div className="rounded border border-surface-border bg-surface-overlay p-4">
              <div className="text-xs text-gray-500">Readiness score</div>
              <div className="mt-1 flex flex-wrap items-end gap-3">
                <div className="text-3xl font-semibold text-white">{readinessScore?.score ?? '—'}</div>
                <Badge
                  variant={
                    readinessScore?.band === 'READY' ? 'success' : readinessScore?.band === 'HIGH' ? 'info' : 'warning'
                  }
                >
                  {readinessScore?.band ?? '—'}
                </Badge>
              </div>
              {readinessScore?.gaps?.length ? (
                <div className="mt-3 text-xs text-gray-400">
                  <div className="text-gray-500">Gaps</div>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {readinessScore.gaps.slice(0, 10).map((g, i) => (
                      <li key={i}>{g}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {readinessScore?.recommendations?.length ? (
                <div className="mt-3 text-xs text-gray-400">
                  <div className="text-gray-500">Recommendations</div>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {readinessScore.recommendations.slice(0, 10).map((g, i) => (
                      <li key={i}>{g}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div>
              <h3 className="text-sm font-medium text-white">Acceptance criteria</h3>
              <div className="mt-2 space-y-2">
                {(implementationReadiness.acceptanceCriteria || []).slice(0, 60).map((c: AcceptanceCriterion) => (
                  <div key={c.id} className="rounded border border-surface-border bg-surface-overlay p-3 text-xs text-gray-300">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-gray-500">{c.id}</span>
                      <span className="text-gray-500">
                        {c.category} · {c.priority} · {c.verificationType} · {c.source}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-gray-100">{c.description}</p>
                    <p className="mt-1 text-gray-500">{c.rationale}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-white">Regression and test plan</h3>
              <div className="mt-2 space-y-2">
                {(implementationReadiness.regressionPlan || []).map((t: RegressionTestSuggestion) => (
                  <div key={t.id} className="rounded border border-surface-border bg-surface-overlay p-3 text-xs text-gray-300">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm text-gray-100">{t.title}</div>
                      <span className="text-gray-500">
                        {t.type} · {t.area} · {t.riskLevel}
                      </span>
                    </div>
                    <p className="mt-2 text-gray-300">{t.description}</p>
                    <p className="mt-1 text-gray-500">Expected: {t.expectedOutcome}</p>
                    {t.relatedAcceptanceCriteriaIds?.length ? (
                      <p className="mt-1 text-[11px] text-gray-600">Linked AC: {t.relatedAcceptanceCriteriaIds.join(', ')}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-white">Migration risk summary</h3>
              {implementationReadiness.migrationRiskSummary ? (
                <MigrationRiskSummaryView summary={implementationReadiness.migrationRiskSummary as MigrationRiskSummary} />
              ) : (
                <p className="mt-2 text-xs text-gray-500">
                  No schema-impacting migration summary for this package type (or no schema plan signal).
                </p>
              )}
            </div>

            <div>
              <h3 className="text-sm font-medium text-white">Fixture / seed suggestions</h3>
              <p className="mt-1 text-xs text-gray-500">Suggestions only — do not auto-seed production data.</p>
              <div className="mt-2 space-y-2">
                {(implementationReadiness.fixtureSuggestions || []).map((f: FixtureSuggestion) => (
                  <div key={f.label} className="rounded border border-surface-border bg-surface-overlay p-3 text-xs text-gray-300">
                    <div className="text-sm text-gray-100">
                      {f.label} <span className="text-gray-500">({f.module})</span>
                    </div>
                    <p className="mt-2 text-gray-300">{f.purpose}</p>
                    <p className="mt-1 text-gray-500">When: {f.whenToUse}</p>
                    <p className="mt-1 text-gray-600">Fields: {f.suggestedFields.join(', ')}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded border border-surface-border bg-surface-overlay p-4 space-y-3">
              <h3 className="text-sm font-medium text-white">Acknowledge known gaps</h3>
              <p className="text-xs text-gray-500">
                Use this when you intentionally accept residual risk (for example, missing workflow snapshot in lower
                environments). This does not bypass governance controls.
              </p>
              <div>
                <label className="label-caps mb-1.5 block text-gray-500">Note (optional)</label>
                <textarea
                  className="w-full rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-sm text-gray-100"
                  rows={3}
                  value={gapNote}
                  onChange={(e) => setGapNote(e.target.value)}
                />
              </div>
              <Button variant="secondary" onClick={() => void acknowledgeGaps()} disabled={busy}>
                Record gap acknowledgment
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card padding="md" className="space-y-3">
        <h2 className="text-lg font-medium text-white">Governance</h2>
        <p className="text-xs text-gray-500">
          Status transitions are enforced server-side. Cursor handoff generation requires package status READY and does
          not execute code.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label-caps mb-1.5 block text-gray-500">Package status</label>
            <select
              value={nextStatus}
              onChange={(e) => setNextStatus(e.target.value)}
              className="rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-gray-100"
            >
              <option value="DRAFT">DRAFT</option>
              <option value="READY">READY</option>
              <option value="SENT_TO_DEV">SENT_TO_DEV</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
          </div>
          <Button variant="secondary" onClick={() => void applyStatus()} disabled={busy}>
            Update status
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label-caps mb-1.5 block text-gray-500">Assign package owner (user)</label>
            <select
              value={assigneeUserId}
              onChange={(e) => setAssigneeUserId(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-gray-100"
            >
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.firstName} {u.lastName} ({u.email})
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button variant="secondary" onClick={() => void applyAssignee()} disabled={busy}>
              Save assignee
            </Button>
          </div>
        </div>
      </Card>

      <Card padding="md" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium text-white">Cursor handoff</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void loadHandoff()} disabled={busy}>
              Refresh handoff
            </Button>
            <Button onClick={() => void generateHandoff()} disabled={busy || pkg.status !== 'READY'}>
              Generate handoff
            </Button>
            <Button variant="secondary" onClick={() => exportHandoffJson()} disabled={!handoff?.exportPayloadJson}>
              Export handoff JSON
            </Button>
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Generate is enabled only when the package is READY. Export produces a read-only JSON artifact for Cursor or a
          developer workflow.
        </p>
        {handoff ? (
          <div className="space-y-2 text-xs text-gray-400">
            <div>
              Latest handoff: <span className="text-gray-200">{handoff.id}</span> ({handoff.status}) —{' '}
              {new Date(handoff.createdAt).toLocaleString()}
            </div>
            <pre className="max-h-[28vh] overflow-auto rounded border border-surface-border bg-surface-overlay p-3 text-[11px] text-gray-200">
              {handoff.handoffPrompt.slice(0, 8000)}
            </pre>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No handoff generated yet.</p>
        )}
      </Card>

      <Card padding="md" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium text-white">Bundle payload</h2>
          <Button variant="secondary" onClick={() => exportPackageJson()}>
            Export payload JSON
          </Button>
        </div>
        <pre className="max-h-[32vh] overflow-auto rounded border border-surface-border bg-surface-overlay p-3 text-xs text-gray-200">
          {JSON.stringify(pkg.payloadJson, null, 2)}
        </pre>
      </Card>

      <Card padding="md" className="space-y-3">
        <h2 className="text-lg font-medium text-white">Review checklist</h2>
        <div className="space-y-3">
          <div>
            <div className="mb-2 text-xs text-gray-500">Template / module intelligence rows</div>
            <ul className="space-y-2 text-sm text-gray-200">
              {(pkg.checklistJson || [])
                .filter((c) => c.category === 'intelligence')
                .map((c) => (
                  <li key={c.id} className="rounded border border-surface-border bg-surface-overlay p-2">
                    <span className="text-xs text-gray-500">{c.category}</span>
                    <div>{c.text}</div>
                  </li>
                ))}
              {(pkg.checklistJson || []).filter((c) => c.category === 'intelligence').length === 0 ? (
                <li className="text-xs text-gray-600">None</li>
              ) : null}
            </ul>
          </div>
          <div>
            <div className="mb-2 text-xs text-gray-500">Core checklist</div>
            <ul className="space-y-2 text-sm text-gray-200">
              {(pkg.checklistJson || [])
                .filter((c) => c.category !== 'intelligence')
                .map((c) => (
                  <li key={c.id} className="rounded border border-surface-border bg-surface-overlay p-2">
                    <span className="text-xs text-gray-500">{c.category}</span>
                    <div>{c.text}</div>
                  </li>
                ))}
            </ul>
          </div>
        </div>
      </Card>

      <Card padding="md" className="space-y-4">
        <h2 className="text-lg font-medium text-white">Execution tasks</h2>
        <p className="text-xs text-gray-500">Tasks are ordered and editable; saving writes an audit-friendly agent run log entry.</p>
        {(pkg.tasks || []).map((t) => (
          <div key={t.id} className="space-y-2 rounded border border-surface-border bg-surface-overlay p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-gray-500">
                {t.taskType} · order {t.orderIndex} · {t.status}
              </div>
              <Button size="sm" variant="secondary" onClick={() => void saveTask(t.id)} disabled={busy}>
                Save task
              </Button>
            </div>
            <Input
              label="Title"
              value={taskDrafts[t.id]?.title ?? ''}
              onChange={(e) =>
                setTaskDrafts((prev) => ({ ...prev, [t.id]: { ...(prev[t.id] || { title: '', description: '' }), title: e.target.value } }))
              }
            />
            <div>
              <label className="label-caps mb-1.5 block text-gray-500">Description</label>
              <textarea
                className="w-full rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-sm text-gray-100"
                rows={4}
                value={taskDrafts[t.id]?.description ?? ''}
                onChange={(e) =>
                  setTaskDrafts((prev) => ({
                    ...prev,
                    [t.id]: { ...(prev[t.id] || { title: '', description: '' }), description: e.target.value },
                  }))
                }
              />
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
