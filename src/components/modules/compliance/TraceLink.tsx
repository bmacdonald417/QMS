import { Link } from 'react-router-dom';
import { FileText, ClipboardCheck, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui';
import type { BadgeVariant } from '@/components/ui';

export type TraceLinkType = 'document' | 'audit_finding' | 'capa' | 'deviation';

export interface TraceLinkProps {
  type: TraceLinkType;
  id: string;
  label: string;
  status?: string;
}

const typeConfig: Record<
  TraceLinkType,
  { icon: React.ReactNode; basePath: string; variant: BadgeVariant }
> = {
  document: { icon: <FileText className="h-4 w-4" />, basePath: '/documents', variant: 'info' },
  audit_finding: {
    icon: <ClipboardCheck className="h-4 w-4" />,
    basePath: '/audits',
    variant: 'warning',
  },
  capa: { icon: <AlertTriangle className="h-4 w-4" />, basePath: '/capa', variant: 'default' },
  deviation: { icon: <FileText className="h-4 w-4" />, basePath: '/documents', variant: 'danger' },
};

/**
 * Unified traceability: link CAPA ↔ Audit Finding ↔ Document Deviation.
 */
export function TraceLink({ type, id, label, status }: TraceLinkProps) {
  const config = typeConfig[type];
  const href = `${config.basePath}/${id}`;

  return (
    <Link
      to={href}
      className="inline-flex items-center gap-2 rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-sm text-gray-200 hover:bg-surface-overlay hover:border-mactech-blue/50 transition-all duration-200"
    >
      <span className="text-gray-500">{config.icon}</span>
      <span className="font-medium truncate max-w-[200px]">{label}</span>
      {status && (
        <Badge variant={config.variant} size="sm">
          {status}
        </Badge>
      )}
    </Link>
  );
}
