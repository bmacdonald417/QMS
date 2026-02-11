import { type AuditTrailEntry } from '@/types/audit';
import { Card } from '@/components/ui';
import { History } from 'lucide-react';

export interface AuditTrailPanelProps {
  entries: AuditTrailEntry[];
  loading?: boolean;
  title?: string;
}

export function AuditTrailPanel({
  entries,
  loading = false,
  title = 'History',
}: AuditTrailPanelProps) {
  return (
    <Card variant="bordered" padding="md">
      <div className="flex items-center gap-2 mb-3">
        <History className="h-5 w-5 text-gray-500" />
        <h3 className="text-sm font-medium text-gray-300">{title}</h3>
      </div>
      {loading ? (
        <p className="text-sm text-gray-500">Loading history…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-gray-500">No history recorded.</p>
      ) : (
        <ul className="space-y-2 max-h-64 overflow-y-auto">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="text-xs border-l-2 border-surface-border pl-3 py-1"
            >
              <span className="text-gray-400">{entry.timestamp}</span>
              <span className="text-gray-500 mx-1">·</span>
              <span className="text-gray-300">{entry.userName}</span>
              <span className="text-gray-500 mx-1">{entry.action}</span>
              {entry.reason && (
                <span className="text-gray-500 block mt-0.5">{entry.reason}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
