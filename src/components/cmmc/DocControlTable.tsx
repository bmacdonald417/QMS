import { Card } from '@/components/ui';

interface DocControlTableProps {
  code: string;
  title: string;
  kind: string;
  qmsDocType: string;
  version?: string;
  date?: string;
  status: string;
  reviewCadence?: string | null;
  nextReviewDue?: string | null;
  hash?: string | null;
}

export function DocControlTable({
  code,
  title,
  kind,
  qmsDocType,
  version,
  date,
  status,
  reviewCadence,
  nextReviewDue,
  hash,
}: DocControlTableProps) {
  return (
    <Card variant="bordered" padding="md" className="mb-6">
      <h3 className="text-sm font-semibold text-gray-300 mb-4">Document Control</h3>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-500">Code:</span>
          <span className="ml-2 text-white font-mono">{code}</span>
        </div>
        <div>
          <span className="text-gray-500">Title:</span>
          <span className="ml-2 text-white">{title}</span>
        </div>
        <div>
          <span className="text-gray-500">Kind:</span>
          <span className="ml-2 text-white">{kind}</span>
        </div>
        <div>
          <span className="text-gray-500">QMS Doc Type:</span>
          <span className="ml-2 text-white">{qmsDocType}</span>
        </div>
        <div>
          <span className="text-gray-500">Version:</span>
          <span className="ml-2 text-white">{version || '—'}</span>
        </div>
        <div>
          <span className="text-gray-500">Date:</span>
          <span className="ml-2 text-white">{date || '—'}</span>
        </div>
        <div>
          <span className="text-gray-500">Status:</span>
          <span className="ml-2 text-white">{status}</span>
        </div>
        <div>
          <span className="text-gray-500">Review Cadence:</span>
          <span className="ml-2 text-white">{reviewCadence || '—'}</span>
        </div>
        {nextReviewDue && (
          <div>
            <span className="text-gray-500">Next Review Due:</span>
            <span className="ml-2 text-white">{nextReviewDue}</span>
          </div>
        )}
        {hash && (
          <div className="col-span-2">
            <span className="text-gray-500">Hash:</span>
            <span className="ml-2 text-white font-mono text-xs break-all">{hash}</span>
          </div>
        )}
      </div>
    </Card>
  );
}