/**
 * Immutable audit trail entry — GxP requirement.
 * Every significant change is logged with user, timestamp, and action.
 */
export interface AuditTrailEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: 'create' | 'update' | 'delete' | 'approve' | 'reject' | 'sign';
  userId: string;
  userName: string;
  timestamp: string; // ISO 8601
  changes?: Record<string, { from: unknown; to: unknown }>;
  reason?: string;
  signatureId?: string;
}

export interface AuditTrailState {
  entries: AuditTrailEntry[];
  loading: boolean;
}
