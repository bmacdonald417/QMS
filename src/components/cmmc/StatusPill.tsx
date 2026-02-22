import { Badge } from '@/components/ui';

interface StatusPillProps {
  status: 'DRAFT' | 'IN_REVIEW' | 'EFFECTIVE' | 'RETIRED';
}

const statusConfig: Record<StatusPillProps['status'], { variant: 'default' | 'info' | 'success' | 'warning' | 'neutral' | 'danger'; label: string }> = {
  DRAFT: { variant: 'neutral', label: 'Draft' },
  IN_REVIEW: { variant: 'warning', label: 'In Review' },
  EFFECTIVE: { variant: 'success', label: 'Effective' },
  RETIRED: { variant: 'default', label: 'Retired' },
};

export function StatusPill({ status }: StatusPillProps) {
  const config = statusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}