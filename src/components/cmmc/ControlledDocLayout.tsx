import { useState } from 'react';
import { Card } from '@/components/ui';
import { DocControlTable } from './DocControlTable';
import { DocTOC } from './DocTOC';
import { WatermarkOverlay } from './WatermarkOverlay';
import { StatusPill } from './StatusPill';
import { CmmcMarkdownRenderer } from './CmmcMarkdownRenderer';
import { FileText, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui';

interface ControlledDocLayoutProps {
  code: string;
  title: string;
  kind: string;
  qmsDocType: string;
  version?: string;
  date?: string;
  status: 'DRAFT' | 'IN_REVIEW' | 'EFFECTIVE' | 'RETIRED';
  reviewCadence?: string | null;
  nextReviewDue?: string | null;
  hash?: string | null;
  content: string;
  showCoverPage?: boolean;
}

export function ControlledDocLayout({
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
  content,
  showCoverPage: initialShowCoverPage = false,
}: ControlledDocLayoutProps) {
  const [showCoverPage, setShowCoverPage] = useState(initialShowCoverPage);

  return (
    <div className="relative">
      <WatermarkOverlay status={status} />

      {showCoverPage && (
        <Card variant="elevated" padding="lg" className="mb-8 min-h-[600px] flex flex-col justify-center">
          <div className="text-center">
            <div className="mb-8">
              <FileText className="w-16 h-16 text-mactech-blue mx-auto mb-4" />
              <h1 className="text-4xl font-bold text-white mb-2">{title}</h1>
              <div className="text-xl text-gray-400 font-mono mb-4">{code}</div>
              <StatusPill status={status} />
            </div>
            <div className="space-y-2 text-gray-300">
              {version && <div>Version: {version}</div>}
              {date && <div>Date: {date}</div>}
              {reviewCadence && <div>Review Cadence: {reviewCadence}</div>}
            </div>
          </div>
        </Card>
      )}

      <div className="flex gap-6">
        {/* Main Content */}
        <div className="flex-1">
          <div className="mb-4 flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowCoverPage(!showCoverPage)}
            >
              {showCoverPage ? (
                <>
                  <EyeOff className="w-4 h-4 mr-2" />
                  Hide Cover Page
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 mr-2" />
                  Show Cover Page
                </>
              )}
            </Button>
          </div>

          <DocControlTable
            code={code}
            title={title}
            kind={kind}
            qmsDocType={qmsDocType}
            version={version}
            date={date}
            status={status}
            reviewCadence={reviewCadence}
            nextReviewDue={nextReviewDue}
            hash={hash}
          />

          <Card variant="elevated" padding="lg">
            <CmmcMarkdownRenderer content={content} />
          </Card>

          {/* Footer */}
          <div className="mt-8 pt-4 border-t border-surface-border text-center text-sm text-gray-500">
            <div className="font-mono">{code}</div>
            {version && <div>Version {version}</div>}
            <div className="mt-2">Classification: Internal Use</div>
          </div>
        </div>

        {/* Sidebar - TOC */}
        <div className="w-64 flex-shrink-0">
          <DocTOC content={content} />
        </div>
      </div>
    </div>
  );
}