import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { Plus, ArrowLeft } from 'lucide-react';

export interface PageShellProps {
  title: string;
  subtitle?: string;
  primaryAction?: { label: string; onClick: () => void };
  backLink?: { label: string; href: string };
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
  backLink,
  children,
  sidePanel,
}: PageShellProps) {
  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0">
        {backLink && (
          <Link
            to={backLink.href}
            className="mb-3 inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLink.label}
          </Link>
        )}
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
