export type QmsModuleDefinition = {
  moduleKey: string;
  displayName: string;
  description: string;
  commonEntities: string[];
  commonRoles: string[];
  commonStatuses: string[];
  commonWorkflowPatterns: string[];
  commonAuditRequirements: string[];
  commonTrainingLinkageRules: string[];
  commonNotificationPatterns: string[];
  commonUIAreas: string[];
  commonSchemaPatterns: string[];
  commonRisks: string[];
  validationHints: string[];
};

export type WorkflowTemplateDefinition = {
  templateKey: string;
  templateName: string;
  targetModules: string[];
  objective: string;
  defaultStates: Array<{ stateKey: string; label: string; sortOrder: number }>;
  defaultTransitions: Array<{ from: string; to: string; label?: string | null; rolesJson?: unknown }>;
  defaultRoles: string[];
  approvalModel: string;
  auditRequirements: string[];
  notificationRules: string[];
  trainingLinkageRules: string[];
  uiRecommendations: string[];
  schemaRecommendations: string[];
};

export type ExecutionIntelligencePayload = {
  module: QmsModuleDefinition | Record<string, unknown>;
  suggestedTemplate: Record<string, unknown> | null;
  inferredModuleKey: string | null;
  suggestedTemplateKey: string | null;
  effectiveModuleKey: string | null;
  effectiveTemplateKey: string | null;
  affectedEntities: string[];
  affectedUiAreas: string[];
  likelyBackendTouchpoints: string[];
  affectedSchemaAreas: string[];
  moduleSpecificRisks: string[];
  validationChecklistAdditions: string[];
  engineeringNotes: string[];
  /** Short checklist-style strings (legacy / module-aware hints). */
  acceptanceCriteria: string[];
  inferenceScores?: Record<string, number>;
};

export type AcceptancePriority = 'HIGH' | 'MEDIUM' | 'LOW';

export type VerificationType = 'MANUAL' | 'AUTOMATED' | 'DB_REVIEW' | 'UI_REVIEW' | 'API_REVIEW';

export type CriterionSource = 'MODULE' | 'TEMPLATE' | 'TASK' | 'SCHEMA' | 'WORKFLOW';

export type AcceptanceCriterion = {
  id: string;
  category: string;
  description: string;
  rationale: string;
  priority: AcceptancePriority;
  verificationType: VerificationType;
  source: CriterionSource;
  moduleKey?: string;
  effectiveModuleKey?: string | null;
  effectiveTemplateKey?: string | null;
  scopeTextStrength?: number;
};

export type RegressionTestType = 'UNIT' | 'INTEGRATION' | 'E2E' | 'MANUAL' | 'DB_VALIDATION';

export type RegressionTestSuggestion = {
  id: string;
  title: string;
  type: RegressionTestType;
  area: string;
  description: string;
  expectedOutcome: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  relatedAcceptanceCriteriaIds: string[];
};

export type ReadinessBand = 'LOW' | 'MEDIUM' | 'HIGH' | 'READY';

export type ReadinessDimensionScore = {
  key: string;
  label: string;
  score: number;
  notes?: string;
  weight?: number;
};

export type ReadinessScore = {
  score: number;
  band: ReadinessBand;
  dimensionScores: ReadinessDimensionScore[];
  strengths: string[];
  gaps: string[];
  recommendations: string[];
};

export type MigrationRiskSummary = {
  summary: string;
  impactedTables: string[];
  backwardsCompatibility: string[];
  nullabilityRisks: string[];
  indexPerformance: string[];
  seedBackfill: string[];
  auditRetention: string[];
  trainingDocumentRisks: string[];
  rolloutCautions: string[];
  destructiveWarnings: string[];
  workflowNotes?: string[];
};

export type FixtureSuggestion = {
  label: string;
  module: string;
  purpose: string;
  suggestedFields: string[];
  whenToUse: string;
};

export type ReadinessGapsAcknowledged = {
  at: string;
  userId: string;
  note?: string | null;
};

export type ImplementationReadinessPayload = {
  version?: number;
  generatedAt?: string;
  acceptanceCriteria: AcceptanceCriterion[];
  regressionPlan: RegressionTestSuggestion[];
  readinessScore: ReadinessScore;
  migrationRiskSummary: MigrationRiskSummary | null;
  fixtureSuggestions: FixtureSuggestion[];
  completionGuidance: string[];
  unresolvedGaps: string[];
  gapsAcknowledged?: ReadinessGapsAcknowledged | null;
};

export type ModuleAnalysisResult = {
  requestId: string;
  inferredModuleKey: string | null;
  suggestedTemplateKey: string | null;
  effectiveModuleKey: string | null;
  effectiveTemplateKey: string | null;
  module: QmsModuleDefinition | null;
  template: WorkflowTemplateDefinition | null;
  rankedTemplates: Array<{ templateKey: string; score: number; name: string }>;
  scores: Record<string, number>;
};

/** Mirrors `payload_json` on `ExecutionPackage` (structured engineering bundle). */
export type ExecutionPackagePayload = {
  requestSummary: string;
  packageType: string;
  approvedScope: string[];
  affectedAreas: string[];
  sourceArtifacts: {
    implementationPlan?: Record<string, unknown>;
    workflowSpec?: Record<string, unknown>;
    schemaPlan?: Record<string, unknown>;
  };
  checklist: Array<{ id: string; category: string; text: string }>;
  tasks: Array<{
    title: string;
    description: string;
    taskType: string;
    orderIndex: number;
    metadata?: Record<string, unknown>;
  }>;
  risks: string[];
  constraints: string[];
  intelligence?: ExecutionIntelligencePayload;
  implementationReadiness?: ImplementationReadinessPayload;
};

/** Mirrors `export_payload_json` on `CursorHandoff` (Cursor / developer export). */
export type CursorHandoffPayload = {
  summary: string;
  prompt: string;
  repoContext: Record<string, unknown>;
  fileTargets: string[];
  schemaContext: Record<string, unknown>;
  workflowContext: Record<string, unknown>;
  deliverables: string[];
  warnings: string[];
  intelligence?: ExecutionIntelligencePayload | null;
  acceptanceCriteria?: string[];
  /** Structured engineering bundle (acceptance + tests + readiness + risks). */
  implementationReadiness?: ImplementationReadinessPayload | null;
  readinessScoreSummary?: ReadinessScore | null;
  unresolvedGaps?: string[];
  gapsAcknowledged?: ReadinessGapsAcknowledged | null;
  moduleAntiPatterns?: string[];
};

export const PRIMARY_ORG_SLUG = 'primary';
