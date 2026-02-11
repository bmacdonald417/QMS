import { type ReactNode } from 'react';
import { Button } from '@/components/ui';
import { Plus } from 'lucide-react';

export interface PageShellProps {
  title: string;
  subtitle?: string;
  primaryAction?: { label: string; onClick: () => void };
  children: ReactNode;
  sidePanel?: ReactNode;
}

/**
 * Consistent page header + primary content + optional side panel (e.g. History).
 */
export function PageShell({
  title,
  subtitle,
  primaryAction,
  children,
  sidePanel,
}: PageShellProps) {
  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1>{title}</h1>
            {subtitle && <p className="text-gray-500 mt-1">{subtitle}</p>}
          </div>
          {primaryAction && (
            <Button
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={primaryAction.onClick}
            >
              {primaryAction.label}
            </Button>
          )}
        </div>
        {children}
      </div>
      {sidePanel && <aside className="w-72 flex-shrink-0">{sidePanel}</aside>}
    </div>
  );
}
